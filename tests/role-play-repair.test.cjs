const test=require('node:test'),assert=require('node:assert/strict');
const load=require('./load-typescript.cjs')();
const {IncrementalTheatreLoader,THEATRE_LOOKAHEAD,THEATRE_PREPARATION_CONCURRENCY}=load('lib/theatre-incremental.ts');
const {harness,until,tick}=require('./incremental-fixtures.cjs');
const {deferred}=require('./playback-fixtures.cjs');

for(const style of ['clarte','naturel'])test(`ordinary and role-play final TTS configurations are identical: ${style}`,async()=>{
 const text='THOMAS: Je suis ici.\nJULIEN: Thomas !\nÉLISE: Thomas ?\nÉLISE: Thomas.\nÉLISE: Thomas...\n[Thomas prend une longue inspiration.]\n[Thomas regarde sa serviette soigneusement pliée devant lui.]\n[Thomas reste immobile.]';
 async function perform(role){
  const h=harness();await h.session.changeTheatreStyle(style,text,'normal',h.doc);await h.session.start(text,'normal',h.doc,undefined,role);
  for(let i=0;i<8;i++){
   await until(()=>h.session.theatre.getSnapshot().currentIndex===i&&['playing','learner_turn'].includes(h.session.theatre.getSnapshot().status));
   const s=h.session.theatre.getSnapshot();if(s.learnerTurn)h.session.theatre.continueLearner(s.learnerTurn);else h.env.latest().end();
  }
  assert.equal(h.session.theatre.getSnapshot().status,'completed');assert.ok(h.stats.peak<=2);assert.equal(h.stats.analyses,1);
  const bodies=h.stats.calls.map(c=>c.body).sort((a,b)=>a.input.localeCompare(b.input));h.session.dispose();return bodies;
 }
 const ordinary=await perform(),role=await perform('THOMAS');assert.equal(ordinary.length,8);assert.equal(role.length,7);
 assert.deepEqual(role,ordinary.filter(b=>b.input!=='Je suis ici.'));
 for(const b of role){assert.match(b.instructions,/conventional French pronunciation/);assert.match(b.instructions,/not all French final consonants are silent/);}
 assert.match(role.find(b=>b.input==='Thomas ?').instructions,/interrogative/);
});

test('first/consecutive holds prefetch only six canonical positions; rapid Continue joins pending audio in order',async t=>{
 const gates=new Map(),h=harness(async b=>{const g=deferred();gates.set(b.input,g);await g.promise;return {arrayBuffer:async()=>Buffer.from(b.input)};});
 t.after(()=>{h.session.dispose();for(const g of gates.values())g.resolve();});
 const text=['THOMAS: Un.','THOMAS: Deux.',...Array.from({length:4},(_,i)=>`THOMAS: Attente ${i}.`),'[Thomas entre.]','ÉLISE: Bonjour.'].join('\n');
 await h.session.start(text,'normal',h.doc,undefined,'THOMAS');await until(()=>gates.has('[Thomas entre.]'));
 assert.equal(h.session.theatre.getSnapshot().learnerTurn.index,0);assert.equal(h.stats.calls.length,1);
 h.session.theatre.continueLearner(h.session.theatre.getSnapshot().learnerTurn);await until(()=>gates.has('Bonjour.'));
 assert.equal(h.stats.calls.length,2);assert.equal(THEATRE_LOOKAHEAD,6);assert.equal(THEATRE_PREPARATION_CONCURRENCY,2);
 for(let i=1;i<6;i++)h.session.theatre.continueLearner(h.session.theatre.getSnapshot().learnerTurn);
 assert.equal(h.session.theatre.getSnapshot().currentIndex,6);assert.equal(h.env.audios.length,0);
 gates.get('Bonjour.').resolve();await tick();assert.equal(h.env.audios.length,0);
 gates.get('[Thomas entre.]').resolve();await until(()=>h.session.theatre.getSnapshot().status==='playing');
 assert.equal(h.session.theatre.getSnapshot().currentIndex,6);h.env.latest().end();await until(()=>h.session.theatre.getSnapshot().status==='playing');
 assert.equal(h.session.theatre.getSnapshot().currentIndex,7);h.env.latest().end();assert.equal(h.session.theatre.getSnapshot().status,'completed');
 assert.equal(h.stats.calls.length,2);assert.ok(h.stats.peak<=2);assert.deepEqual(h.session.theatre.getSnapshot().completions.map(c=>c.itemId),Array.from({length:8},(_,i)=>'line-'+(i+1)));h.session.dispose();
});

