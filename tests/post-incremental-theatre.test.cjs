const test=require('node:test'),assert=require('node:assert/strict');
const createLoader=require('./load-typescript.cjs');
const {harness,until,tick,request}=require('./incremental-fixtures.cjs');

function clock(){let now=0,id=0;const jobs=new Map();return {
 get now(){return now;}, jobs,
 set(fn,ms){const key=++id;jobs.set(key,{at:now+ms,fn});return key;},
 clear(key){jobs.delete(key);},
 next(){const entry=[...jobs].sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!entry)return false;jobs.delete(entry[0]);now=entry[1].at;entry[1].fn();return true;}
};}
const acceptance='ÉLISE : Apparemment.\nÉLISE : Non.\nJULIEN : Des fiançailles ?\n[Silence.]\nJULIEN : Oh.\n[Élise se fige.]\n[Thomas prend une longue inspiration.]\n[La pluie devient plus forte.]';

test('semantic pause grammar is narrow, canonical, bounded and never matches dialogue/actions',()=>{
 const {parseTheatreItems,SEMANTIC_PAUSE_MS}=createLoader()('lib/theatre.ts');
 for(const text of ['[Silence.]','(Un silence.)','[Une pause.]','[Un temps.]','[Un long silence.]','[Pause…]']){
  const [item]=parseTheatreItems(text);assert.equal(item.pauseMs,900);assert.equal(item.pauseMs,SEMANTIC_PAUSE_MS);assert.equal(item.text,text);assert.equal(item.type,'stage');
 }
 for(const text of ['[Élise se fige.]','[Thomas prend une longue inspiration.]','[La pluie devient plus forte.]','[Le silence inquiète Élise.]','JULIEN: Silence.','JULIEN: Oh.','[Silence, puis Julien sourit.]'])assert.equal(parseTheatreItems(text)[0].pauseMs,undefined);
});

for(const style of ['clarte','naturel'])test(`acceptance sequence ${style}: silence reaches Director, never TTS; short narrator retains French`,async()=>{
 const h=harness();const manifest=await (await h.prepare(request({text:acceptance,contentType:'theatre',performanceStyle:style}))).json();
 assert.equal(manifest.clips.length,8);assert.equal(manifest.clips[3].pauseMs,900);assert.equal(manifest.clips[3].text,'[Silence.]');
 assert.ok(h.stats.analysisInputs[0].input[1].content.includes('[Silence.]'));
 const forbidden=await h.clip(request({sceneToken:manifest.sceneToken,itemId:manifest.clips[3].id,componentIndex:0}));assert.equal(forbidden.status,400);assert.equal(h.stats.calls.length,0);
 const loader=new (h.load('lib/theatre-incremental.ts').IncrementalTheatreLoader)(manifest,h.fetcher,()=>({}));
 for(let i=0;i<manifest.clips.length;i++)await loader.load(i);
 assert.deepEqual(h.stats.calls.map(c=>c.body.input),manifest.clips.filter(c=>!c.pauseMs).map(c=>c.text));
 for(const c of h.stats.calls){assert.match(c.body.instructions,/Document language: French \(fr\)/);assert.match(c.body.instructions,/Do not infer English/);assert.match(c.body.instructions,/including very short or isolated utterances/);}
 const oh=h.stats.calls.find(c=>c.body.input==='Oh.');assert.match(oh.body.instructions,/preceding authored stage direction is a silent dramatic beat/);
 if(style==='naturel')assert.match(oh.body.instructions,/Scene-aware Director context/);
 assert.equal(h.stats.analyses,1);loader.dispose();h.session.dispose();
});

