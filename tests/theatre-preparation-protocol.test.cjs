const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {randomUUID,createHash,createCipheriv,randomBytes}=require('node:crypto');
const {deflateRawSync}=require('node:zlib');
const load=require('./load-typescript.cjs')({openai:class{constructor(){throw Error('Provider forbidden');}}});
const cp=load('lib/theatre-two-pass.ts'),p=load('lib/theatre-preparation-protocol.ts'),t=load('lib/theatre-preparation-token.ts');
const {fixture,unwrap,source,authorityHash}=require('./two-pass-protocol-fixtures.cjs');
const {PreparationCaches,DEFAULT_PREPARATION_SCOPE}=load('lib/theatre-preparation-cache.ts');
const clone=structuredClone,secret='mock-only-secret',now=100000;
function setup(ambiguous=false){const f=fixture();if(ambiguous){f.data.pronunciation.entries[1].resolution.status='ambiguous';f.production=unwrap(cp.acceptProductionDirection(f.p,f.data));}
 const start=p.beginPreparation(f.p);const first=p.acceptPass1(start,f.production);return {...f,start,first};}
function finish(f=setup()){const pending=p.beginPass2(f.first,randomUUID());const perf=unwrap(cp.acceptPerformanceDirection(f.p,f.production,pending.authority,f.delivery));const second=p.acceptPass2(pending,perf);return {...f,pending,second,ready:p.completePreparation(second)};}
const scope=s=>({preparationId:s.preparationId,epoch:s.epoch,canonical:s.canonical});
function forged(s,purpose='ready-v3',overrides={}){const packed=clone(s);for(const key of ['items','casting','sourceDigest','canonicalDigest'])delete packed.canonical[key];
 const e={version:purpose==='ready-v3'?3:1,purpose,issued:now,expires:now+t.PREPARATION_TOKEN_TTL,preparation:packed,speed:purpose==='ready-v3'?1:null,language:'fr',...overrides};
 const domain='theatre-two-pass:'+purpose,key=createHash('sha256').update(domain+'\0'+secret).digest(),iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(domain));
 const enc=Buffer.concat([c.update(deflateRawSync(Buffer.from(JSON.stringify(e)))),c.final()]);return purpose+'.'+Buffer.concat([iv,c.getAuthTag(),enc]).toString('base64url');}

test('complete pure protocol flow and exact upstream retained on explicit retry',()=>{
 const f=finish(),hold=p.holdPreparation(f.pending),retry=p.beginPass2(hold,randomUUID());
 assert.equal(hold.state,'PASS2_TECHNICAL_HOLD');assert.equal(retry.state,'PASS2_PENDING');assert.notEqual(retry.requestId,hold.requestId);
 assert.equal(retry.preparationId,hold.preparationId);assert.deepEqual(retry.production,hold.production);assert.deepEqual(retry.authority,hold.authority);
 assert.equal(retry.epoch,hold.epoch+1);assert.ok(Object.isFrozen(retry.production.data));assert.equal(f.ready.state,'READY');
 assert.throws(()=>p.beginPass2(hold,hold.requestId));assert.throws(()=>p.cancelPreparation(f.ready));
});
test('closed transition graph rejects every impossible operation on validated states',()=>{
 const f=finish(),amb=setup(true);const states=[f.start,p.holdPreparation(f.start),amb.first,f.first,f.pending,p.holdPreparation(f.pending),f.second,f.ready,p.cancelPreparation(f.start)];
 const operations={PASS1_PENDING:s=>p.retryPass1(s,randomUUID()),PASS1_READY:s=>p.clarifyPreparation(s,{}),
 PASS2_PENDING:s=>p.beginPass2(s,randomUUID()),PASS2_READY:s=>p.acceptPass2(s,f.performance),READY:s=>p.completePreparation(s),CANCELLED:s=>p.cancelPreparation(s)};
 for(const s of states)for(const [target,run]of Object.entries(operations))if(!p.transitionAllowed(s.state,target))assert.throws(()=>run(s),`${s.state} -> ${target}`);
 assert.equal(p.transitionAllowed('UNKNOWN','READY'),false);
});
test('all supported transitions exercised with validated state and terminal states cannot resume',()=>{
 const f=finish(),amb=setup(true),hold1=p.holdPreparation(f.start),hold2=p.holdPreparation(f.pending);
 assert.equal(p.retryPass1(hold1,randomUUID()).state,'PASS1_PENDING');assert.throws(()=>p.acceptPass1(hold1,f.production));
 assert.throws(()=>p.clarifyPreparation(hold2,{}));assert.throws(()=>p.acceptPass2(f.first,f.performance));
 for(const s of [f.start,hold1,amb.first,f.first,f.pending,hold2,f.second]){const c=p.cancelPreparation(s);assert.equal(c.state,'CANCELLED');assert.throws(()=>p.beginPass2(c,randomUUID()));assert.throws(()=>p.retryPass1(c,randomUUID()));}
 assert.throws(()=>p.completePreparation(f.pending));assert.throws(()=>p.completePreparation(f.ready));
});
test('clarification token retains Pass 1, resolves only uncertain entries and needs no cache',()=>{
 const f=setup(true),token=t.sealPreparation(f.first,secret,now),restored=t.openPreparation(token,secret,scope(f.first),now+1);
 assert.equal(restored.state,'CLARIFICATION_REQUIRED');assert.deepEqual(restored.production,f.production);
 const answer={inventoryReviewed:true,entries:[f.data.pronunciation.entries[1]]};
 const accepted=p.clarifyPreparation(restored,answer);assert.equal(accepted.state,'PASS1_READY');assert.equal(accepted.authority.acceptance,'owner-confirmed');
 assert.deepEqual(accepted.production,restored.production);assert.deepEqual(accepted.authority.entries[0],restored.authority.entries[0]);
 assert.equal(accepted.authority.revision,restored.authority.revision+1);assert.notEqual(accepted.requestId,restored.requestId);
 assert.throws(()=>p.clarifyPreparation(restored,{inventoryReviewed:true,entries:f.data.pronunciation.entries}));
 const pending=p.beginPass2(accepted,randomUUID());assert.equal(pending.performance,null);
 const perf=unwrap(cp.acceptPerformanceDirection(f.p,f.production,pending.authority,f.delivery));assert.equal(p.completePreparation(p.acceptPass2(pending,perf)).state,'READY');
});
test('technical pronunciation rejection never produces clarification',()=>{const f=setup();const bad=clone(f.production);bad.data.pronunciation.context.inventoryComplete=false;
 assert.throws(()=>p.acceptPass1(f.start,bad));assert.equal(p.holdPreparation(f.start).state,'PASS1_TECHNICAL_HOLD');});
