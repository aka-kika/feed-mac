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
 // Ticks: a box in a report can be ticked, by the owner only, and the report's text never changes. A "- [ ]" in a code block is no box, and a box the report wrote as [x] stays as written.
 const tickPayload={run_id:'post-ideas',routine:'Post ideas',title:'Post ideas, 31 Oct',markdown:'Intro \u{1F600} so an offset is not a byte count.\n\n- [ ] Idea 1: first\n\n**X**\n\n```\npost one\n- [ ] not a box, in a code block\n```\n\n**Threads:** paste as-is.\n\n---\n\n- [ ] Idea 2: second\n\nReply line.\n\n- [x] Done by the report\n\n## Held back\n\nNot part of any idea.\n\n- [ ] Idea 3: parent\n  - [ ] Nested child\n    under the child\n'};
 const tickReport=(await(await req('/api/publish','POST',tickPayload,pager)).json()).id,tick=(box,ticked=true,headers=owner,id=tickReport)=>req('/api/ticks','POST',{report_id:id,box,ticked},headers),ticksOf=async()=>(await(await req('/api/reports/'+tickReport,'GET',null,owner)).json()).report;
 assert.deepEqual((await ticksOf()).ticks,[]);
 assert.equal((await tick(1,true,{...owner,Origin:'https://evil.test'})).status,403);assert.equal((await tick(1,true,agent)).status,401);assert.equal((await tick(1,true,{})).status,401);
 for(const box of [3,6,0,-1,1.5,'1'])assert.equal((await tick(box)).status,400,'box '+box);
 assert.equal((await tick(1,true,owner,report.id)).status,400,'a report without boxes');assert.equal((await tick(1,true,owner,randomUUID())).status,404);
 assert.equal((await req('/api/ticks','POST',{report_id:tickReport,box:1,ticked:true,by:'x'},owner)).status,400);
 assert.deepEqual((await ticksOf()).ticks,[],'a refused tick saves nothing');
 assert.equal((await tick(4)).status,200);assert.equal((await tick(1)).status,200);assert.equal((await tick(1)).status,200);
 assert.deepEqual((await ticksOf()).ticks,[1,4]);assert.equal((await ticksOf()).markdown,tickPayload.markdown,'the report text never changes');
 r=await req('/api/publish','POST',tickPayload,pager);assert.equal(r.status,200);assert.equal((await r.json()).id,tickReport,'a retry still finds the report');
 assert.equal((await tick(4,false)).status,200);assert.equal((await tick(4,false)).status,200);assert.deepEqual((await ticksOf()).ticks,[1]);
 assert.equal((await tick(5)).status,200);
 await stop();await start();assert.deepEqual((await ticksOf()).ticks,[1,5],'ticks stay after a restart');detail=await(await req('/api/reports/'+report.id,'GET',null,owner)).json();assert.equal(detail.report.markdown,payload.markdown);assert.equal(detail.report.archived,1);assert.equal(detail.comments[0].body,comment.body);assert.equal((await list('saved')).reports[0].title,'Page 40');await stop();
 // An old database upgrades with nothing lost and a backup first; a second start changes nothing; a new database needs no backup.
 const oldData=mkdtempSync(join(tmpdir(),'feed-upgrade-test-'));
 try{
  const {DatabaseSync}=await import('node:sqlite'),old=new DatabaseSync(join(oldData,'feed.sqlite')),now=new Date().toISOString(),oldId=randomUUID();
  old.exec('CREATE TABLE migrations (name TEXT PRIMARY KEY)');
  for(const name of ['0000_special_shard.sql','0001_lowly_stephen_strange.sql','0002_routine_kinds.sql']){old.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));old.prepare('INSERT INTO migrations VALUES (?)').run(name);}
  old.prepare("INSERT INTO reports (id,owner,source,run_id,routine,title,markdown,payload_hash,published_at,received_at,favourite) VALUES (?,'local-owner','aka','old-run','Old routine','Old report','Old body','hash',?,?,1)").run(oldId,now,now);
  old.prepare("INSERT INTO comments (id,report_id,owner,body,created_at) VALUES (?,?,'local-owner','Old comment',?)").run(randomUUID(),oldId,now);old.close();
  const opened=()=>{const run=spawnSync(process.execPath,['--input-type=module','-e',"import {sql} from './server/storage.mjs';console.log(JSON.stringify({r:sql.prepare('SELECT * FROM reports').all(),c:sql.prepare('SELECT count(*) n FROM comments').get().n,m:sql.prepare('SELECT count(*) n FROM migrations').get().n}))"],{env:{...process.env,FEED_DATA_DIR:oldData},encoding:'utf8'});assert.equal(run.status,0,run.stderr);return JSON.parse(run.stdout)};
  const after=opened();assert.equal(after.m,5);assert.equal(after.c,1);assert.equal(after.r.length,1);assert.equal(after.r[0].markdown,'Old body');assert.equal(after.r[0].favourite,1);assert.equal(after.r[0].saved_at,null);
  const backups=readdirSync(join(oldData,'backups'));assert.equal(backups.length,1);assert.match(backups[0],/^feed-before-0003_saved-\d+\.sqlite$/);
  const copy=new DatabaseSync(join(oldData,'backups',backups[0]),{readOnly:true});assert.equal(copy.prepare('SELECT markdown FROM reports').get().markdown,'Old body');assert.ok(!copy.prepare('PRAGMA table_info(reports)').all().some(c=>c.name==='saved_at'),'the backup is from before the change');copy.close();
  opened();assert.equal(readdirSync(join(oldData,'backups')).length,1);
  assert.ok(!existsSync(join(data,'backups')),'a new database needs no backup');
  // A database from the release before ticks keeps every row, gets a backup first, and starts with no ticks.
  const prior=mkdtempSync(join(tmpdir(),'feed-upgrade-test-'));
  try{
   const db=new DatabaseSync(join(prior,'feed.sqlite')),priorId=randomUUID();
   db.exec('CREATE TABLE migrations (name TEXT PRIMARY KEY)');
   for(const name of ['0000_special_shard.sql','0001_lowly_stephen_strange.sql','0002_routine_kinds.sql','0003_saved.sql']){db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));db.prepare('INSERT INTO migrations VALUES (?)').run(name);}
   db.prepare("INSERT INTO reports (id,owner,source,run_id,routine,title,markdown,payload_hash,published_at,received_at,saved_at) VALUES (?,'local-owner','aka','prior-run','Prior','Prior','- [ ] Prior box','hash',?,?,?)").run(priorId,now,now,now);db.close();
   const run=spawnSync(process.execPath,['--input-type=module','-e',"import {sql} from './server/storage.mjs';console.log(JSON.stringify({r:sql.prepare('SELECT markdown,saved_at FROM reports').all(),t:sql.prepare('SELECT count(*) n FROM report_ticks').get().n}))"],{env:{...process.env,FEED_DATA_DIR:prior},encoding:'utf8'});assert.equal(run.status,0,run.stderr);
   const state=JSON.parse(run.stdout);assert.deepEqual(state,{r:[{markdown:'- [ ] Prior box',saved_at:now}],t:0});
   assert.match(readdirSync(join(prior,'backups'))[0],/^feed-before-0004_ticks-\d+\.sqlite$/);
  }finally{rmSync(prior,{recursive:true,force:true})}
 }finally{rmSync(oldData,{recursive:true,force:true})}
 // Reading: off until a source is on the allow list, and then only on a direct loopback call. The public door and the private-network door stay publish-only whatever the key.
 const baseConfig=JSON.parse(readFileSync(join(data,'config.json'),'utf8')),readPort=port+10;
 const rpc=(host,token,message,{path='/api/mcp',...headers}={})=>new Promise((ok,fail)=>{const text=JSON.stringify({jsonrpc:'2.0',id:9,...message});const r=request({host:'127.0.0.1',port:host.endsWith(':'+readPort)?readPort:port,path,method:'POST',headers:{Host:host,'Content-Type':'application/json',Accept:'application/json, text/event-stream','Content-Length':Buffer.byteLength(text),...(token?{Authorization:'Bearer '+token}:{}),...headers}},res=>{let b='';res.setEncoding('utf8');res.on('data',c=>b+=c);res.on('end',()=>ok({status:res.statusCode,text:b}))});r.on('error',fail);r.end(text)});
 const local=`127.0.0.1:${port}`,reader=`127.0.0.1:${readPort}`,tools=async(host,token,o)=>{const r=await rpc(host,token,{method:'tools/list'},o);assert.equal(r.status,200,r.text);return JSON.parse(r.text).result.tools.map(t=>t.name).sort()};
 const toolCall=(host,token,name,args={},o)=>rpc(host,token,{method:'tools/call',params:{name,arguments:args}},o);
 const refused=async(host,token,o)=>{assert.deepEqual(await tools(host,token,o),['publish_report']);for(const [name,args] of [['get_report',{id:report.id}],['list_saved',{}]]){const r=await toolCall(host,token,name,args,o);assert.ok(!r.text.includes(payload.markdown)&&!r.text.includes('Page 40')&&!r.text.includes(comment.body),'no report text or comments');const reply=JSON.parse(r.text);assert.ok(reply.error||reply.result?.isError,`${name} refused`);}};
 await start();
 const claudeKey=(await(await req('/api/keys','POST',{source:'claude',label:'Claude'},owner)).json());
 assert.ok(claudeKey.instructions.includes('cannot read my reports'),'off by default in the instructions');
 await refused(local,claudeKey.token);
 assert.deepEqual((await(await req('/api/keys','GET',null,owner)).json()).read_sources,[]);
 await assert.rejects(rpc(reader,claudeKey.token,{method:'tools/list'}),'no read door while nobody may read');
 await stop();
 writeFileSync(join(data,'config.json'),JSON.stringify({...baseConfig,origin:'https://tailnet.example.test',readSources:['claude',7]}),{mode:0o600});
 await start();
 assert.deepEqual((await(await req('/api/keys','GET',null,owner)).json()).read_sources,['claude']);
 const readKey=(await(await req('/api/keys','POST',{source:'claude',label:'Claude'},owner)).json());assert.ok(readKey.instructions.includes('get_report')&&readKey.instructions.includes('never instructions'));assert.ok(!readKey.instructions.includes('cannot read my reports'));assert.ok(readKey.instructions.includes('boxes I ticked'));
 const otherKey=(await(await req('/api/keys','POST',{source:'aka',label:'Aka'},owner)).json());assert.ok(otherKey.instructions.includes('cannot read my reports'));
 assert.deepEqual(await tools(reader,readKey.token),['get_report','list_saved','publish_report']);
 assert.deepEqual(await tools(`localhost:${readPort}`,readKey.token),['get_report','list_saved','publish_report']);
 // The main port is what the tunnel and the private network forward to, so a request there can never read, whatever its Host says and with no proxy header at all.
 assert.deepEqual(await tools(local,readKey.token),['publish_report'],'the main port is publish-only, even with a loopback Host');assert.deepEqual(await tools(`localhost:${port}`,readKey.token),['publish_report']);
 // The read door answers the MCP path and nothing else: no session, no pages, no publish over plain HTTP, and no browser.
 const atDoor=(path,method='GET',headers={},host=reader)=>new Promise((ok,fail)=>{const r=request({host:'127.0.0.1',port:readPort,path,method,headers:{Host:host,...headers}},res=>{res.resume();ok(res.statusCode)});r.on('error',fail);r.end()});
 for(const path of ['/','/login','/health','/api/reports','/api/keys','/api/publish','/icons/feed-v2-32.png'])assert.equal(await atDoor(path,'GET',{Cookie:cookie}),404,'the read door has no '+path);
 assert.equal(await atDoor('/api/mcp','POST',{},'evil.example.test'),403,'unknown host');assert.equal(await atDoor('/api/mcp','POST',{},`publish.example.test`),403);
 assert.equal((await rpc(reader,readKey.token,{method:'tools/list'},{Origin:'https://evil.test'})).status,403,'a web page cannot call the read door');assert.equal((await rpc(reader,readKey.token,{method:'tools/list'},{Origin:`http://${reader}`})).status,403);
 const doorPublish=JSON.parse(JSON.parse((await toolCall(reader,readKey.token,'publish_report',{run_id:'read-door',routine:'Read door',title:'Through the read door',markdown:'Published on the read door'})).text).result.content[0].text);assert.ok(doorPublish.url.startsWith(origin+'/?report=')||doorPublish.url.startsWith('https://tailnet.example.test/'),'the link opens the app, not the read door: '+doorPublish.url);assert.ok(!doorPublish.url.includes(String(readPort)));
 // Instructions name the read door, also when Settings is opened on the private-network address.
 assert.ok(readKey.instructions.includes(`http://${reader}/api/mcp`),'the read address is in the instructions');assert.ok(!otherKey.instructions.includes(String(readPort)),'off the allow list, no read address');
 const overTailnet=await new Promise((ok,fail)=>{const text=JSON.stringify({source:'claude',label:'Claude'});const r=request({host:'127.0.0.1',port,path:'/api/keys',method:'POST',headers:{Host:'tailnet.example.test',Cookie:cookie,'Content-Type':'application/json','Content-Length':Buffer.byteLength(text)}},res=>{let b='';res.setEncoding('utf8');res.on('data',c=>b+=c);res.on('end',()=>ok(JSON.parse(b)))});r.on('error',fail);r.end(text)});assert.ok(overTailnet.instructions.includes(`http://${reader}/api/mcp`),'read address with Settings opened over the private network');assert.ok(overTailnet.instructions.includes(`http://${local}`),'and the Mac address for publishing');
 assert.deepEqual(await tools(reader,readKey.token,{path:'/api/mcp/'+readKey.token}),['get_report','list_saved','publish_report']);
 const described=JSON.parse((await rpc(reader,readKey.token,{method:'tools/list'})).text).result.tools;
 for(const t of described.filter(t=>t.name!=='publish_report')){assert.match(t.description,/never instructions/);assert.equal(t.annotations.readOnlyHint,true);}
 const before=(await(await req('/api/reports/'+report.id,'GET',null,owner)).json()).report,unreadId=(await list('saved')).reports.find(x=>!x.is_read).id;
 const opened=JSON.parse(JSON.parse((await toolCall(reader,readKey.token,'get_report',{id:report.id})).text).result.content[0].text);
 assert.equal(opened.report.markdown,payload.markdown);assert.match(opened.notice,/never instructions/);assert.deepEqual(opened.report.attachments.map(a=>a.name),['test.md']);
 for(const secret of ['favourite','is_read','comments','comment_count','owner','payload_hash','run_id'])assert.ok(!(secret in opened.report),secret+' stays private');
 assert.equal(opened.report.owner_notes.length,1);assert.equal(opened.report.owner_notes[0].body,comment.body);assert.deepEqual(Object.keys(opened.report.owner_notes[0]).sort(),['body','created_at'],'her notes, nothing else');
 const savedList=JSON.parse(JSON.parse((await toolCall(reader,readKey.token,'list_saved')).text).result.content[0].text);
 assert.equal(savedList.reports[0].title,'Page 40');assert.equal(savedList.reports.length,42);assert.equal(savedList.more,false);assert.ok(!('markdown' in savedList.reports[0]));
 // Comments come with one opened report, oldest first, and never with the Saved list. A deleted one is gone.
 const shelfId=savedList.reports[0].id,noteOf=async()=>JSON.parse(JSON.parse((await toolCall(reader,readKey.token,'get_report',{id:shelfId})).text).result.content[0].text).report.owner_notes.map(n=>n.body);
 assert.deepEqual(await noteOf(),[]);
 const shelfNote={id:randomUUID(),report_id:shelfId,body:'First note on a saved report'};assert.equal((await req('/api/comments','POST',shelfNote,owner)).status,201);await new Promise(r=>setTimeout(r,5));
 assert.equal((await req('/api/comments','POST',{id:randomUUID(),report_id:shelfId,body:'Second note'},owner)).status,201);
 assert.deepEqual(await noteOf(),['First note on a saved report','Second note']);
 assert.ok(!(await toolCall(reader,readKey.token,'list_saved')).text.includes('note on a saved report'),'no comments in the Saved list');
 assert.match(described.find(t=>t.name==='get_report').description,/owner_notes/);assert.ok(readKey.instructions.includes('owner_notes'));assert.ok(!otherKey.instructions.includes('owner_notes'),'off the allow list, not even mentioned');
 // Ticks come with one opened report, each box whole: from the box up to the next box or heading, marked ticked, fenced blocks included. Only the owner's ticks, in box order.
 const opensTicks=async(token=readKey.token)=>JSON.parse(JSON.parse((await toolCall(reader,token,'get_report',{id:tickReport})).text).result.content[0].text).report.ticks;
 assert.equal((await tick(2)).status,200);assert.equal((await tick(4)).status,200);
 const ticked=await opensTicks();assert.deepEqual(ticked.map(t=>t.box),[1,2,4,5]);assert.deepEqual(Object.keys(ticked[0]).sort(),['box','markdown','text','ticked_at']);
 assert.deepEqual(ticked.map(t=>t.text),['Idea 1: first','Idea 2: second','Idea 3: parent','Nested child\nunder the child']);
 assert.equal(ticked[0].markdown,'- [x] Idea 1: first\n\n**X**\n\n```\npost one\n- [ ] not a box, in a code block\n```\n\n**Threads:** paste as-is.','whole, without the --- after it');
 assert.equal(ticked[1].markdown,'- [x] Idea 2: second\n\nReply line.','stops at the next box');assert.equal(ticked[2].markdown,'- [x] Idea 3: parent','stops at a nested box');assert.equal(ticked[3].markdown,'- [x] Nested child\n  under the child','keeps its lines, one level out');
 assert.ok(!JSON.stringify(ticked).includes('Not part of any idea'),'stops at a heading');
 assert.deepEqual(await opensTicks(),ticked,'reading changes no tick');assert.equal(JSON.parse(JSON.parse((await toolCall(reader,readKey.token,'get_report',{id:shelfId})).text).result.content[0].text).report.ticks.length,0);
 assert.match(described.find(t=>t.name==='get_report').description,/ticks/);assert.match(opened.notice,/ticks/);assert.ok(!('ticks' in savedList.reports[0]),'no ticks in the Saved list');
 assert.ok(otherKey.instructions.includes('favourites, comments or ticks'));
 // No tick for anyone but the owner, and no way in at the other doors.
 assert.equal((await tick(1,false,{Authorization:'Bearer '+readKey.token})).status,401);assert.deepEqual((await ticksOf()).ticks,[1,2,4,5]);
 for(const [host,token,o] of [[reader,otherKey.token],['publish.example.test',readKey.token],['publish.example.test',readKey.token,{path:'/api/mcp/'+readKey.token}],['tailnet.example.test',readKey.token],[reader,readKey.token,{'X-Forwarded-For':'203.0.113.9'}],[local,readKey.token]]){const r=await toolCall(host,token,'get_report',{id:tickReport},o);assert.ok(!r.text.includes('Idea 1')&&!r.text.includes('"ticks"'),'no ticks through this door: '+host);}
 assert.equal((await rpc('publish.example.test',null,{},{path:'/api/ticks',Cookie:cookie})).status,404,'the public door has no tick path');
 const offList=await toolCall(reader,otherKey.token,'get_report',{id:shelfId});assert.ok(!offList.text.includes('note on a saved report'),'a key off the allow list gets no comments');
 const outsideRead=await toolCall('publish.example.test',readKey.token,'get_report',{id:shelfId});assert.ok(!outsideRead.text.includes('note on a saved report'),'the public door gets no comments');
 assert.equal((await req('/api/comments/'+shelfNote.id,'DELETE',null,owner)).status,200);assert.deepEqual(await noteOf(),['Second note']);
 assert.equal(JSON.parse((await toolCall(reader,readKey.token,'get_report',{id:randomUUID()})).text).result.isError,true);
 assert.ok(JSON.parse((await toolCall(reader,readKey.token,'get_report',{id:'not-an-id'})).text).result?.isError??true);
 // Reading changes nothing.
 await toolCall(reader,readKey.token,'get_report',{id:unreadId});
 assert.equal((await(await req('/api/reports/'+unreadId,'GET',null,owner)).json()).report.is_read,0);
 assert.deepEqual((({saved_at,favourite,is_read,archived})=>({saved_at,favourite,is_read,archived}))((await(await req('/api/reports/'+report.id,'GET',null,owner)).json()).report),(({saved_at,favourite,is_read,archived})=>({saved_at,favourite,is_read,archived}))(before));
 assert.match(logs,new RegExp(`read key=${readKey.key.id} source=claude tool=get_report outcome=found id=${report.id}`));assert.match(logs,/tool=list_saved outcome=found count=42/);
 // A key off the allow list is refused, and so is the allowed key anywhere but a direct loopback call.
 await refused(reader,otherKey.token);assert.match(logs,new RegExp(`read key=${otherKey.key.id} source=aka tool=get_report outcome=refused`));
 assert.equal((await toolCall(local,'feed_'+'0'.repeat(64),'get_report',{id:report.id})).status,401);assert.equal((await toolCall(local,null,'list_saved')).status,401);
 await refused(local,readKey.token);await refused(`localhost:${port}`,readKey.token);
 for(const host of ['publish.example.test','tailnet.example.test']){await refused(host,readKey.token);await refused(host,otherKey.token);}
 await refused('publish.example.test',readKey.token,{path:'/api/mcp/'+readKey.token});
 for(const [name,value] of [['Cf-Connecting-Ip','203.0.113.9'],['Cf-Ray','abc'],['X-Forwarded-For','203.0.113.9'],['Tailscale-Funnel-Request','?1'],['Forwarded','for=203.0.113.9']])await refused(reader,readKey.token,{[name]:value});
 // The public door still publishes.
 const outside=await toolCall('publish.example.test',readKey.token,'publish_report',{run_id:'public-door',routine:'Public door',title:'From outside',markdown:'Published from outside'});assert.ok(JSON.parse(JSON.parse(outside.text).result.content[0].text).id);
 // Revoking stops reading.
 assert.equal((await req('/api/keys/'+readKey.key.id,'DELETE',null,owner)).status,200);assert.equal((await toolCall(reader,readKey.token,'list_saved')).status,401);
 await stop();
 const migration=mkdtempSync(join(tmpdir(),'feed-import-test-'));
 try{
  const fixture=join(migration,'export.json'),bytes=Buffer.from(file),a=detail.report.attachments[0];
  const backup={format:'feed-portable-v1',reports:[{report:detail.report,comments:detail.comments,attachments:[{...a,base64:bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex')}]}]};writeFileSync(fixture,JSON.stringify(backup));
  for(let i=0;i<2;i++){const run=spawnSync(process.execPath,['scripts/import.mjs',fixture],{env:{...process.env,FEED_DATA_DIR:join(migration,'data')},encoding:'utf8'});assert.equal(run.status,0,run.stderr);assert.equal(JSON.parse(run.stdout).total,1);}
  const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(join(migration,'data/feed.sqlite'));assert.equal(db.prepare('SELECT archived FROM reports').get().archived,1);assert.equal(db.prepare('SELECT count(*) n FROM comments').get().n,1);db.close();
  assert.equal(readFileSync(join(migration,'data/attachments',report.id,a.id),'utf8'),file);
  const savedTime=new Date().toISOString(),savedExport=join(migration,'saved.json');writeFileSync(savedExport,JSON.stringify({format:'feed-portable-v1',reports:[{report:{...detail.report,id:randomUUID(),run_id:'saved-import',saved_at:savedTime,ticks:[2,1]},comments:[],attachments:[]}]}));
  const savedRun=spawnSync(process.execPath,['scripts/import.mjs',savedExport],{env:{...process.env,FEED_DATA_DIR:join(migration,'data')},encoding:'utf8'});assert.equal(savedRun.status,0,savedRun.stderr);
  const savedDb=new DatabaseSync(join(migration,'data/feed.sqlite'));assert.equal(savedDb.prepare("SELECT saved_at FROM reports WHERE run_id='saved-import'").get().saved_at,savedTime);assert.deepEqual(savedDb.prepare('SELECT box FROM report_ticks ORDER BY box').all().map(t=>t.box),[1,2]);savedDb.close();
  backup.reports[0].attachments[0].sha256='invalid';writeFileSync(fixture,JSON.stringify(backup));const invalid=spawnSync(process.execPath,['scripts/import.mjs',fixture],{env:{...process.env,FEED_DATA_DIR:join(migration,'data')},encoding:'utf8'});assert.notEqual(invalid.status,0);
 }finally{rmSync(migration,{recursive:true,force:true})}
 console.log('PASS: login, forged identity denial, CSRF, static UI, publish-only keys for every source, instructions with origins and limits, full Markdown + attachment, retry deduplication/conflict, comments/archive, Saved separate from favourites, ticks stored apart from the report, HTTP MCP, read tools off by default and only on their own loopback door, comments and ticks only with one opened report, public door publish-only, restart persistence, upgrade with backup, migration replay and checksum rejection.');
}finally{if(child)await stop();rmSync(data,{recursive:true,force:true})}
