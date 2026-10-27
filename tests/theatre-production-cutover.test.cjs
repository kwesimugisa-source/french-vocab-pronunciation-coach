const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const createLoader=require('./load-typescript.cjs');
const {fixture}=require('./two-pass-protocol-fixtures.cjs');
const {environment,flush,deferred}=require('./playback-fixtures.cjs');
const load=createLoader({openai:class{constructor(){throw Error('Real provider forbidden');}}});
const {mockEvidenceResponse}=require('./pass1-evidence-fixtures.cjs');
const adapter=load('lib/theatre-production-preparation.ts'),secret='mock-only-cp4';
const response=raw=>({status:'completed',output_text:JSON.stringify(raw),output:[],usage:{input_tokens:20,output_tokens:30,total_tokens:50,output_tokens_details:{reasoning_tokens:0}}});
function harness(change=(r)=>r,text){const f=fixture(text),rows=[],calls=[];const client={responses:{create:async(r,o)=>{const pass=r.text.format.name==='theatre_pass1'?'pass1':'pass2';calls.push({pass,r,o});return mockEvidenceResponse(change(response(pass==='pass1'?f.data:{performance:f.delivery}),pass,f),r);}}};
 const input={text:f.p.text,documentId:'fixture',revision:1,performanceStyle:'naturel'};
 const options={client,secret,speed:1,caches:new(load('lib/theatre-preparation-cache.ts').PreparationCaches)(),sink:r=>rows.push(r)};
 async function send(extra={}){const requestId=randomUUID(),r=await adapter.prepareProductionResponse({...input,...extra},{...options,requestId});return {r,data:await r.json(),requestId};}
 return {f,rows,calls,options,input,send};}
async function both(h){const a=await h.send(),b=await h.send({preparationContinuation:a.data.preparationContinuation});return {a,b};}

test('production adapter: separate requests, exact compatible READY, bounded one-terminal recorder',async()=>{const h=harness(),{a,b}=await both(h);
 assert.equal(a.data.mode,'theatre-preparation');assert.equal(b.data.protocol,'incremental-v1');assert.match(b.data.sceneToken,/^ready-v3\./);assert.equal(h.calls.length,2);
 load('lib/theatre-incremental.ts').assertTheatreManifest(b.data,h.input.text);
 const plan=load('lib/theatre-scene-ticket.ts').openScene(b.data.sceneToken,secret).plan;
 assert.deepEqual(plan.items,h.f.p.items);assert.deepEqual(plan.casting,h.f.p.casting);assert.equal(plan.performanceStyle,'naturel');assert.equal(plan.pronunciation.status,'ready');
 for(const c of h.calls){assert.equal(c.o.timeout,60000);assert.equal(c.o.maxRetries,0);}
 for(const x of [a,b]){const receipt=JSON.parse(x.r.headers.get('X-Theatre-Preparation-Receipt'));assert.equal(receipt.requestId,x.requestId);const rows=h.rows.filter(r=>r.requestId===x.requestId);assert.equal(rows.filter(r=>r.disposition).length,1);assert.ok(rows.length<=64);assert.ok(rows.every(r=>JSON.stringify(r).length<=1024));}
 assert.doesNotMatch(JSON.stringify(h.rows),/ALICE|MARC|target|quote|digest|token|Bonjour/);
});
test('empty pronunciation inventory continues without clarification',async()=>{const h=harness(undefined,'[La salle est vide.]'),{a,b}=await both(h);assert.equal(a.data.mode,'theatre-preparation');assert.equal(b.data.mode,'theatre');});
test('genuine ambiguity uses existing form and resumes without Pass-1 rerun',async()=>{const h=harness((r,p,f)=>{if(p==='pass1'){const d=structuredClone(f.data);d.pronunciation.entries[1].resolution.status='ambiguous';return response(d);}return r;});
 const a=await h.send();assert.equal(a.data.mode,'pronunciation-clarification');assert.equal(a.data.entries.length,1);assert.equal(h.calls.length,1);assert.equal(a.data.pronunciationToken,a.data.preparationContinuation.token);
 const b=await h.send({preparationContinuation:a.data.preparationContinuation,pronunciationAnswer:{inventoryReviewed:true,entries:[h.f.data.pronunciation.entries[1]]}});assert.equal(b.data.mode,'theatre');assert.equal(h.calls.filter(c=>c.pass==='pass1').length,1);
});
test('clarification cannot overwrite established entries',async()=>{const h=harness((r,p,f)=>{if(p==='pass1'){const d=structuredClone(f.data);d.pronunciation.entries[1].resolution.status='ambiguous';return response(d);}return r;});const a=await h.send();const b=await h.send({preparationContinuation:a.data.preparationContinuation,pronunciationAnswer:{inventoryReviewed:true,entries:h.f.data.pronunciation.entries}});assert.equal(b.r.status,400);assert.equal(h.calls.length,1);});
for(const field of ['text','revision','documentId','performanceStyle','epoch','preparationId','productionId','token'])test('continuation rejects changed '+field,async()=>{const h=harness(),a=await h.send(),c=structuredClone(a.data.preparationContinuation),extra={preparationContinuation:c};
 if(field==='text')extra.text=h.input.text+'\n[Fin.]';else if(field==='revision')extra.revision=2;else if(field==='documentId')extra.documentId='other';else if(field==='performanceStyle')extra.performanceStyle='clarte';else if(field==='epoch')c.epoch++;else if(field==='token')c.token=c.token.slice(0,30)+(c.token[30]==='A'?'B':'A')+c.token.slice(31);else c[field]+='x';
 const b=await h.send(extra);assert.equal(b.r.status,410);assert.equal(h.calls.length,1);});