test('Pass-2 retry survives token roundtrip without worker cache',()=>{const f=finish(),hold=p.holdPreparation(f.pending),token=t.sealPreparation(hold,secret,now);
 const s=t.openPreparation(token,secret,scope(hold),now);const retry=p.beginPass2(s,randomUUID());assert.deepEqual(retry.authority,hold.authority);assert.deepEqual(retry.production,hold.production);
 assert.throws(()=>t.openPreparation(token,secret,scope(retry),now));});
for(const what of ['source','document','revision','lineage','epoch'])test('continuation rejects wrong '+what,()=>{const f=setup(),expected=clone(scope(f.first));
 if(what==='source')expected.canonical.text+=' ';if(what==='document')expected.canonical.documentId='other';if(what==='revision')expected.canonical.documentRevision++;if(what==='lineage')expected.preparationId=randomUUID();if(what==='epoch')expected.epoch++;
 assert.throws(()=>t.openPreparation(t.sealPreparation(f.first,secret,now),secret,expected,now));});
test('token expiry, tampering, purpose, version and bounded transport fail closed',()=>{const f=setup(),token=t.sealPreparation(f.first,secret,now);
 assert.throws(()=>t.openPreparation(token,secret,scope(f.first),now+t.PREPARATION_TOKEN_TTL));
 assert.throws(()=>t.openPreparation(token.slice(0,-5)+'abcde',secret,scope(f.first),now));
 assert.throws(()=>t.openPreparation(token,'wrong-secret',scope(f.first),now));
 assert.throws(()=>t.openPreparation(forged(f.first,'preparation-v1',{version:99}),secret,scope(f.first),now));
 assert.throws(()=>t.openPreparation(forged(f.first,'preparation-v1',{purpose:'ready-v3'}),secret,scope(f.first),now));
 assert.throws(()=>t.openPreparation('x'.repeat(450001),secret,scope(f.first),now));
 const huge=unwrap(cp.createCanonicalPreparation('ALICE: '+'a'.repeat(1000001),{productionId:'large'}));assert.throws(()=>t.sealPreparation(p.beginPreparation(huge),secret,now),/PREPARATION_TOO_LARGE/);
});
test('separate caches hit, clone, expire, bound capacity, survive Pass-2 failure',()=>{const f=finish();let clock=0;const c=new PreparationCaches(()=>clock);
 c.putPass1(f.p,f.production);c.putPass2(f.p,f.production,f.pending.authority,f.second.performance);
 assert.deepEqual(c.getPass1(f.p),f.production);assert.deepEqual(c.getPass2(f.p,f.production,f.pending.authority),f.second.performance);
 const hit=c.getPass1(f.p);hit.data.scene.emotionalArc='modified';assert.deepEqual(c.getPass1(f.p),f.production);
 p.holdPreparation(f.pending);assert.ok(c.getPass1(f.p));clock=1800000;assert.equal(c.getPass1(f.p),null);assert.equal(c.getPass2(f.p,f.production,f.pending.authority),null);
 clock=0;for(let i=0;i<17;i++)c.putPass1(f.p,f.production,{...DEFAULT_PREPARATION_SCOPE,acceptedAmbience:{revision:i}});
 assert.equal(c.getPass1(f.p,{...DEFAULT_PREPARATION_SCOPE,acceptedAmbience:{revision:0}}),null);
});
for(const change of ['source','production','character','ambience','pass1','pass2','authority','upstream'])test('cache binding invalidation: '+change,()=>{
 const f=finish(),c=new PreparationCaches(),canonical=clone(f.p),a=clone(f.production),m=clone(f.pending.authority),sc=clone(DEFAULT_PREPARATION_SCOPE);
 c.putPass1(f.p,f.production);c.putPass2(f.p,f.production,f.pending.authority,f.second.performance);
 if(change==='source')canonical.text+=' ';if(change==='production')canonical.productionId='other';if(change==='character')canonical.characters.push({speakerId:'other'});
 if(change==='ambience')sc.acceptedAmbience={environment:'rain'};if(change==='pass1')sc.pass1.prompt++;if(change==='pass2')sc.pass2.prompt++;
 if(change==='authority')m.revision++;if(change==='upstream')a.binding.revision++;
 assert.equal(c.getPass2(canonical,a,m,sc),null);
 assert.equal(!!c.getPass1(canonical,sc),['pass2','authority','upstream'].includes(change));
});
test('invalid artifacts are never cached and old performance cannot bind a revised authority',()=>{const f=finish(),c=new PreparationCaches(),bad=clone(f.production);bad.binding.digest='bad';
 assert.throws(()=>c.putPass1(f.p,bad));const m=authorityHash({...clone(f.pending.authority),revision:2});assert.throws(()=>c.putPass2(f.p,f.production,m,f.second.performance));
 const altered=clone(f.second);altered.authority=m;assert.throws(()=>p.validatePreparation(altered));});
