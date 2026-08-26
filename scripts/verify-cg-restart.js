const BASE=process.env.STELLAR_BASE_URL||'https://stellar-prove.onrender.com';
const JOURNEY='J-67C236940717';
const ASSET='e707211e5f5cc16c1cf59c566e470d6f';
async function get(path){const r=await fetch(BASE+path);const j=await r.json();if(!r.ok)throw Error(`${r.status} ${JSON.stringify(j)}`);return j}
(async()=>{for(let i=0;i<36;i++){try{const h=await get('/api/health');if(h.success&&h.persistence?.connected&&h.media?.configured&&Number(h.persistence?.boots?.count||0)>11){const m=(await get('/api/cg/media?journeyId='+encodeURIComponent(JOURNEY))).media;if(m.assetId!==ASSET)throw Error('asset mismatch after restart');console.log('STELLAR_CG_RESTART_VERIFY='+JSON.stringify({ok:true,journeyId:JOURNEY,assetId:m.assetId,publicId:m.publicId,boots:h.persistence.boots,media:h.media}));return}}catch(e){if(i===35)throw e}await new Promise(r=>setTimeout(r,5000))}throw Error('restart verification timeout')})().catch(e=>{console.error(e.stack);process.exit(1)});