for(const replacement of ['character','document','session'])test(`held prefetch cannot attach after ${replacement} replacement`,async()=>{
 const gate=deferred(),h=harness(async b=>{if(b.input==='Ancien.')await gate.promise;return {arrayBuffer:async()=>Buffer.from(b.input)};});
 await h.session.start('THOMAS: Attente.\nÉLISE: Ancien.','normal',h.doc,undefined,'THOMAS');await until(()=>h.stats.calls.length===1);
 const old=h.session.theatre.getSnapshot().learnerTurn;h.session.stop();
 const speaker=replacement==='character'?'ÉLISE':'THOMAS',doc=replacement==='document'?{...h.doc,documentId:'replacement',revision:2}:h.doc;
 await h.session.start(`${speaker}: Nouveau.`,'normal',doc,undefined,speaker);const current=h.session.theatre.getSnapshot().learnerTurn;
 gate.resolve();await tick();await tick();assert.equal(h.session.theatre.getSnapshot().learnerTurn,current);assert.equal(h.session.theatre.continueLearner(old),false);
 assert.equal(h.env.audios.length,0);assert.equal(h.session.theatre.getSnapshot().queue.length,1);h.session.dispose();
});

function fixture(fetcher,validate=async()=>({status:'valid'}),headers=()=>({authorization:'credential-marker'})){
 const clip={id:'item-0',index:0,type:'dialogue',speaker:'MARC',text:'private-authored-marker',sourceLines:[1],voice:'alloy',speed:1,audioBase64:''};
 const good={mode:'theatre-component',itemId:clip.id,componentIndex:0,voice:'alloy',speed:1,audioBase64:'YQ=='};
 const loader=new IncrementalTheatreLoader({clips:[clip],sceneToken:'private-token-marker'},fetcher??(async()=>Response.json(good)),headers,7,false,validate);
 return {loader,good};
}
function safe(events){
 assert.doesNotMatch(JSON.stringify(events),/private-|credential-marker|response-marker|secret-error|audioBase64|sceneToken|authorization|https:/);
 for(const e of events)assert.ok(Object.keys(e).every(k=>['index','phase','component','session','attempt','at','failureCategory','httpStatus'].includes(k)));
}
for(const [status,category] of [[502,'http_failure'],[408,'http_failure'],[429,'rate_limited'],[410,'ticket_expired']])test(`content-free failure category for HTTP ${status}`,async()=>{
 const {loader}=fixture(async()=>Response.json({body:'response-marker',token:'private-token-marker'},{status}));await assert.rejects(loader.load(0));
 const e=loader.getDiagnostics().find(e=>e.phase==='failed');assert.equal(e.failureCategory,category);assert.equal(e.httpStatus,status);assert.equal(e.component,0);safe(loader.getDiagnostics());
});
for(const kind of ['network_failure','malformed_response','validation_invalid','internal_failure'])test(`content-free ${kind}`,async()=>{
 const {loader}=fixture(kind==='network_failure'?async()=>{throw Error('secret-error');}:kind==='malformed_response'?async()=>Response.json({body:'response-marker'}):undefined,
  async()=>({status:kind==='validation_invalid'?'invalid':'valid'}),kind==='internal_failure'?()=>{throw Error('credential-marker');}:undefined);
 await assert.rejects(loader.load(0));const e=loader.getDiagnostics().find(e=>e.phase==='failed');assert.equal(e.failureCategory,kind);
 assert.equal(e.httpStatus,['malformed_response','validation_invalid'].includes(kind)?200:undefined);safe(loader.getDiagnostics());
});
test('late cancelled response reports stale and cancellation without preparing audio',async()=>{
 const gate=deferred();let requested=false;const {loader,good}=fixture(async()=>{requested=true;return gate.promise;});const work=loader.load(0);await until(()=>requested);loader.dispose();gate.resolve(Response.json(good));await assert.rejects(work);
 const events=loader.getDiagnostics();assert.ok(events.some(e=>e.phase==='stale'&&e.failureCategory==='stale'&&e.httpStatus===200));assert.ok(events.some(e=>e.phase==='failed'&&e.failureCategory==='cancelled'));assert.ok(!events.some(e=>e.phase==='prepared'));safe(events);
});
test('failure trace remains bounded over repeated attempts',async()=>{
 const {loader}=fixture(async()=>Response.json({body:'response-marker'},{status:502}));for(let i=0;i<350;i++)await assert.rejects(loader.load(0));
 assert.equal(loader.getDiagnostics().length,1024);assert.ok(loader.getDroppedEvents()>0);assert.equal(loader.getDiagnostics().at(-1).attempt,350);safe(loader.getDiagnostics());
});
test('generic French name guidance preserves authored text and treats final letters conditionally',()=>{
 const {theatreLinguisticGuidance}=load('lib/theatre-linguistic.ts');
 for(const text of ['Thomas !','Louis ?','Marc.','Paul…','Ah !','Euh…'])for(const type of ['dialogue','stage']){
  const item={text,type,speaker:type==='stage'?'NARRATOR':'ÉLISE'};const before=structuredClone(item),guidance=theatreLinguisticGuidance(item);
  assert.match(guidance,/particular name or word; not all French final consonants are silent/);assert.deepEqual(item,before);
 }
});

