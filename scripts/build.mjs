import {build} from 'esbuild';
import {mkdir,copyFile,cp} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
const version=JSON.parse(readFileSync('package.json','utf8')).version;
await mkdir('dist/assets',{recursive:true});
await build({entryPoints:['main.tsx'],bundle:true,outfile:'dist/assets/app.js',format:'esm',external:['/agents/*'],minify:true,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','__FEED_VERSION__':JSON.stringify(version)}});
await cp('public','dist',{recursive:true}); await copyFile('index.html','dist/index.html');
await build({stdin:{contents:"export * as api from './server/api.ts'; export * as mcp from './server/mcp.ts';",resolveDir:process.cwd(),loader:'ts'},bundle:true,outfile:'server/routes.mjs',platform:'node',format:'esm',packages:'bundle',external:['node:*'],banner:{js:"import {createRequire as __createRequire} from 'node:module'; const require=__createRequire(import.meta.url);"},plugins:[{name:'storage',setup(b){b.onResolve({filter:/storage\.mjs$/},()=>({path:'./storage.mjs',external:true}));}}]});
console.log('Feed frontend and server built.');
