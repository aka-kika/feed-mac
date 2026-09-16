import {readFileSync,mkdirSync,writeFileSync,existsSync,renameSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {sql,dataDir} from '../server/storage.mjs';
const id=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v);
const hash=b=>createHash('sha256').update(b).digest('hex');
const input=JSON.parse(readFileSync(process.argv[2],'utf8'));
if(input.format!=='feed-portable-v1'||!Array.isArray(input.reports))throw Error('Not a Feed export');
const columns=['id','source','run_id','routine','title','markdown','published_at','received_at','favourite','is_read','sample','archived'];
const staged=[];let added=0,skipped=0;
// Validate the complete input and all bytes before changing the database.
const seen=new Set();for(const {report:r,comments,attachments} of input.reports){
 if(!id(r.id)||seen.has(r.id)||!Array.isArray(comments)||!Array.isArray(attachments))throw Error('Invalid or duplicate report');seen.add(r.id);
 for(const k of columns)if(r[k]===undefined)throw Error('Missing report field');
 for(const k of ['source','run_id','routine','title','markdown','published_at','received_at'])if(typeof r[k]!=='string')throw Error('Invalid report text');
 for(const k of ['favourite','is_read','sample','archived'])if(![0,1].includes(r[k]))throw Error('Invalid report state');
 for(const c of comments)if(!id(c.id)||typeof c.body!=='string'||typeof c.created_at!=='string')throw Error('Invalid comment');
 for(const a of attachments){if(!id(a.id)||typeof a.name!=='string'||typeof a.type!=='string'||typeof a.base64!=='string')throw Error('Invalid attachment');const b=Buffer.from(a.base64,'base64');if(b.length!==a.size||hash(b)!==a.sha256)throw Error('Attachment checksum mismatch');}
}
sql.exec('BEGIN IMMEDIATE');
try{
 for(const {report:r,comments,attachments} of input.reports){
  const existing=sql.prepare('SELECT * FROM reports WHERE id=?').get(r.id);
  if(existing){if(existing.markdown!==r.markdown||existing.title!==r.title||existing.source!==r.source)throw Error('Existing report differs; import stopped');skipped++;continue;}
  for(const a of attachments){const p=join(dataDir,'attachments',r.id,a.id);if(existsSync(p))throw Error('Attachment already exists; inspect before retry');mkdirSync(dirname(p),{recursive:true,mode:0o700});writeFileSync(p+'.import',Buffer.from(a.base64,'base64'),{mode:0o600});staged.push(p);}
  // Original request hash is private and absent from owner API export. Preserve run IDs;
  // historical deliveries intentionally conflict rather than falsely deduplicate different content.
  sql.prepare(`INSERT INTO reports (${columns.join(',')},owner,payload_hash) VALUES (${columns.map(()=>'?').join(',')},?,?)`).run(...columns.map(k=>r[k]),'local-owner','imported:'+hash(r.markdown));
  for(const c of comments)sql.prepare('INSERT INTO comments (id,report_id,owner,body,created_at) VALUES (?,?,?,?,?)').run(c.id,r.id,'local-owner',c.body,c.created_at);
  for(const a of attachments)sql.prepare('INSERT INTO attachments (id,report_id,name,type,size,object_key) VALUES (?,?,?,?,?,?)').run(a.id,r.id,a.name,a.type,a.size,r.id+'/'+a.id);
  added++;
 }
 for(const p of staged)renameSync(p+'.import',p);
 sql.exec('COMMIT');
 console.log(JSON.stringify({imported:added,already_present:skipped,total:sql.prepare('SELECT count(*) n FROM reports').get().n}));
}catch(e){sql.exec('ROLLBACK');for(const p of staged){rmSync(p+'.import',{force:true});rmSync(p,{force:true});}throw e;}finally{sql.close();}