async function timedScene(generationMs,playMs,{concurrency,lookahead,source,style="clarte"}={}){
 const time=clock();const h=harness(async b=>{await new Promise(r=>time.set(r,generationMs*(b.input.includes('Ligne 7.')?1.7:1)));return {arrayBuffer:async()=>Buffer.from(b.input)};});
 // Test-only comparison against the previous serialized/two-item policy.
 const config=h.load('lib/theatre-incremental.ts');if(concurrency)config.THEATRE_PREPARATION_CONCURRENCY=concurrency;if(lookahead)config.THEATRE_LOOKAHEAD=lookahead;
 h.env.setTimer=(fn,ms)=>time.set(fn,ms);h.env.clearTimer=id=>time.clear(id);
 const played=[],finished=[];const createAudio=h.env.createAudio;
 h.env.createAudio=url=>{const a=createAudio(url);let timer; a.play=async()=>{
  a.playCalls++;const text=await h.env.created.find(x=>x.url===url).blob.text();played.push(text);
  timer=time.set(()=>{finished.push(text);a.end();},playMs);
 };a.pause=()=>{a.pauseCalls++;time.clear(timer);};return a;};
 const text=source??Array.from({length:60},(_,i)=>i===23?'[Silence.]':`${i%2?'ÉLISE':'JULIEN'}: Ligne ${i+1}. Nous attendons ensemble dans cette salle pour comprendre ce qui vient de se passer et retrouver nos amis avant la fin de cette longue soirée.`).join('\n');
 const parsed=h.load('lib/theatre.ts').parseTheatreItems(text);
 const authoredLines=text.split('\n'),expected=authoredLines.filter(line=>line!=='[Silence.]').map(line=>line.startsWith('[')?line:line.slice(line.indexOf(':')+1).trim());
 assert.equal(parsed.length,source?8:60);assert.deepEqual(parsed.map(i=>i.id),authoredLines.map((_,i)=>'line-'+(i+1)));assert.deepEqual(parsed.filter(i=>!i.pauseMs).map(i=>i.text),expected);
 let buffering=0,entered=null,started=false,firstPlayAt=null;
 const off=h.session.theatre.subscribe(()=>{const s=h.session.theatre.getSnapshot();if(s.status==='buffering'&&entered===null&&started)entered=time.now;if(s.status==='playing'){if(firstPlayAt===null)firstPlayAt=time.now;started=true;}if(s.status!=='buffering'&&entered!==null){buffering+=time.now-entered;entered=null;}});
 await h.session.changeTheatreStyle(style,text,'normal',h.doc);await h.session.start(text,'normal',h.doc);
 for(let n=0;n<2500&&h.session.theatre.getSnapshot().status!=='completed';n++){
  await tick();await tick(); // Let route/body/media promises settle before virtual time moves.
  assert.notEqual(h.session.theatre.getSnapshot().status,'error');time.next();
 }
 assert.equal(h.session.theatre.getSnapshot().status,'completed');
 assert.deepEqual(played,expected);assert.deepEqual(finished,expected);
 const trace=h.session.theatre.getDiagnostics();
 for(const phase of ['logical','play','ended','advance'])assert.deepEqual(trace.filter(e=>e.phase===phase).map(e=>e.index),parsed.map(i=>i.index),phase);
 assert.deepEqual(h.session.theatre.getSnapshot().completions.map(c=>c.itemId),parsed.map(i=>i.id));
 assert.equal(h.stats.calls.length,expected.length);assert.ok(h.stats.peak<=(concurrency??2));
 assert.equal(h.stats.requests.find(r=>r.url==='/api/read-passage').count,0);assert.ok(h.stats.requests.filter(r=>r.url==='/api/theatre-clip').every(r=>r.count===1));
 assert.equal(h.stats.analyses,1);assert.ok(firstPlayAt<generationMs*3);
 const diagnostics=h.session.getTheatreDiagnostics();assert.equal(diagnostics.logicalItems,parsed.length);assert.equal(diagnostics.spokenItems,expected.length);
 assert.deepEqual(diagnostics.preparation.filter(e=>e.phase==='prepared').map(e=>e.index).sort((a,b)=>a-b),parsed.filter(i=>!i.pauseMs).map(i=>i.index));
 assert.ok(diagnostics.preparation.every(e=>Object.keys(e).every(k=>['index','component','phase','at'].includes(k))));
 assert.ok(trace.every(e=>Object.keys(e).every(k=>['index','phase','at'].includes(k))));
 off();h.session.dispose();return {buffering,peak:h.stats.peak,firstPlayAt};
}
for(const [label,generation,playback] of [['faster',500,1000],['similar',1000,1000],['slower',1600,1000],['very slow',3000,1000]])test(`60-item actual playback integrity: generation ${label} than playback`,async t=>{
 const result=await timedScene(generation,playback);t.diagnostic(JSON.stringify(result));assert.ok(result.peak<=2);
});
test('bounded two-worker/six-item policy reduces frontier stalls versus previous serial policy',async t=>{
 const before=await timedScene(1600,1000,{concurrency:1,lookahead:2}),after=await timedScene(1600,1000);
 t.diagnostic(JSON.stringify({before,after}));assert.ok(after.buffering<before.buffering/2);assert.equal(after.firstPlayAt,before.firstPlayAt);assert.equal(after.peak,2);
});

