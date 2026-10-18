import http from 'node:http';
import {createIntentService} from './intent-service.mjs';
const handle=createIntentService(process.env),port=Number(process.env.PORT||8787);
http.createServer(async(req,res)=>{
 try{const parts=[];let bytes=0;for await(const part of req){bytes+=part.length;if(bytes>8192){res.writeHead(413);res.end();return;}parts.push(part);}
 const request=new Request('http://localhost:'+port+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(parts)}:{})});
 const response=await handle(request,req.socket.remoteAddress);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500);res.end();}
}).listen(port,()=>console.log('Intent service ready on port '+port));