for(const pass of ['pass1','pass2'])for(const kind of ['timeout','schema','semantic'])test(pass+' '+kind+' remains technical hold without fallback/retry',async()=>{
 const h=harness((r,p,f)=>{if(p!==pass)return r;if(kind==='timeout'){const e=Error('private');e.name='APIConnectionTimeoutError';throw e;}if(kind==='schema')return response({});const d=structuredClone(pass==='pass1'?f.data:f.delivery);if(pass==='pass1')d.director.beats[0].presenceEvidence=[{itemId:f.p.items.at(-1).id,quote:f.p.items.at(-1).text}];else d.items.pop();return response(pass==='pass1'?d:{performance:d});});
 const a=await h.send(),b=pass==='pass2'?await h.send({preparationContinuation:a.data.preparationContinuation}):a;assert.equal(b.r.status,503);assert.equal(b.data.code,'THEATRE_ANALYSIS_FAILED');assert.equal(b.data.retryable,true);assert.equal(b.data.mode,undefined);assert.equal(h.calls.length,pass==='pass1'?1:2);
});
test('Pass-2 explicit retry preserves exact upstream, independent of process cache',async()=>{let fail=true;const h=harness((r,p)=>{if(p==='pass2'&&fail){fail=false;return {...r,status:'incomplete'};}return r;});const {a,b}=await both(h);
 h.options.caches=new(load('lib/theatre-preparation-cache.ts').PreparationCaches)();const c=await h.send({preparationContinuation:b.data.preparationContinuation});assert.equal(c.data.mode,'theatre');assert.equal(h.calls.filter(c=>c.pass==='pass1').length,1);assert.equal(h.calls.filter(c=>c.pass==='pass2').length,2);
 const before=load('lib/theatre-preparation-token.ts').openPreparation(a.data.preparationContinuation.token,secret,{preparationId:a.data.preparationContinuation.preparationId,epoch:a.data.preparationContinuation.epoch,canonical:load('lib/theatre-scene-ticket.ts').openScene(c.data.sceneToken,secret).plan && load('lib/theatre-two-pass.ts').createCanonicalPreparation(h.input.text,{productionId:a.data.preparationContinuation.productionId,documentId:'fixture',documentRevision:1,performanceStyle:'naturel'}).value});
 const plan=load('lib/theatre-scene-ticket.ts').openScene(c.data.sceneToken,secret).plan;assert.deepEqual(plan.pronunciation,before.authority);
 assert.notEqual(b.requestId,c.requestId);assert.equal(JSON.parse(b.r.headers.get('X-Theatre-Preparation-Receipt')).lineage.preparationId,JSON.parse(c.r.headers.get('X-Theatre-Preparation-Receipt')).lineage.preparationId);
});
test('explicit continuation reuses exact stage caches without another provider call',async()=>{const h=harness(),{a}=await both(h);const repeat=await h.send({preparationContinuation:a.data.preparationContinuation});assert.equal(repeat.data.mode,'theatre');assert.equal(h.calls.length,2);});
test('lexical gap requires fresh upstream rather than offering unsafe Pass-2 retry',async()=>{const h=harness((r,p)=>p==='pass2'?response({performance:{lexicalGaps:'upstream_revision_required'}}):r),{b}=await both(h);assert.equal(b.r.status,503);assert.equal(b.data.preparationContinuation,undefined);});