test('timed silence pauses/resumes, replays and rejects stale timers without a media/TTS request',async()=>{
 const h=harness(),time=clock();h.env.setTimer=(fn,ms)=>time.set(fn,ms);h.env.clearTimer=id=>time.clear(id);
 await h.session.start('[Silence.]\nJULIEN: Oh.','normal',h.doc);await until(()=>h.session.theatre.getSnapshot().status==='playing');
 assert.equal(h.env.audios.length,0);assert.equal(h.session.theatre.getSnapshot().currentIndex,0);
 const stale=[...time.jobs.values()].find(j=>j.at===900).fn;
 h.session.theatre.replay();stale();assert.equal(h.session.theatre.getSnapshot().currentIndex,0);
 h.session.theatre.pause();stale();assert.equal(h.session.theatre.getSnapshot().currentIndex,0);assert.equal(h.session.theatre.getSnapshot().status,'paused');
 h.session.theatre.resume();const resumed=[...time.jobs.values()].find(j=>j.at<=900);assert.ok(resumed);resumed.fn();await until(()=>h.session.theatre.getSnapshot().currentIndex===1&&h.session.theatre.getSnapshot().status==='playing');
 assert.deepEqual(h.stats.calls.map(c=>c.body.input),['Oh.']);assert.equal(h.session.theatre.getSnapshot().completions.length,1);
 h.session.stop();stale();assert.equal(h.session.theatre.getSnapshot().status,'idle');h.session.dispose();
});

test('short ambiguous narrator requests use French authority and the fixed narrator voice',async()=>{
 const h=harness(),text='[Attention.]\nJULIEN: Oh.\n[Une minute.]\n[Élise se fige.]';
 const manifest=await (await h.prepare(request({text,contentType:'theatre',performanceStyle:'naturel'}))).json();
 const loader=new (h.load('lib/theatre-incremental.ts').IncrementalTheatreLoader)(manifest,h.fetcher,()=>({}));
 for(let i=0;i<manifest.clips.length;i++)await loader.load(i);
 const calls=h.stats.calls.filter(c=>c.body.input.startsWith('['));assert.equal(calls.length,3);assert.equal(new Set(calls.map(c=>c.body.voice)).size,1);
 for(const {body} of calls){assert.match(body.instructions,/Document language: French \(fr\)/);assert.match(body.instructions,/Do not infer English from a fragment/);assert.match(body.instructions,/Narrate the stage direction/);assert.match(body.instructions,/do not switch pronunciation language/);}
 loader.dispose();h.session.dispose();
});

test('required retry/practice preparation takes priority over waiting lookahead; max two active',async()=>{
 const {deferred}=require('./playback-fixtures.cjs');const holds=[],seen=[];const h=harness(async b=>{seen.push(b.input);const hold=deferred();holds.push(hold);await hold.promise;return {arrayBuffer:async()=>Buffer.from(b.input)};});
 const manifest=await (await h.prepare(request({text:Array.from({length:8},(_,i)=>`JULIEN: ${i}.`).join('\n'),contentType:'theatre'}))).json();
 const Loader=h.load('lib/theatre-incremental.ts').IncrementalTheatreLoader,loader=new Loader(manifest,h.fetcher,()=>({'x-beta-session':'12345678-1234-1234-1234-123456789012'}));
 const tasks=Array.from({length:8},(_,i)=>loader.load(i));await until(()=>holds.length===2);assert.equal(loader.load(7,true),tasks[7]);holds[0].resolve();await until(()=>holds.length===3);assert.deepEqual(seen,['0.','1.','7.']);
 for(let i=1;i<8;i++){await until(()=>holds.length>i);holds[i].resolve();}
 await Promise.all(tasks);assert.equal(h.stats.peak,2);assert.equal(seen.length,8);loader.dispose();h.session.dispose();
});

test('two client requests admitted, third bounded; ordinary duplicate guard unchanged',()=>{
 const {RequestGate}=createLoader()('lib/beta-server.ts'),id='12345678-1234-1234-1234-123456789012';
 const gate=new RequestGate(Date.now,240,4,120,2),a=gate.acquire(id,'reading'),b=gate.acquire(id,'reading');assert.ok(a&&b);assert.equal(gate.acquire(id,'reading'),null);a();a();const c=gate.acquire(id,'reading');assert.ok(c);b();c();
 const ordinary=new RequestGate(),release=ordinary.acquire(id,'reading');assert.ok(release);assert.equal(ordinary.acquire(id,'reading'),null);release();
});

test('a pre-repair scene token cannot send semantic silence to TTS',async()=>{
 const h=harness(),{prepareTheatrePlan}=h.load('lib/theatre-generation.ts'),{sealScene}=h.load('lib/theatre-scene-ticket.ts');
 const plan=await prepareTheatrePlan('[Silence.]\nJULIEN: Oh.');delete plan.items[0].pauseMs;
 const sceneToken=sealScene(plan,1,'incremental-test-placeholder');const response=await h.clip(request({sceneToken,itemId:plan.items[0].id,componentIndex:0}));
 assert.equal(response.status,400);assert.equal(h.stats.calls.length,0);h.session.dispose();
});

for(const style of ['clarte','naturel'])test('exact acceptance sequence completes in authored order: '+style,async()=>{await timedScene(1600,1000,{source:acceptance,style});});
