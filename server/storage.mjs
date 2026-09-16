import {DatabaseSync} from 'node:sqlite';
import {AsyncLocalStorage} from 'node:async_hooks';
import {mkdirSync,readFileSync,writeFileSync,existsSync,renameSync,unlinkSync,readdirSync,chmodSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {homedir} from 'node:os';
export const dataDir=resolve(process.env.FEED_DATA_DIR||join(homedir(),'Library/Application Support/Feed'));
mkdirSync(dataDir,{recursive:true,mode:0o700});chmodSync(dataDir,0o700);
export const sql=new DatabaseSync(join(dataDir,'feed.sqlite'));
sql.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY)');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort()){
 if(sql.prepare('SELECT name FROM migrations WHERE name=?').get(name))continue;
 sql.exec('BEGIN');try{sql.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));sql.prepare('INSERT INTO migrations VALUES (?)').run(name);sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}
}
const statement=(query,args=[])=>({bind(...values){return statement(query,values)},async first(){return sql.prepare(query).get(...args)??null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){return sql.prepare(query).run(...args)},execute(){return sql.prepare(query).run(...args)}});
function objectPath(key){if(!/^[a-f0-9-]{36}\/[a-f0-9-]{36}$/.test(key))throw Error('Invalid attachment key');return join(dataDir,'attachments',key);}
export const env={DB:{prepare:statement,async batch(items){sql.exec('BEGIN');try{const out=items.map(s=>s.execute());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}},BUCKET:{async put(key,bytes){const p=objectPath(key);mkdirSync(dirname(p),{recursive:true,mode:0o700});writeFileSync(p+'.tmp',bytes,{mode:0o600});renameSync(p+'.tmp',p)},async get(key){const p=objectPath(key);return existsSync(p)?{body:readFileSync(p)}:null},async delete(key){const p=objectPath(key);if(existsSync(p))unlinkSync(p)}}};
export const auth=new AsyncLocalStorage();
// ntfy push on every new report. Optional: set "ntfy" in config.json ({url, topic, token, priority}). Never blocks or fails a publish.
const configPath=join(dataDir,'config.json');
const config=existsSync(configPath)?JSON.parse(readFileSync(configPath,'utf8')):{};
export function notify({title,message,click}){
 const n=config.ntfy;if(!n?.url||!n?.topic)return;
 const headers={'Content-Type':'application/json'};if(n.token)headers.Authorization=`Bearer ${n.token}`;
 fetch(n.url,{method:'POST',headers,body:JSON.stringify({topic:n.topic,title,message,click,priority:n.priority||3}),signal:AbortSignal.timeout(5000)})
  .then(r=>{if(!r.ok)console.error(`ntfy rejected notification (${r.status})`)})
  .catch(e=>console.error('ntfy unreachable',e.message));
}
export const publicOrigin=config.origin?new URL(config.origin).origin:null;
// Extra origins that reach the publish paths only (cloud agents), from "publishOrigins" in config.json.
export const publishOrigins=(config.publishOrigins||[]).map(o=>new URL(o).origin);
