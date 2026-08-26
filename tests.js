const http=require('http'),assert=require('assert'),cp=require('child_process'),fs=require('fs'),path=require('path');
const ROOT=__dirname;for(const f of['db.json','ledger.jsonl'])try{fs.unlinkSync(path.join(ROOT,f))}catch{}
const child=cp.spawn(process.execPath,['server.js'],{cwd:ROOT,stdio:['ignore','pipe','pipe']});
function req(method,p,body){return new Promise((ok,bad)=>{const r=http.request({host:'127.0.0.1',port:4173,path:p,method,headers:{'Content-Type':'application/json'}},res=>{let b='';res.on('data',c=>b+=c);res.on('end',()=>ok({status:res.statusCode,json:JSON.parse(b)}))});r.on('error',bad);if(body)r.write(JSON.stringify(body));r.end()})}
setTimeout(async()=>{try{
 const a=(await req('POST','/api/enroll',{username:'Founder',livenessKey:'HUMAN-A'})).json.traveler;assert.ok(/^ST-/.test(a.uid));assert.equal(a.cards.length,1);assert.equal(a.invitations.length,4);
 const inv=a.invitations.find(x=>x.domain==='body');const s=await req('POST','/api/invitation/accept',{uid:a.uid,invitationId:inv.id});const card=s.json.cards[0];const j=(await req('POST','/api/journey/start',{uid:a.uid,domain:'body',pathId:'body-path-a',cardId:card.id})).json.journey;
 const bad=await req('POST','/api/journey/complete-star',{uid:a.uid,journeyId:j.id,evidence:'x'});assert.equal(bad.json.assessment,'TRY_AGAIN');const review=await req('POST','/api/journey/complete-star',{uid:a.uid,journeyId:j.id,evidence:'[review] ambiguous'});assert.equal(review.json.assessment,'REVIEW');
 const pass=await req('POST','/api/journey/complete-star',{uid:a.uid,journeyId:j.id,evidence:'this is sufficient observable evidence'});assert.equal(pass.json.assessment,'PASS');assert.ok(pass.json.reward.id);
 const renamed=await req('POST','/api/username',{uid:a.uid,username:'Northstar'});assert.equal(renamed.json.state.username,'Northstar');assert.equal(renamed.json.state.genesisReset.reason,'WAITING_INTERVAL');
 const sponsored=await req('POST','/api/sponsored-event',{uid:a.uid,eventCode:'PILOT-SERVICE'});assert.ok(sponsored.json.created.length===1);assert.ok(!sponsored.json.state.visibleSky.some(x=>x.id==='spec-service'));
 const b=(await req('POST','/api/enroll',{username:'Observer',livenessKey:'HUMAN-B'})).json.traveler;assert.equal((await req('POST','/api/block',{uid:a.uid,targetUid:b.uid})).json.blocked,true);assert.equal((await req('GET','/api/traveler/public/'+a.uid+'?viewer='+b.uid)).status,403);assert.ok((await req('POST','/api/report',{uid:a.uid,targetUid:b.uid,reason:'test'})).json.reportId);
 const integrity=await req('GET','/api/integrity');assert.equal(integrity.json.ledger.ok,true);assert.ok(integrity.json.ledger.count>0);
 const del=await req('POST','/api/account/delete',{uid:a.uid});assert.equal(del.json.historyRetained,true);assert.equal((await req('GET','/api/integrity')).json.ledger.ok,true);
 console.log('STELLAR repository smoke tests PASS');
}catch(e){console.error(e);process.exitCode=1}finally{child.kill()}},650);