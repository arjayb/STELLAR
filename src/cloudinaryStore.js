const crypto=require('crypto');
const CLOUDINARY_URL=process.env.CLOUDINARY_URL||'';
const MAX_BYTES=5*1024*1024;

function config(){
  if(!CLOUDINARY_URL)return null;
  const u=new URL(CLOUDINARY_URL);
  if(u.protocol!=='cloudinary:')throw Error('Invalid CLOUDINARY_URL');
  return {cloudName:u.hostname,apiKey:decodeURIComponent(u.username),apiSecret:decodeURIComponent(u.password)};
}
function isEnabled(){return Boolean(CLOUDINARY_URL)}
function status(){
  try{const c=config();return c?{backend:'cloudinary',configured:true,cloudName:c.cloudName,access:'authenticated'}:{backend:'cloudinary',configured:false}}
  catch{return {backend:'cloudinary',configured:false,error:'invalid configuration'}}
}
function validateDataUrl(dataUrl){
  const m=String(dataUrl||'').match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if(!m)throw Error('CG evidence must be PNG, JPEG, or WebP image data');
  const bytes=Math.floor(m[2].length*3/4);
  if(bytes<1||bytes>MAX_BYTES)throw Error('CG evidence must be between 1 byte and 5 MB');
  return bytes;
}
function sign(params,secret){
  const canonical=Object.entries(params).filter(([,v])=>v!==undefined&&v!==null&&v!=='').sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('&');
  return crypto.createHash('sha1').update(canonical+secret).digest('hex');
}
async function uploadCgEvidence({dataUrl,travelerUid,journeyId,guideUid=null,privacy='PUBLIC'}){
  const c=config();if(!c)throw Error('Cloudinary is not configured');
  const bytes=validateDataUrl(dataUrl);
  if(!travelerUid||!journeyId)throw Error('travelerUid and journeyId are required');
  const timestamp=Math.floor(Date.now()/1000);
  const publicId=`cg-${String(journeyId).replace(/[^A-Za-z0-9_-]/g,'')}-${Date.now()}`;
  const params={asset_folder:'STELLAR/cg-authentication',backup:'true',context:`project=STELLAR|traveler_uid=${travelerUid}|journey_id=${journeyId}|privacy=${privacy}`,public_id:publicId,tags:'stellar,cg-authentication',timestamp,type:'authenticated'};
  const form=new FormData();
  form.append('file',dataUrl);
  for(const [k,v] of Object.entries(params))form.append(k,String(v));
  form.append('api_key',c.apiKey);
  form.append('signature',sign(params,c.apiSecret));
  const r=await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(c.cloudName)}/image/upload`,{method:'POST',body:form});
  const j=await r.json();
  if(!r.ok)throw Error(j?.error?.message||'Cloudinary upload failed');
  return {assetId:j.asset_id,publicId:j.public_id,resourceType:j.resource_type,type:j.type,format:j.format,bytes:j.bytes||bytes,createdAt:j.created_at,travelerUid,journeyId,guideUid,privacy,folder:j.asset_folder||'STELLAR/cg-authentication'};
}
module.exports={isEnabled,status,uploadCgEvidence};
