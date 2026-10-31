import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
// Writes everything scripts/import.mjs can restore to one JSON file. It holds private reports: keep it as safe as the data folder. Stop Feed first so the database and attachments are one point in time.
const source=resolve(process.env.FEED_DATA_DIR||join(homedir(),'Library/Application Support/Feed'));
if(!process.argv[2])throw Error('Choose a file to write: node scripts/export.mjs <export.json>');
const target=resolve(process.argv[2]);if(target.startsWith(source+'/'))throw Error('Choose a file outside the data folder');
const sql=new DatabaseSync(join(source,'feed.sqlite'),{readOnly:true}),missing=[];
const reports=sql.prepare('SELECT * FROM reports WHERE sample=0 ORDER BY published_at,id').all().map(({owner,payload_hash,...report})=>{
 const comments=sql.prepare('SELECT id,body,created_at FROM comments WHERE report_id=? ORDER BY created_at,id').all(report.id);
 const ticks=sql.prepare('SELECT box FROM report_ticks WHERE report_id=? ORDER BY box').all(report.id).map(t=>t.box);
 const attachments=sql.prepare('SELECT id,name,type,size,object_key FROM attachments WHERE report_id=?').all(report.id).flatMap(({object_key,...a})=>{
  const p=join(source,'attachments',object_key);
  if(!existsSync(p)){missing.push(object_key);return [];}
  const bytes=readFileSync(p);return [{...a,size:bytes.length,base64:bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex')}];
 });
 return {report:{...report,ticks},comments,attachments};
});
sql.close();
writeFileSync(target,JSON.stringify({format:'feed-portable-v1',exported_at:new Date().toISOString(),reports}),{flag:'wx',mode:0o600});
console.log(JSON.stringify({exported:reports.length,missing_attachments:missing}));
