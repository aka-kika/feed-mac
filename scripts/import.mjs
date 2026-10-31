import {readFileSync,mkdirSync,writeFileSync,existsSync,renameSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {sql,dataDir} from '../server/storage.mjs';
const id=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v);
const hash=b=>createHash('sha256').update(b).digest('hex');
const input=JSON.parse(readFileSync(process.argv[2],'utf8'));
if(input.format!=='feed-portable-v1'||!Array.isArray(input.reports))throw Error('Not a Feed export');
const columns=['id','source','run_id','routine','title','markdown','published_at','received_at','favourite','is_read','sample','archived'];
const staged=[];let added=0,skipped=0,filled=0,committed=false;
// Validate the complete input and all bytes before changing the database.
const seen=new Set();for(const {report:r,comments,attachments} of input.reports){
 if(!id(r.id)||seen.has(r.id)||!Array.isArray(comments)||!Array.isArray(attachments))throw Error('Invalid or duplicate report');seen.add(r.id);
 for(const k of columns)if(r[k]===undefined)throw Error('Missing report field');
 for(const k of ['source','run_id','routine','title','markdown','published_at','received_at'])if(typeof r[k]!=='string')throw Error('Invalid report text');
 for(const k of ['favourite','is_read','sample','archived'])if(![0,1].includes(r[k]))throw Error('Invalid report state');
 // Exports from before Saved have no saved_at.
 if(r.saved_at!==undefined&&r.saved_at!==null&&typeof r.saved_at!=='string')throw Error('Invalid report state');
 // Exports from before ticks have none.
 if(r.ticks!==undefined&&!(Array.isArray(r.ticks)&&r.ticks.every(b=>Number.isInteger(b)&&b>0)))throw Error('Invalid report state');
 for(const c of comments)if(!id(c.id)||typeof c.body!=='string'||typeof c.created_at!=='string')throw Error('Invalid comment');
 for(const a of attachments){if(!id(a.id)||typeof a.name!=='string'||typeof a.type!=='string'||typeof a.base64!=='string')throw Error('Invalid attachment');const b=Buffer.from(a.base64,'base64');if(b.length!==a.size||hash(b)!==a.sha256)throw Error('Attachment checksum mismatch');}
}
// Restoring only adds. A report still here keeps what it has and gets back what it lost: its Saved time, star, read mark, ticks, comments and attachments.
const place=(r,a)=>{
 const p=join(dataDir,'attachments',r.id,a.id);
 if(existsSync(p)){if(hash(readFileSync(p))!==a.sha256)throw Error('Attachment already exists with other bytes; inspect before retry');return false;}
 mkdirSync(dirname(p),{recursive:true,mode:0o700});writeFileSync(p+'.import',Buffer.from(a.base64,'base64'),{mode:0o600});staged.push(p);return true;
};
sql.exec('BEGIN IMMEDIATE');
try{
 for(const {report:r,comments,attachments} of input.reports){
  const existing=sql.prepare('SELECT * FROM reports WHERE id=?').get(r.id);
  if(existing){
   if(existing.markdown!==r.markdown||existing.title!==r.title||existing.source!==r.source)throw Error('Existing report differs; import stopped');
   const state=(existing.saved_at===null&&r.saved_at?1:0)+(r.favourite>existing.favourite?1:0)+(r.is_read>existing.is_read?1:0);
   if(state)sql.prepare('UPDATE reports SET saved_at=coalesce(saved_at,?),favourite=max(favourite,?),is_read=max(is_read,?) WHERE id=?').run(r.saved_at??null,r.favourite,r.is_read,r.id);
   filled+=state;skipped++;
  }else{
   // Original request hash is private and absent from owner API export. Preserve run IDs;
   // historical deliveries intentionally conflict rather than falsely deduplicate different content.
   sql.prepare(`INSERT INTO reports (${columns.join(',')},saved_at,owner,payload_hash) VALUES (${columns.map(()=>'?').join(',')},?,?,?)`).run(...columns.map(k=>r[k]),r.saved_at??null,'local-owner','imported:'+hash(r.markdown));
   added++;
  }
  const count=n=>{if(existing)filled+=n;};
  for(const box of new Set(r.ticks??[]))count(sql.prepare('INSERT INTO report_ticks (report_id,box,ticked_at) VALUES (?,?,?) ON CONFLICT(report_id,box) DO NOTHING').run(r.id,box,new Date().toISOString()).changes);
  for(const c of comments){
   const had=sql.prepare('SELECT report_id,body FROM comments WHERE id=?').get(c.id);
   if(had){if(had.report_id!==r.id||had.body!==c.body)throw Error('Existing comment differs; import stopped');continue;}
   sql.prepare('INSERT INTO comments (id,report_id,owner,body,created_at) VALUES (?,?,?,?,?)').run(c.id,r.id,'local-owner',c.body,c.created_at);count(1);
  }
  for(const a of attachments){
   const had=sql.prepare('SELECT report_id,size FROM attachments WHERE id=?').get(a.id);
   if(had&&(had.report_id!==r.id||had.size!==a.size))throw Error('Existing attachment differs; import stopped');
   if(!had){sql.prepare('INSERT INTO attachments (id,report_id,name,type,size,object_key) VALUES (?,?,?,?,?,?)').run(a.id,r.id,a.name,a.type,a.size,r.id+'/'+a.id);count(1);}
   if(place(r,a)&&had)count(1);
  }
 }
 // Files take their final names after the commit. A crash in between leaves a row without its file, and running the import again puts the file back.
 sql.exec('COMMIT');committed=true;
 for(const p of staged)renameSync(p+'.import',p);
 console.log(JSON.stringify({imported:added,already_present:skipped,filled,total:sql.prepare('SELECT count(*) n FROM reports').get().n}));
}catch(e){
 if(committed)throw Error(`The reports are in, but an attachment file could not be put in place (${e.message}). Run the same import again to finish.`);
 sql.exec('ROLLBACK');for(const p of staged)rmSync(p+'.import',{force:true});throw e;
}finally{sql.close();}
