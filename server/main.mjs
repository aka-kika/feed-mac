import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {resolve,extname,join} from 'node:path';
import {createHmac,timingSafeEqual,scrypt as scryptCallback} from 'node:crypto';
import {promisify} from 'node:util';
import {Readable} from 'node:stream';
import {text as readBody} from 'node:stream/consumers';
import {auth,dataDir} from './storage.mjs';
import {api,mcp} from './routes.mjs';
const scrypt=promisify(scryptCallback);
const config=JSON.parse(readFileSync(join(dataDir,'config.json'),'utf8'));
const origin=new URL(config.origin).origin, port=config.port||4318;
// Extra HTTPS origins (e.g. a Tailscale Funnel port) that may reach the publish paths only. Set "publishOrigins": [".."] in config.json.
const publishOrigins=new Map((config.publishOrigins||[]).map(o=>{const u=new URL(o).origin;return [new URL(u).host,u]}));
const publishPaths=['/api/publish','/api/mcp'];
const allowed=new Set([new URL(origin).host,`127.0.0.1:${port}`,`localhost:${port}`,...publishOrigins.keys()]);
const sign=s=>createHmac('sha256',config.sessionSecret).update(s).digest('hex');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
function session(h){const v=h.match(/(?:^|;\s*)feed_session=([^;]+)/)?.[1];if(!v)return false;const [expiry,sig]=v.split('.');return Number(expiry)>Date.now()&&equal(sig,sign(expiry));}
const html={'Content-Type':'text/html; charset=utf-8'};
const login=error=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unlock Feed</title><link rel="icon" href="/icons/feed-v2-32.png"><style>body{font:16px -apple-system,system-ui;background:#202328;color:#edf0f5;display:grid;place-items:center;min-height:95vh}form{width:280px}input,button{box-sizing:border-box;width:100%;padding:12px;margin-top:16px;border-radius:8px;border:1px solid #59616f;font:inherit}button{background:#9aaccc;color:#202328;cursor:pointer}p{color:#e19ba2;font-size:.9rem}</style></head><body><form method="post" action="/login"><h1>Feed</h1>${error?`<p>${error}</p>`:''}<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required autofocus><button>Unlock Feed</button></form></body></html>`;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json','.md':'text/markdown; charset=utf-8'};
function publicAsset(pathname){
 if(pathname==='/favicon.ico'||pathname==='/favicon.svg')return pathname;
 if(pathname==='/apple-touch-icon.png'||pathname==='/apple-touch-icon-precomposed.png')return '/icons/feed-v2-180.png';
 if(pathname.startsWith('/icons/'))return pathname;
 return null;
}
let failures=0,blockedUntil=0;
createServer(async(req,res)=>{
 const send=(status,body,headers={})=>{res.writeHead(status,{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY',...headers});res.end(body??undefined)};
 const file=(pathname,method)=>{
  const root=resolve('dist'),p=resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
  if(!p.startsWith(root+'/')||!existsSync(p)||!statSync(p).isFile())return false;
  send(200,method==='HEAD'?undefined:readFileSync(p),{'Content-Type':types[extname(p)]||'application/octet-stream'});return true;
 };
 try{
  if(!allowed.has(req.headers.host))return send(403,'Unknown host',html);
  const base=req.headers.host===new URL(origin).host?origin:publishOrigins.get(req.headers.host)??`http://${req.headers.host}`;
  const url=new URL(req.url,base);
  if(url.origin!==base)return send(403,'Unknown origin',html);
  // Path-token form for clients with no header field (Grok web): /api/mcp/<key> or /api/publish/<key> becomes the bearer header.
  const pathToken=url.pathname.match(/^(\/api\/(?:mcp|publish))\/(feed_[a-f0-9]{64})$/);
  if(pathToken){url.pathname=pathToken[1];if(!req.headers.authorization)req.headers.authorization=`Bearer ${pathToken[2]}`;}
  if(publishOrigins.has(req.headers.host)&&!publishPaths.includes(url.pathname))return send(404,'Not found',{'Content-Type':'text/plain; charset=utf-8'});
  if(req.headers.origin&&req.headers.origin!==base)return send(403,'Cross-origin request rejected',html);
  if(req.headers['sec-fetch-site']==='cross-site'&&req.method!=='GET'&&req.method!=='HEAD')return send(403,'Cross-site request rejected',html);
  if(url.pathname==='/health')return send(200,'{"ok":true}',{'Content-Type':'application/json'});
  const authenticated=session(req.headers.cookie||'');
  if(url.pathname==='/login'){
   if(req.method==='GET'||req.method==='HEAD')return send(200,req.method==='HEAD'?undefined:login(''),html);
   if(req.method!=='POST')return send(405,'Method not allowed',{'Content-Type':'text/plain; charset=utf-8','Allow':'GET, HEAD, POST'});
   if(Date.now()<blockedUntil)return send(429,login('Try again shortly.'),{...html,'Retry-After':'30'});
   if(Number(req.headers['content-length']||0)>4096)return send(413,'Too large',html);
   const raw=await readBody(req);
   if(raw.length>4096)return send(413,'Too large',html);
   const password=new URLSearchParams(raw).get('password')||'';
   const digest=(await scrypt(password,config.salt,64)).toString('hex');
   if(!equal(digest,config.passwordHash)){failures++;if(failures>=5)blockedUntil=Date.now()+30000;return send(401,login('Incorrect password. Try again.'),html);}
   failures=0;const expiry=String(Date.now()+30*86400000);
   return send(303,'',{...html,'Location':'/','Set-Cookie':`feed_session=${expiry}.${sign(expiry)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${base.startsWith('https:')?'; Secure':''}`});
  }
  if(url.pathname.startsWith('/api/')){
   const publishing=publishPaths.includes(url.pathname);
   if(!publishing&&!authenticated)return send(401,'{"error":"Please unlock Feed at /login."}',{'Content-Type':'application/json'});
   const h=new Headers();for(const [k,v]of Object.entries(req.headers))if(v!==undefined)h.set(k,Array.isArray(v)?v.join(','):v);
   const request=new Request(url,{method:req.method,headers:h,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});
   const route=url.pathname==='/api/mcp'?mcp:api,handler=route[req.method];if(!handler)return send(405,'Method not allowed');
   const response=await auth.run(authenticated,()=>handler(request,{params:Promise.resolve({path:url.pathname.slice(5).split('/')})}));
   res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body)Readable.fromWeb(response.body).pipe(res);else res.end();return;
  }
  const asset=publicAsset(url.pathname);
  if(asset&&['GET','HEAD'].includes(req.method)&&file(asset,req.method))return;
  if(!authenticated)return send(303,'',{...html,Location:'/login'});
  if(!['GET','HEAD'].includes(req.method))return send(405,'Method not allowed',{'Content-Type':'text/plain; charset=utf-8'});
  if(!file(url.pathname,req.method))return send(404,'Not found',{'Content-Type':'text/plain; charset=utf-8'});
 }catch{send(500,'Request failed.',html);}
}).listen(port,'127.0.0.1',()=>console.log(`Feed listening on loopback port ${port}.`));