test('Pass-1 cache accepts genuine ambiguity but rejects technically invalid established decisions',()=>{
 const f=setup(true),c=new PreparationCaches();c.putPass1(f.p,f.production);assert.ok(c.getPass1(f.p));
 const bad=clone(f.data);bad.pronunciation.entries[0].resolution.localLanguage='unknown';
 const artifact=unwrap(cp.acceptProductionDirection(f.p,bad));assert.throws(()=>c.putPass1(f.p,artifact));assert.deepEqual(c.getPass1(f.p),f.production);
});
test('legacy tickets coexist and final two-pass ticket recomposes exact plan',()=>{const f=finish(),scene=load('lib/theatre-scene-ticket.ts'),plan=unwrap(cp.composeTheatrePlan(f.p,f.production,f.pending.authority,f.second.performance));
 const legacy=scene.openScene(scene.sealScene(plan,1,secret,now),secret,now);assert.equal(legacy.version,2);assert.deepEqual(legacy.plan.items,plan.items);
 const ready=t.sealTwoPassScene(f.ready,1,secret,now),opened=scene.openScene(ready,secret,now);assert.equal(opened.version,3);assert.deepEqual(opened.plan,plan);
 assert.throws(()=>t.openPreparation(ready,secret,scope(f.ready),now));assert.throws(()=>scene.openScene(ready,secret,now+t.PREPARATION_TOKEN_TTL));
});
for(const part of ['production','performance','authority','source','revision'])test('authenticated READY rejects altered '+part+' binding',()=>{const f=finish(),s=clone(f.ready);
 if(part==='production')s.production.binding.digest='bad';if(part==='performance')s.performance.binding.digest='bad';if(part==='authority')s.authority.digest='bad';if(part==='source')s.canonical.text+=' ';if(part==='revision')s.canonical.documentRevision++;
 assert.throws(()=>load('lib/theatre-scene-ticket.ts').openScene(forged(s),secret,now));});
test('forged READY wrappers cannot promote partial preparation',()=>{const f=finish(),amb=setup(true);
 for(const s of [f.start,p.holdPreparation(f.start),amb.first,f.first,f.pending,p.holdPreparation(f.pending),f.second,p.cancelPreparation(f.pending)]){
 assert.throws(()=>t.sealTwoPassScene(s,1,secret,now));assert.throws(()=>load('lib/theatre-scene-ticket.ts').openScene(forged(s),secret,now));
 if(s.state!=='CANCELLED')assert.throws(()=>load('lib/theatre-scene-ticket.ts').openScene(t.sealPreparation(s,secret,now),secret,now));
 }});
test('actual theatre-clip route rejects every partial token; only READY reaches mocked synthesis',async()=>{
 let calls=0;const routeLoad=require('./load-typescript.cjs')({openai:class{audio={speech:{create:async()=>{calls++;return{arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer};}}};}});
 const original=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY=secret;
 try{const route=routeLoad('app/api/theatre-clip/route.ts'),f=finish(),amb=setup(true);
 for(const s of [f.start,p.holdPreparation(f.start),amb.first,f.first,f.pending,p.holdPreparation(f.pending),f.second]){
 const response=await route.POST(new Request('http://localhost/api/theatre-clip',{method:'POST',body:JSON.stringify({sceneToken:t.sealPreparation(s,secret),itemId:f.p.items[1].id,componentIndex:0})}));assert.equal(response.status,410);}
 assert.equal(calls,0);const response=await route.POST(new Request('http://localhost/api/theatre-clip',{method:'POST',body:JSON.stringify({sceneToken:t.sealTwoPassScene(f.ready,1,secret),itemId:f.p.items[1].id,componentIndex:0})}));assert.equal(response.status,200);assert.equal(calls,1);
 }finally{if(original===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=original;}
});
