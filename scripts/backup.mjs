import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,cpSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {homedir} from 'node:os';
// Stop Feed before this command so database + attachments represent one point in time.
const source=resolve(process.env.FEED_DATA_DIR||join(homedir(),'Library/Application Support/Feed'));
const target=resolve(process.argv[2]||'');if(!process.argv[2]||target.startsWith(source))throw Error('Choose a new backup folder outside the data folder');
mkdirSync(target,{mode:0o700});const sql=new DatabaseSync(join(source,'feed.sqlite'),{readOnly:true});await backup(sql,join(target,'feed.sqlite'));sql.close();
for(const name of ['attachments','config.json']){try{cpSync(join(source,name),join(target,name),{recursive:true,errorOnExist:true,force:false})}catch(e){if(e.code!=='ENOENT')throw e}}
console.log('Backup complete. Contains private reports and local authentication configuration.');
