const http=require('http');
const fs=require('fs');
const path=require('path');
const {handleApi,bootstrapIntegrity}=require('./src/core');
const store=require('./src/neonStore');
const media=require('./src/cloudinaryStore');

const ROOT=__dirname;
const PUB=path.join(ROOT,'public');
const PORT=process.env.PORT||4173;

function mime(p){if(p.endsWith('.html'))return'text/html';if(p.endsWith('.css'))return'text/css';if(p.endsWith('.js'))return'application/javascript';return'application/octet-stream'}
function json(res,status,obj){const b=JSON.stringify(obj);res.writeHead(status,{'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)});res.end(b)}
function readJson(req,max=8*1024*1024){return new Promise((ok,bad)=>{let b='';req.on('data',c=>{b+=c;if(Buffer.byteLength(b)>max){bad(Error('request too large'));req.destroy()}});req.on('end',()=>{try{ok(b?JSON.parse(b):{})}catch(e){bad(e)}});req.on('error',bad)})}

async function start(){
  await store.hydrate();
  bootstrapIntegrity();
  await store.persist();
  await store.recordBoot();

  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/api/health'){
      try{return json(res,200,{success:true,persistence:await store.status(),media:media.status()})}
      catch(e){return json(res,500,{success:false,error:'persistence unavailable'})}
    }
    if(req.method==='GET'&&url.pathname==='/api/media/health')return json(res,200,media.status());
    if(req.method==='POST'&&url.pathname==='/api/cg/media'){
      if(!media.isEnabled())return json(res,503,{error:'CG media storage is not configured'});
      try{
        const b=await readJson(req);
        const uploaded=await media.uploadCgEvidence({dataUrl:b.dataUrl,travelerUid:b.travelerUid,journeyId:b.journeyId,guideUid:b.guideUid||null,privacy:b.privacy||'PUBLIC'});
        await store.recordCgMedia(uploaded);
        return json(res,201,{media:{assetId:uploaded.assetId,publicId:uploaded.publicId,type:uploaded.type,format:uploaded.format,bytes:uploaded.bytes,createdAt:uploaded.createdAt,journeyId:uploaded.journeyId,privacy:uploaded.privacy}});
      }catch(e){return json(res,400,{error:e.message})}
    }
    if(req.method==='GET'&&url.pathname==='/api/cg/media'){
      const journeyId=url.searchParams.get('journeyId');
      if(!journeyId)return json(res,400,{error:'journeyId required'});
      try{const ref=await store.getCgMedia(journeyId);return ref?json(res,200,{media:ref}):json(res,404,{error:'CG media not found'})}
      catch(e){return json(res,500,{error:'media reference unavailable'})}
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
  server.listen(PORT,()=>console.log(`STELLAR running at http://localhost:${PORT} persistence=${store.isEnabled()?'neon':'file'} media=${media.isEnabled()?'cloudinary':'disabled'}`));
}

start().catch(err=>{console.error('STELLAR startup failed:',err);process.exit(1)});
