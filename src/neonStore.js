const fs=require('fs');
const path=require('path');
const {Pool}=require('pg');

const ROOT=path.join(__dirname,'..');
const DB=path.join(ROOT,'db.json');
const LEDGER=path.join(ROOT,'ledger.jsonl');
const DATABASE_URL=process.env.DATABASE_URL||'';
let pool=null;

function isEnabled(){return Boolean(DATABASE_URL)}
function getPool(){
  if(!isEnabled())return null;
  if(!pool)pool=new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:4});
  return pool;
}
function chainOrder(rows){
  if(!rows.length)return [];
  const byPrev=new Map();
  for(const r of rows){
    if(byPrev.has(r.prev_hash))throw Error('Provenance ledger branches at '+r.prev_hash);
    byPrev.set(r.prev_hash,r);
  }
  const ordered=[];let prev='GENESIS';
  while(byPrev.has(prev)){
    const r=byPrev.get(prev);ordered.push(r);byPrev.delete(prev);prev=r.hash;
    if(ordered.length>rows.length)throw Error('Provenance ledger cycle detected');
  }
  if(ordered.length!==rows.length)throw Error(`Provenance ledger chain incomplete: ${ordered.length}/${rows.length}`);
  return ordered;
}
const PAYLOAD_ORDER={
  TRAVELER_CREATED:['travelerUid','username'],
  CARD_ISSUED:['cardId','travelerUid','rarity','kind'],
  USERNAME_CHANGED:['travelerUid','from','to'],
  JOURNEY_STARTED:['travelerUid','journeyId','pathId','cardId'],
  STAR_COMPLETED:['travelerUid','historicalUsername','journeyId','domain','tier','pathId','starIndex','at'],
  CG_AUTHENTICATED_COMPLETION:['travelerUid','historicalUsername','journeyId','domain','tier','pathId','starIndex','at','guideUid','privacy'],
  STAMP_APPLIED:['travelerUid','cardId'],
  REPORT_CREATED:['id','reporterUid','targetUid','reason','at','status'],
  GENESIS_RESET_USED:['travelerUid'],
  ACCOUNT_DELETED:['travelerUid','historicalUsername'],
  ROLE_GRANTED:['travelerUid','role']
};
function restorePayload(type,payload){
  const order=PAYLOAD_ORDER[type];if(!order)return payload;
  const out={};for(const k of order)if(Object.prototype.hasOwnProperty.call(payload,k))out[k]=payload[k];
  for(const k of Object.keys(payload))if(!Object.prototype.hasOwnProperty.call(out,k))out[k]=payload[k];
  return out;
}

async function hydrate(){
  if(!isEnabled())return {backend:'file',hydrated:false};
  const p=getPool();
  const snap=await p.query("SELECT value FROM app_meta WHERE key='snapshot'");
  if(snap.rows[0]?.value)fs.writeFileSync(DB,JSON.stringify(snap.rows[0].value,null,2));
  const ev=await p.query('SELECT id,event_type,payload,prev_hash,hash,created_at FROM provenance_events');
  if(ev.rows.length){
    const ordered=chainOrder(ev.rows);
    const lines=ordered.map(r=>JSON.stringify({id:r.id,at:new Date(r.created_at).toISOString(),type:r.event_type,payload:restorePayload(r.event_type,r.payload),prevHash:r.prev_hash,hash:r.hash}));
    fs.writeFileSync(LEDGER,lines.join('\n')+'\n');
  }else if(fs.existsSync(LEDGER))fs.unlinkSync(LEDGER);
  return {backend:'neon',hydrated:Boolean(snap.rows[0]?.value),events:ev.rows.length};
}

async function persist(){
  if(!isEnabled())return {backend:'file',persisted:false};
  if(!fs.existsSync(DB))return {backend:'neon',persisted:false};
  const snapshot=JSON.parse(fs.readFileSync(DB,'utf8'));
  const ledger=fs.existsSync(LEDGER)?fs.readFileSync(LEDGER,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
  const c=await getPool().connect();
  try{
    await c.query('BEGIN');
    await c.query("INSERT INTO app_meta(key,value) VALUES('snapshot',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",[JSON.stringify(snapshot)]);
    for(const e of ledger)await c.query('INSERT INTO provenance_events(id,event_type,payload,prev_hash,hash,created_at) VALUES($1,$2,$3::jsonb,$4,$5,$6) ON CONFLICT(id) DO NOTHING',[e.id,e.type,JSON.stringify(e.payload),e.prevHash,e.hash,e.at]);
    await c.query('COMMIT');
    return {backend:'neon',persisted:true,events:ledger.length};
  }catch(err){await c.query('ROLLBACK');throw err}finally{c.release()}
}

async function recordBoot(){
  if(!isEnabled())return {backend:'file',count:null};
  const p=getPool(),r=await p.query("SELECT value FROM app_meta WHERE key='runtime_boots'");
  const current=r.rows[0]?.value||{count:0},next={count:Number(current.count||0)+1,lastBoot:new Date().toISOString()};
  await p.query("INSERT INTO app_meta(key,value) VALUES('runtime_boots',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",[JSON.stringify(next)]);
  return {backend:'neon',...next};
}

async function recordCgMedia(meta){
  if(!isEnabled())return {backend:'file',persisted:false};
  const safe={...meta};delete safe.secureUrl;delete safe.dataUrl;
  await getPool().query("INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",[`cg_media:${meta.journeyId}`,JSON.stringify(safe)]);
  return {backend:'neon',persisted:true,journeyId:meta.journeyId,assetId:meta.assetId};
}
async function getCgMedia(journeyId){
  if(!isEnabled())return null;
  const r=await getPool().query('SELECT value FROM app_meta WHERE key=$1',[`cg_media:${journeyId}`]);
  return r.rows[0]?.value||null;
}

async function status(){
  if(!isEnabled())return {backend:'file',connected:false};
  const r=await getPool().query("SELECT value FROM app_meta WHERE key='runtime_boots'");
  return {backend:'neon',connected:true,boots:r.rows[0]?.value||null};
}
module.exports={hydrate,persist,recordBoot,recordCgMedia,getCgMedia,status,isEnabled,chainOrder,restorePayload};
