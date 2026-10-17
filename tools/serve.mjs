import http from 'node:http';
import {readFile} from 'node:fs/promises';
const url=new URL('../index.html',import.meta.url);
const server=http.createServer(async(req,res)=>{
 if(req.url!=='/'&&req.url!=='/index.html'){res.writeHead(404);return res.end('Not found');}
 try{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(await readFile(url));}catch{res.writeHead(500);res.end('Run npm run build');}
});
server.listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173'));