test('required pending job is promoted ahead of queued lookahead without duplication',async()=>{
 const gates=Array.from({length:4},()=>deferred()),started=[];
 const clips=Array.from({length:4},(_,index)=>({id:`item-${index}`,index,type:'dialogue',speaker:'MARC',text:'private-authored-marker',voice:'alloy',speed:1,audioBase64:''}));
 const loader=new IncrementalTheatreLoader({clips,sceneToken:'private-token-marker'},async(_,o)=>{
  const {itemId}=JSON.parse(o.body),index=Number(itemId.slice(5));started.push(index);await gates[index].promise;
  return Response.json({mode:'theatre-component',itemId,componentIndex:0,voice:'alloy',speed:1,audioBase64:'YQ=='});
 },()=>({}),7,false,async()=>({status:'valid'}));
 const work=clips.map((_,i)=>loader.load(i));await until(()=>started.length===2);assert.deepEqual(started,[0,1]);
 assert.equal(loader.load(3,true),work[3]);gates[0].resolve();await until(()=>started.length===3);assert.deepEqual(started,[0,1,3]);
 gates[1].resolve();await until(()=>started.length===4);assert.deepEqual(started,[0,1,3,2]);gates[2].resolve();gates[3].resolve();await Promise.all(work);loader.dispose();
});
test('synchronous stop on entering learner hold prevents prefetch',async()=>{
 const h=harness();const off=h.session.theatre.subscribe(()=>{if(h.session.theatre.getSnapshot().status==='learner_turn')h.session.stop();});
 await h.session.start('THOMAS: Attente.\nÉLISE: Bonjour.','normal',h.doc,undefined,'THOMAS');await tick();
 assert.equal(h.stats.calls.length,0);assert.equal(h.session.theatre.getSnapshot().status,'idle');off();h.session.dispose();
});
