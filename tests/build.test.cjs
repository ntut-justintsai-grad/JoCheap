const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const cp=require('node:child_process');
test('standalone HTML builds without remote runtime dependencies and safely embeds JSON',()=>{
 cp.execFileSync(process.execPath,['tools/build.mjs'],{cwd:__dirname+'/..'});
 const html=fs.readFileSync(__dirname+'/../index.html','utf8');
 assert(!/<script\b[^>]*\bsrc=/i.test(html));
 assert(!/<link[^>]*\brel=["']stylesheet/i.test(html));
 const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,4);
 for(const [,attrs,body] of scripts){if(attrs.includes('application/json'))assert.doesNotThrow(()=>JSON.parse(body));else assert.doesNotThrow(()=>new vm.Script(body));}
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
 const app=fs.readFileSync(__dirname+'/../src/app.js','utf8');
 for(const [,id] of app.matchAll(/\$\('([^']+)'\)/g))assert(ids.includes(id),'missing DOM target '+id);
 const catalog=fs.readFileSync(__dirname+'/../src/catalog-ui.js','utf8');
 for(const [,id] of catalog.matchAll(/\$\('([^']+)'\)/g))assert(ids.includes(id),'missing catalogue DOM target '+id);
 assert(!catalog.includes('.innerHTML'));
 assert(!app.includes('.innerHTML'));assert(!html.includes('DATA_SNAPSHOT'));
});
