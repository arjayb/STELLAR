const http=require('http');
const fs=require('fs');
const path=require('path');
const {handleApi,bootstrapIntegrity}=require('./src/core');
const ROOT=__dirname;
const PUB=path.join(ROOT,'public');
const PORT=process.env.PORT||4173;
bootstrapIntegrity();
function mime(p){if(p.endsWith('.html'))return'text/html';if(p.endsWith('.css'))return'text/css';if(p.endsWith('.js'))return'application/javascript';return'application/octet-stream'}
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/api/'))return handleApi(req,res,url);
 let f=path.join(PUB,url.pathname==='/'?'index.html':url.pathname);
 if(!f.startsWith(PUB)||!fs.existsSync(f)||fs.statSync(f).isDirectory())f=path.join(PUB,'index.html');
 const b=fs.readFileSync(f);res.writeHead(200,{'Content-Type':mime(f)});res.end(b);
});
server.listen(PORT,()=>console.log(`STELLAR running at http://localhost:${PORT}`));
