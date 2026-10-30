import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,readFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,scryptSync,randomUUID,createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {request} from 'node:http';
const data=mkdtempSync(join(tmpdir(),'feed-mac-test-'));const port=19000+Math.floor(Math.random()*10000),origin=`http://127.0.0.1:${port}`;
const salt=randomBytes(16).toString('hex'),password='temporary-test-password';
writeFileSync(join(data,'config.json'),JSON.stringify({origin,port,salt,passwordHash:scryptSync(password,salt,64).toString('hex'),sessionSecret:randomBytes(32).toString('hex'),publishOrigins:['https://publish.example.test']}),{mode:0o600});
let child,logs='';
async function start(){child=spawn(process.execPath,['server/main.mjs'],{env:{...process.env,FEED_DATA_DIR:data},stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);for(let i=0;i<100;i++){try{if((await fetch(origin+'/health')).ok)return}catch{}await new Promise(r=>setTimeout(r,50));}throw Error('Server failed to start: '+logs)}
async function stop(){const c=child;await new Promise(r=>{c.once('exit',r);c.kill()});child=null}
const req=async(path,method='GET',body,headers={})=>fetch(origin+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined,redirect:'manual'});
try{
 await start();
 assert.equal((await req('/')).status,303);assert.equal((await req('/api/reports')).status,401);
 assert.equal((await req('/login')).status,200);
 assert.ok(((await req('/login')).headers.get('content-type')||'').includes('text/html'));
 assert.equal((await req('/login','HEAD')).status,200);
 assert.equal((await req('/favicon.ico')).status,200);
 assert.equal((await req('/icons/feed-v2-32.png')).status,200);
 assert.equal((await req('/assets/app.js')).status,303);
 assert.equal((await req('/api/reports','GET',null,{'oai-authenticated-user-id':'owner','tailscale-user-login':'owner'})).status,401);
 const login=await fetch(origin+'/login',{method:'POST',body:new URLSearchParams({password}),redirect:'manual'});assert.equal(login.status,303);
 const cookie=login.headers.get('set-cookie').split(';')[0],owner={Cookie:cookie};
 assert.equal((await req('/','GET',null,owner)).status,200);
 assert.equal((await req('/assets/app.js','GET',null,owner)).status,200);
 assert.equal((await req('/icons/feed-v2-180.png','GET',null,owner)).status,200);
 assert.equal((await req('/api/keys','POST',{source:'aka',label:'Aka'}, {...owner,Origin:'https://evil.test'})).status,403);
 const keyResponse=await req('/api/keys','POST',{source:'aka',label:'Aka'},owner);assert.equal(keyResponse.status,201);const key=await keyResponse.json();assert.ok(!key.instructions.includes('OAI-Sites-Authorization'));assert.ok(key.instructions.includes('https://publish.example.test/api/mcp/'+key.token),'path-token form');assert.ok(key.instructions.includes('30 publishes per key per minute'),'rate limit');
 // fetch drops a custom Host header, so the publish-origin 404 rule is checked over raw http.
 const rawStatus=(path,host,headers={})=>new Promise((ok,fail)=>{const r=request({host:'127.0.0.1',port,path,headers:{Host:host,...headers}},res=>{res.resume();ok(res.statusCode)});r.on('error',fail);r.end()});
 assert.equal(await rawStatus('/api/reports','publish.example.test',owner),404);assert.equal(await rawStatus('/','publish.example.test',owner),404);assert.equal(await rawStatus('/api/reports','evil.example.test',owner),403);
 assert.equal((await req('/api/keys','POST',{source:'minimax',label:'MiniMax'},owner)).status,201);
 assert.equal((await req('/api/keys','POST',{source:'gemini',label:'Gemini'},owner)).status,201);
 assert.equal((await req('/api/keys','POST',{source:'not-an-agent',label:'Nope'},owner)).status,400);
 for(const icon of ['gemini.svg','cursor-light.svg','cursor-dark.svg','kimi-dark.svg','opencode-light.svg'])assert.equal((await req('/agents/'+icon,'GET',null,owner)).status,200,icon);
 const agent={Authorization:'Bearer '+key.token};assert.equal((await req('/api/reports','GET',null,agent)).status,401);
 const payload={run_id:'local-scheduled-test',routine:'Local smoke test',title:'Full report',markdown:'# Heading\n\n| A | B |\n|---|---|\n|1|2|\n\n```js\nconst x = 1;\n```',attachments:[{name:'test.md',type:'text/markdown',base64:Buffer.from('attachment content').toString('base64')}]};
 let r=await req('/api/publish','POST',payload,agent);assert.equal(r.status,201);const report=await r.json();
 r=await req('/api/publish','POST',payload,agent);assert.equal(r.status,200);assert.equal((await r.json()).id,report.id);
 assert.equal((await req('/api/publish','POST',{...payload,title:'Changed'},agent)).status,409);
 const comment={id:randomUUID(),report_id:report.id,body:'Remember this'};
 assert.equal((await req('/api/comments','POST',comment,owner)).status,201);
 assert.equal((await req('/api/reports/'+report.id,'PATCH',{archived:true,favourite:true,is_read:true},owner)).status,200);
 assert.equal((await(await req('/api/reports','GET',null,owner)).json()).reports.length,0);
 let detail=await(await req('/api/reports/'+report.id,'GET',null,owner)).json();assert.equal(detail.comments.length,1);assert.equal(detail.report.favourite,1);
 const file=await(await req('/api/attachments/'+detail.report.attachments[0].id,'GET',null,owner)).text();assert.equal(file,'attachment content');
 assert.equal((await req('/api/attachments/'+detail.report.attachments[0].id,'GET',null,agent)).status,401);
 // Exercise actual bundled MCP over HTTP without relying on an installed client.
 const mcp=await req('/api/mcp','POST',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}}},{...agent,Accept:'application/json, text/event-stream'});assert.equal(mcp.status,200);assert.ok((await mcp.json()).result.serverInfo);
 const call=await req('/api/mcp','POST',{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'publish_report',arguments:{run_id:'mcp-check',routine:'MCP test',title:'MCP report',markdown:'Full MCP content'}}},{...agent,Accept:'application/json, text/event-stream'});assert.equal(call.status,200);assert.ok(JSON.parse((await call.json()).result.content[0].text).id);
 // News and Reports: a routine named like a check starts in Reports, anything else in News, and moving a routine sticks.
 assert.equal((await req('/api/publish','POST',{run_id:'news-1',routine:'AI news digest',title:'News',markdown:'Worth reading'},agent)).status,201);
 assert.match(logs,/run_id=mcp-check outcome=created id=\S+ quiet/);assert.match(logs,/run_id=news-1 outcome=created id=\S+\n/);
 const list=async view=>(await(await req('/api/reports?view='+view,'GET',null,owner)).json());
 let news=await list('news'),reports=await list('reports');
 assert.deepEqual(news.reports.map(x=>x.title),['News']);assert.deepEqual(reports.reports.map(x=>x.title),['MCP report']);assert.equal(news.reports[0].kind,'news');
 assert.equal(news.counts.unread_news,1);assert.equal(news.counts.unread_reports,1);
 assert.equal((await req('/api/routine-kinds','POST',{source:'aka',routine:'AI news digest',kind:'report'},{...owner,Origin:'https://evil.test'})).status,403);
 assert.equal((await req('/api/routine-kinds','POST',{source:'aka',routine:'AI news digest',kind:'other'},owner)).status,400);
 assert.equal((await req('/api/routine-kinds','POST',{source:'aka',routine:'AI news digest',kind:'report'},owner)).status,200);
 assert.equal((await list('news')).reports.length,0);assert.equal((await list('reports')).reports.length,2);
 assert.equal((await req('/api/routine-kinds','POST',{source:'aka',routine:'AI news digest',kind:'news'},owner)).status,200);
 const newsId=(await list('news')).reports[0].id;assert.equal((await(await req('/api/reports/'+newsId,'GET',null,owner)).json()).report.kind,'news');
 // Saved and Favourite are separate: a report can be either, both or neither. Saved lists newest saved first, also across pages, and keeps a report that gets archived.
 const titles=async(view,cursor='')=>{const l=await list(view+(cursor?'&cursor='+encodeURIComponent(cursor):''));return [l.reports.map(x=>x.title),l.cursor]};
 const newsReport=(await list('news')).reports[0].id,mcpReport=(await list('reports')).reports[0].id;
 assert.deepEqual((await titles('saved'))[0],[]);
 assert.equal((await req('/api/reports/'+newsReport,'PATCH',{saved:'yes'},owner)).status,400);
 assert.equal((await req('/api/reports/'+newsReport,'PATCH',{saved:true},{...owner,Origin:'https://evil.test'})).status,403);
 assert.equal((await req('/api/reports/'+newsReport,'PATCH',{saved:true},agent)).status,401);
 assert.equal((await req('/api/reports/'+newsReport,'PATCH',{saved:true},owner)).status,200);
 let state=(await(await req('/api/reports/'+newsReport,'GET',null,owner)).json()).report;assert.equal(state.saved,1);assert.ok(state.saved_at);assert.equal(state.favourite,0);
 assert.deepEqual((await titles('saved'))[0],['News']);assert.deepEqual((await titles('favourites'))[0],[]);
 assert.equal((await req('/api/reports/'+mcpReport,'PATCH',{favourite:true},owner)).status,200);
 assert.deepEqual((await titles('saved'))[0],['News']);assert.deepEqual((await titles('favourites'))[0],['MCP report']);
 await new Promise(r=>setTimeout(r,5));
 assert.equal((await req('/api/reports/'+mcpReport,'PATCH',{saved:true},owner)).status,200);
 assert.deepEqual((await titles('saved'))[0],['MCP report','News'],'newest saved first');assert.deepEqual((await titles('favourites'))[0],['MCP report']);
 await new Promise(r=>setTimeout(r,5));
 assert.equal((await req('/api/reports/'+newsReport,'PATCH',{saved:true},owner)).status,200);
 assert.deepEqual((await titles('saved'))[0],['MCP report','News'],'saving twice keeps the first saved time');
 assert.equal((await req('/api/reports/'+newsReport,'PATCH',{archived:true},owner)).status,200);
 assert.deepEqual((await titles('saved'))[0],['MCP report','News'],'archiving leaves a report in Saved');
 assert.equal((await req('/api/reports/'+newsReport,'PATCH',{archived:false},owner)).status,200);
 assert.equal((await req('/api/reports/'+mcpReport,'PATCH',{saved:false},owner)).status,200);
 assert.deepEqual((await titles('saved'))[0],['News']);assert.deepEqual((await titles('favourites'))[0],['MCP report'],'unsaving leaves the star');
 assert.equal((await req('/api/reports/'+mcpReport,'PATCH',{favourite:false},owner)).status,200);
 assert.deepEqual((await titles('saved'))[0],['News'],'unstarring leaves Saved');
 let pager;for(let i=0;i<41;i++){if(i%25===0)pager={Authorization:'Bearer '+(await(await req('/api/keys','POST',{source:'aka',label:'Paging'},owner)).json()).token};const page=await(await req('/api/publish','POST',{run_id:'page-'+i,routine:'Saved paging',title:'Page '+i,markdown:'Paging'},pager)).json();await new Promise(r=>setTimeout(r,2));assert.equal((await req('/api/reports/'+page.id,'PATCH',{saved:true},owner)).status,200);}
 const [first,next]=await titles('saved');assert.equal(first.length,40);assert.equal(first[0],'Page 40');assert.ok(next);const [rest,end]=await titles('saved',next);assert.deepEqual(rest,['Page 0','News']);assert.equal(end,null);
 await stop();await start();detail=await(await req('/api/reports/'+report.id,'GET',null,owner)).json();assert.equal(detail.report.markdown,payload.markdown);assert.equal(detail.report.archived,1);assert.equal(detail.comments[0].body,comment.body);assert.equal((await list('saved')).reports[0].title,'Page 40');await stop();
 // An old database upgrades with nothing lost and a backup first; a second start changes nothing; a new database needs no backup.
 const oldData=mkdtempSync(join(tmpdir(),'feed-upgrade-test-'));
 try{
  const {DatabaseSync}=await import('node:sqlite'),old=new DatabaseSync(join(oldData,'feed.sqlite')),now=new Date().toISOString(),oldId=randomUUID();
  old.exec('CREATE TABLE migrations (name TEXT PRIMARY KEY)');
  for(const name of ['0000_special_shard.sql','0001_lowly_stephen_strange.sql','0002_routine_kinds.sql']){old.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));old.prepare('INSERT INTO migrations VALUES (?)').run(name);}
  old.prepare("INSERT INTO reports (id,owner,source,run_id,routine,title,markdown,payload_hash,published_at,received_at,favourite) VALUES (?,'local-owner','aka','old-run','Old routine','Old report','Old body','hash',?,?,1)").run(oldId,now,now);
  old.prepare("INSERT INTO comments (id,report_id,owner,body,created_at) VALUES (?,?,'local-owner','Old comment',?)").run(randomUUID(),oldId,now);old.close();
  const opened=()=>{const run=spawnSync(process.execPath,['--input-type=module','-e',"import {sql} from './server/storage.mjs';console.log(JSON.stringify({r:sql.prepare('SELECT * FROM reports').all(),c:sql.prepare('SELECT count(*) n FROM comments').get().n,m:sql.prepare('SELECT count(*) n FROM migrations').get().n}))"],{env:{...process.env,FEED_DATA_DIR:oldData},encoding:'utf8'});assert.equal(run.status,0,run.stderr);return JSON.parse(run.stdout)};
  const after=opened();assert.equal(after.m,4);assert.equal(after.c,1);assert.equal(after.r.length,1);assert.equal(after.r[0].markdown,'Old body');assert.equal(after.r[0].favourite,1);assert.equal(after.r[0].saved_at,null);
  const backups=readdirSync(join(oldData,'backups'));assert.equal(backups.length,1);assert.match(backups[0],/^feed-before-0003_saved-\d+\.sqlite$/);
  const copy=new DatabaseSync(join(oldData,'backups',backups[0]),{readOnly:true});assert.equal(copy.prepare('SELECT markdown FROM reports').get().markdown,'Old body');assert.ok(!copy.prepare('PRAGMA table_info(reports)').all().some(c=>c.name==='saved_at'),'the backup is from before the change');copy.close();
  opened();assert.equal(readdirSync(join(oldData,'backups')).length,1);
  assert.ok(!existsSync(join(data,'backups')),'a new database needs no backup');
 }finally{rmSync(oldData,{recursive:true,force:true})}
 const migration=mkdtempSync(join(tmpdir(),'feed-import-test-'));
 try{
  const fixture=join(migration,'export.json'),bytes=Buffer.from(file),a=detail.report.attachments[0];
  const backup={format:'feed-portable-v1',reports:[{report:detail.report,comments:detail.comments,attachments:[{...a,base64:bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex')}]}]};writeFileSync(fixture,JSON.stringify(backup));
  for(let i=0;i<2;i++){const run=spawnSync(process.execPath,['scripts/import.mjs',fixture],{env:{...process.env,FEED_DATA_DIR:join(migration,'data')},encoding:'utf8'});assert.equal(run.status,0,run.stderr);assert.equal(JSON.parse(run.stdout).total,1);}
  const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(join(migration,'data/feed.sqlite'));assert.equal(db.prepare('SELECT archived FROM reports').get().archived,1);assert.equal(db.prepare('SELECT count(*) n FROM comments').get().n,1);db.close();
  assert.equal(readFileSync(join(migration,'data/attachments',report.id,a.id),'utf8'),file);
  const savedTime=new Date().toISOString(),savedExport=join(migration,'saved.json');writeFileSync(savedExport,JSON.stringify({format:'feed-portable-v1',reports:[{report:{...detail.report,id:randomUUID(),run_id:'saved-import',saved_at:savedTime},comments:[],attachments:[]}]}));
  const savedRun=spawnSync(process.execPath,['scripts/import.mjs',savedExport],{env:{...process.env,FEED_DATA_DIR:join(migration,'data')},encoding:'utf8'});assert.equal(savedRun.status,0,savedRun.stderr);
  const savedDb=new DatabaseSync(join(migration,'data/feed.sqlite'));assert.equal(savedDb.prepare("SELECT saved_at FROM reports WHERE run_id='saved-import'").get().saved_at,savedTime);savedDb.close();
  backup.reports[0].attachments[0].sha256='invalid';writeFileSync(fixture,JSON.stringify(backup));const invalid=spawnSync(process.execPath,['scripts/import.mjs',fixture],{env:{...process.env,FEED_DATA_DIR:join(migration,'data')},encoding:'utf8'});assert.notEqual(invalid.status,0);
 }finally{rmSync(migration,{recursive:true,force:true})}
 console.log('PASS: login, forged identity denial, CSRF, static UI, publish-only keys for every source, instructions with origins and limits, full Markdown + attachment, retry deduplication/conflict, comments/archive, HTTP MCP, restart persistence, migration replay and checksum rejection.');
}finally{if(child)await stop();rmSync(data,{recursive:true,force:true})}
