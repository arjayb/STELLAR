const http=require('http');
const fs=require('fs');
const path=require('path');
const {handleApi,bootstrapIntegrity}=require('./src/core');
const store=require('./src/neonStore');

const ROOT=__dirname;
const PUB=path.join(ROOT,'public');
const PORT=process.env.PORT||4173;

function mime(p){if(p.endsWith('.html'))return'text/html';if(p.endsWith('.css'))return'text/css';if(p.endsWith('.js'))return'application/javascript';return'application/octet-stream'}
function json(res,status,obj){const b=JSON.stringify(obj);res.writeHead(status,{'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)});res.end(b)}

async function start(){
  await store.hydrate();
  bootstrapIntegrity();
  await store.persist();
  await store.recordBoot();

  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/api/health'){
      try{return json(res,200,{success:true,persistence:await store.status()})}
      catch(e){return json(res,500,{success:false,error:'persistence unavailable'})}
    }
    if(url.pathname.startsWith('/api/')){
      await handleApi(req,res,url);
      try{await store.persist()}catch(e){console.error('Neon persistence error:',e.message)}
      return;
    }
    let f=path.join(PUB,url.pathname==='/'?'index.html':url.pathname);
    if(!f.startsWith(PUB)||!fs.existsSync(f)||fs.statSync(f).isDirectory())f=path.join(PUB,'index.html');
    const b=fs.readFileSync(f);res.writeHead(200,{'Content-Type':mime(f)});res.end(b);
  });
  server.listen(PORT,()=>console.log(`STELLAR running at http://localhost:${PORT} persistence=${store.isEnabled()?'neon':'file'}`));
}

start().catch(err=>{console.error('STELLAR startup failed:',err);process.exit(1)});