test('actual read-passage dispatch is server-owned and TWO_PASS cannot invoke monolithic',async()=>{
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY=secret;
 try{for(const strategy of ['MONOLITHIC','TWO_PASS']){let mono=0,two=0;const l=createLoader({openai:class{},'../../../lib/theatre-preparation-strategy':{preparationStrategy:()=>strategy},'../../../lib/theatre-production-preparation':{prepareProductionResponse:async()=>{two++;return Response.json({code:'THEATRE_ANALYSIS_FAILED'},{status:503});}},'../../../lib/theatre-generation':{TheatreGenerationError:class extends Error{},prepareTheatrePlan:async()=>{mono++;throw Error('mock failure');}}});
 const route=l('app/api/read-passage/route.ts');await route.POST(new Request('http://localhost/api/read-passage',{method:'POST',body:JSON.stringify({text:'ALICE: Bonjour.',contentType:'theatre',strategy:strategy==='TWO_PASS'?'MONOLITHIC':'TWO_PASS'})}));assert.equal(mono,strategy==='MONOLITHIC'?1:0);assert.equal(two,strategy==='TWO_PASS'?1:0);}
 }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
test('repository strategy has a deterministic explicit rollback default',()=>{assert.equal(load('lib/theatre-preparation-strategy.ts').preparationStrategy(),'MONOLITHIC');});

test('client continues preparation once, then uses existing incremental playback and role hold',async()=>{const h=harness(),env=environment(),requests=[];const Session=load('lib/reading-playback.ts').ReadingPlaybackSession;
 const s=new Session(env,async(url,o)=>{if(url==='/api/read-passage'){requests.push(JSON.parse(o.body));return adapter.prepareProductionResponse(JSON.parse(o.body),{...h.options,requestId:o.headers['X-Theatre-Request-Id']});}return Response.json({});});
 await s.changeTheatreStyle('naturel',h.input.text,'normal',{documentId:'fixture',revision:1,contentType:'theatre'});
 await s.start(h.input.text,'normal',{documentId:'fixture',revision:1,contentType:'theatre'},undefined,'ALICE');await flush();
 assert.equal(requests.length,2);assert.equal(h.calls.length,2);assert.equal(s.getSnapshot().mode,'theatre');assert.equal(s.getSnapshot().theatre.queue.length,h.f.p.items.length);s.dispose();
});
test('client Pass-2 failure retains continuation for explicit retry only',async()=>{let fail=true;const h=harness((r,p)=>{if(p==='pass2'&&fail){fail=false;throw Error('private');}return r;}),env=environment(),Session=load('lib/reading-playback.ts').ReadingPlaybackSession;
 const durations=new Map(),setTimer=env.setTimer;env.setTimer=(fn,ms)=>{const id=setTimer(fn,ms);durations.set(id,ms);return id;};
 const s=new Session(env,async(url,o)=>url==='/api/read-passage'?adapter.prepareProductionResponse(JSON.parse(o.body),{...h.options,requestId:o.headers['X-Theatre-Request-Id']}):Response.json({}));const identity={documentId:'fixture',revision:1,contentType:'theatre'};
 await s.changeTheatreStyle('naturel',h.input.text,'normal',identity);await s.start(h.input.text,'normal',identity);assert.equal(h.calls.length,2);assert.match(s.getSnapshot().error,/préparation/);assert.equal(s.getSnapshot().clarification,null);await s.start(h.input.text,'normal',identity);assert.equal(h.calls.filter(c=>c.pass==='pass1').length,1);assert.equal(h.calls.length,3);s.dispose();
});
test('cancelled client cannot attach a late Pass-1 continuation or start Pass 2',async()=>{const env=environment(),d=deferred(),Session=load('lib/reading-playback.ts').ReadingPlaybackSession;let calls=0;const s=new Session(env,()=>{calls++;return d.promise;});const job=s.start('ALICE: Bonjour.','normal',{documentId:'fixture',revision:1,contentType:'theatre'});s.stop();await job;d.resolve(Response.json({mode:'theatre-preparation',preparationContinuation:{token:'preparation-v1.x',productionId:'x',preparationId:randomUUID(),epoch:1}}));await flush();assert.equal(calls,1);assert.equal(env.audios.length,0);s.dispose();});

test('fresh same-source requests reuse validated stage caches; source revision invalidates',async()=>{const h=harness();await both(h);await both(h);assert.equal(h.calls.length,2);await h.send({revision:2});assert.equal(h.calls.length,3);});

for(const style of ['clarte','naturel'])test('READY-v3 existing playback/prefetch/replay/pause/role/narrator/chorus '+style,async()=>{
 const text='[Alice et Marc sont dans une salle.]\nALICE: Bonjour, Marc.\nMARC: Bonjour, Alice.\nLE CHŒUR: Ensemble !\n[Silence.]\nALICE: Nous sommes prêts.';
 const h=harness(undefined,text);h.input.performanceStyle=style;
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY=secret;const speech=[];
 const l=createLoader({openai:class{audio={speech:{create:async b=>{speech.push(b);return{arrayBuffer:async()=>Buffer.from(b.input)};}}};}});
 const clip=l('app/api/theatre-clip/route.ts').POST,env=environment(),Session=l('lib/reading-playback.ts').ReadingPlaybackSession;
 const tick=()=>new Promise(r=>setImmediate(r)),until=async fn=>{for(let i=0;i<1500;i++){if(fn())return;await tick();}assert.fail('playback did not settle');};
 const durations=new Map(),setTimer=env.setTimer;env.setTimer=(fn,ms)=>{const id=setTimer(fn,ms);durations.set(id,ms);return id;};
 const s=new Session(env,async(url,o)=>url==='/api/read-passage'?adapter.prepareProductionResponse(JSON.parse(o.body),{...h.options,requestId:o.headers['X-Theatre-Request-Id']}):clip(new Request('http://localhost'+url,o)));
 try{const identity={documentId:'fixture',revision:1,contentType:'theatre'};await s.changeTheatreStyle(style,text,'normal',identity);await s.start(text,'normal',identity,undefined,'ALICE');await until(()=>s.theatre.getSnapshot().status==='playing');
 assert.equal(s.theatre.getSnapshot().queue.length,6);assert.deepEqual(s.getSnapshot().ambience.environment,'none');
 const first=env.latest();s.theatre.pause();assert.equal(s.theatre.getSnapshot().status,'paused');s.theatre.resume();assert.ok(first.playCalls>=2);s.theatre.replay();await tick();env.latest().end();assert.equal(s.theatre.getSnapshot().status,'learner_turn');
 assert.equal(s.theatre.continueLearner(s.theatre.getSnapshot().learnerTurn),true);await until(()=>s.theatre.getSnapshot().status==='playing');env.latest().end();await until(()=>s.theatre.getSnapshot().currentIndex===3&&s.theatre.getSnapshot().status==='playing');await tick();env.audios.filter(a=>!a.removed).forEach(a=>a.end());await tick();assert.equal(s.theatre.getSnapshot().currentIndex,4,'chorus advanced');for(const [id,fn] of env.timers)if(durations.get(id)===900){env.timers.delete(id);fn();}assert.equal(s.theatre.getSnapshot().status,'learner_turn',JSON.stringify({status:s.theatre.getSnapshot().status,index:s.theatre.getSnapshot().currentIndex,error:s.theatre.getSnapshot().error}));s.theatre.continueLearner(s.theatre.getSnapshot().learnerTurn);assert.equal(s.theatre.getSnapshot().status,'completed');
 assert.equal(h.calls.length,2);assert.equal(speech.length,5);assert.ok(speech.every(b=>b.model==='gpt-4o-mini-tts'&&b.instructions.includes('French')));assert.equal(speech.filter(b=>b.input==='Ensemble !').length,3);assert.ok(!speech.some(b=>b.input==='Bonjour, Marc.'));assert.equal(s.theatre.getSnapshot().completions.length,6);
 }finally{s.dispose();if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});

test('117-item fabricated control validates both mocked production stages and compatible manifest',async()=>{const text=require('./two-pass-production-fixture.cjs').productionText(),h=harness(undefined,text);assert.equal(h.f.p.items.length,117);assert.equal(h.f.p.casting.members.filter(m=>m.role==='character').length,4);
 const {ref}=require('./director-fixtures.cjs');h.f.data.director.beats=[0,39,78].map(i=>({at:h.f.p.items[i].id,event:{value:'Work progresses',evidence:[ref(h.f.p.items[i])]},present:['ALICE','MARC','JULIE','PAUL'],presenceEvidence:[ref(h.f.p.items[0])],states:[]}));
 const {b}=await both(h);assert.equal(b.r.status,200);assert.equal(b.data.clips.length,117);assert.equal(b.data.clips.filter(c=>c.chorus).length,3);assert.equal(h.calls.length,2);assert.equal(b.data.integrity.generatedClipCount,0);
});
