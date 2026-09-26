const test=require('node:test'),assert=require('node:assert/strict');
const createLoader=require('./load-typescript.cjs');
const {environment,deferred}=require('./playback-fixtures.cjs');
const {analysisFor,planFor}=require('./director-fixtures.cjs');
process.env.OPENAI_API_KEY='incremental-test-placeholder';
const scene=Array.from({length:50},(_,i)=>`${i===20||i===40?'LE CHŒUR':i%2?'CLARA':'MARC'}: Ligne ${i+1}. Ah, nous attendons le train avec nos amis dans cette grande gare et nous cherchons les billets pour partir ensemble avant la fin de la journée.`).join('\n');
const tick=()=>new Promise(r=>setImmediate(r));
async function until(fn){for(let i=0;i<1500;i++){if(fn())return;await tick();}assert.fail('state did not settle');}
function harness(speech){
 const stats={analyses:0,calls:[],requests:[],active:0,peak:0};
 class OpenAI{constructor(){this.responses={create:async b=>{stats.analyses++;const {items}=JSON.parse(b.input[1].content);return {status:'completed',output_text:JSON.stringify({...analysisFor(items),director:planFor(items)})};}};this.audio={speech:{create:async(b,o)=>{stats.calls.push({body:b,options:o});stats.active++;stats.peak=Math.max(stats.peak,stats.active);try{return speech?await speech(b,o,stats):{arrayBuffer:async()=>Buffer.from(b.input)};}finally{stats.active--;}}}};}}
 const load=createLoader({openai:OpenAI}),prepare=load('app/api/read-passage/route.ts').POST,clip=load('app/api/theatre-clip/route.ts').POST;
 const fetcher=async(url,options)=>{const before=stats.calls.length,entry={url,count:0};stats.requests.push(entry);const response=await (url.includes('theatre-clip')?clip:prepare)(new Request('http://localhost'+url,options));entry.count=stats.calls.length-before;entry.status=response.status;return response;};
 const env=environment(),session=new (load('lib/reading-playback.ts').ReadingPlaybackSession)(env,fetcher);
 const doc={documentId:'long-scene',revision:1,contentType:'theatre',language:'fr'};
 return {stats,load,prepare,clip,fetcher,env,session,doc};
}
const request=(body,signal)=>new Request('http://localhost/api/read-passage',{method:'POST',body:JSON.stringify(body),signal});
for(const style of ['clarte','naturel'])test(`50 logical items ${style}: prompt start, ordered exact-once playback, one TTS per request and one Director`,async()=>{
 const h=harness();await h.session.changeTheatreStyle(style,scene,'normal',h.doc);await h.session.start(scene,'normal',h.doc);
 await until(()=>h.session.theatre.getSnapshot().status==='playing');assert.ok(h.stats.calls.length<10,'starts before full synthesis');
 for(let i=0;i<50;i++){
  await until(()=>h.session.theatre.getSnapshot().status==='playing'&&h.session.theatre.getSnapshot().currentIndex===i);
  const clip=h.session.theatre.getSnapshot().queue[i];assert.ok(clip.audioBase64);assert.match(clip.text,new RegExp('Ligne '+(i+1)+'\\.'));
  if(clip.chorus){await tick();h.env.audios.filter(a=>!a.removed).forEach(a=>a.end());}else h.env.latest().end();
 }
 assert.equal(h.session.theatre.getSnapshot().status,'completed');assert.equal(h.session.theatre.getSnapshot().completions.length,50);
 assert.equal(h.stats.analyses,1);assert.equal(h.stats.calls.length,54);assert.equal(h.stats.peak,1);
 assert.deepEqual(h.stats.requests.filter(r=>r.url==='/api/read-passage').map(r=>r.count),[0]);assert.ok(h.stats.requests.filter(r=>r.url==='/api/theatre-clip').every(r=>r.count===1));
 assert.ok(h.stats.calls.every(c=>c.options.maxRetries===0&&c.options.timeout===55000&&c.options.signal));
 h.session.dispose();assert.equal(h.env.created.length,h.env.revoked.length);
});
test('chorus partial success survives a failed component; retry requests only missing voice',async()=>{
 let fail=true;const h=harness(async b=>{if(b.voice==='fable'&&fail){fail=false;throw Object.assign(new Error('private'),{status:429});}return {arrayBuffer:async()=>Buffer.from(b.input)};});
 await h.session.start('LE CHŒUR: Ensemble !\nCLARA: Ah.','normal',h.doc);await until(()=>h.session.theatre.getSnapshot().status==='error');assert.equal(h.stats.calls.length,2);assert.equal(h.session.theatre.getSnapshot().completions.length,0);
 h.session.theatre.replay();await until(()=>h.session.theatre.getSnapshot().status==='replaying');assert.equal(h.stats.calls.filter(c=>c.body.voice==='echo').length,1);assert.equal(h.stats.calls.filter(c=>c.body.voice==='fable').length,2);assert.equal(h.session.theatre.getSnapshot().queue[0].chorus.components.length,3);assert.equal(h.stats.analyses,1);h.session.dispose();
});
test('failed first clip recovers in both styles without discarding plan or restarting analysis',async()=>{
 for(const style of ['clarte','naturel']){let fail=true;const h=harness(async b=>{if(fail){fail=false;throw Error('private failure');}return {arrayBuffer:async()=>Buffer.from(b.input)};});await h.session.changeTheatreStyle(style,scene,'normal',h.doc);await h.session.start(scene,'normal',h.doc);await until(()=>h.session.theatre.getSnapshot().status==='error');assert.doesNotMatch(JSON.stringify(h.session.getSnapshot().error),/private/);h.session.theatre.replay();await until(()=>h.session.theatre.getSnapshot().status==='replaying');assert.equal(h.stats.analyses,1);h.session.dispose();}
});
test('document/style/speed replacement rejects ignored-abort stale audio',async()=>{
 const held=deferred();let first=true;const h=harness(async b=>{if(first){first=false;await held.promise;}return {arrayBuffer:async()=>Buffer.from(b.input)};});
 await h.session.start(scene,'normal',h.doc);await until(()=>h.stats.calls.length===1);h.session.invalidateDocument();
 const doc={...h.doc,documentId:'new',revision:2};await h.session.changeTheatreStyle('naturel','CLARA: Nouveau.','slow',doc);await h.session.start('CLARA: Nouveau.','slow',doc);await until(()=>h.session.theatre.getSnapshot().status==='playing');
 const id=h.session.theatre.getSnapshot().sessionId;held.resolve();await tick();assert.equal(h.session.theatre.getSnapshot().sessionId,id);assert.deepEqual(h.session.theatre.getSnapshot().queue.map(c=>c.text),['Nouveau.']);assert.equal(h.session.theatre.getSnapshot().queue[0].speed,.85);assert.equal(h.session.getSnapshot().performanceStyle,'naturel');h.session.dispose();
});
test('pause/capture during buffering never autoplays on late readiness; resume and replay use cache',async()=>{
 const held=deferred();const h=harness(async b=>{await held.promise;return {arrayBuffer:async()=>Buffer.from(b.input)};});await h.session.start('CLARA: Marc...','normal',h.doc);await until(()=>h.stats.calls.length===1);h.session.theatre.pause();held.resolve();await until(()=>h.env.audios.length===1);assert.equal(h.env.latest().playCalls,0);assert.equal(h.session.theatre.getSnapshot().status,'paused');h.session.theatre.resume();assert.equal(h.env.latest().playCalls,1);h.session.theatre.replay();assert.equal(h.stats.calls.length,1);h.session.dispose();
});
test('ticket crosses workers without reanalysis, authenticates content/configuration and expires',async()=>{
 const a=harness(),b=harness();const response=await a.prepare(request({text:scene,contentType:'theatre',performanceStyle:'naturel'})),manifest=await response.json();assert.equal(a.stats.calls.length,0);
 const reply=await b.clip(request({sceneToken:manifest.sceneToken,itemId:manifest.clips[0].id,componentIndex:0}));assert.equal(reply.status,200);assert.equal(b.stats.analyses,0);
 const invalid=await b.clip(request({sceneToken:manifest.sceneToken.slice(0,-10)+'AAAAAAAAAA',itemId:manifest.clips[0].id,componentIndex:0}));assert.equal(invalid.status,410);assert.equal(b.stats.calls.length,1);
 const {openScene}=a.load('lib/theatre-scene-ticket.ts');assert.throws(()=>openScene(manifest.sceneToken,'wrong-key'));assert.throws(()=>openScene(manifest.sceneToken,'incremental-test-placeholder',Date.now()+3*60*60_000));assert.doesNotMatch(manifest.sceneToken,/CLARA|Ligne|incremental-test-placeholder/);a.session.dispose();b.session.dispose();
});
test('server abort/deadline releases duplicate gate even when handler ignores cancellation',async()=>{
 const load=createLoader(),{RequestGate,protectedRoute}=load('lib/beta-server.ts'),gate=new RequestGate();const hung=()=>new Promise(()=>{});
 const post=protectedRoute('reading',hung,{gate,deadlineMs:10}),headers={'x-beta-session':'12345678-1234-1234-1234-123456789012'};
 const first=post(new Request('http://localhost/api',{method:'POST',headers,body:'{}'}));const duplicate=await post(new Request('http://localhost/api',{method:'POST',headers,body:'{}'}));assert.equal(duplicate.status,429);assert.equal((await first).status,408);assert.equal((await post(new Request('http://localhost/api',{method:'POST',headers,body:'{}'}))).status,408);
 const controller=new AbortController(),pending=post(new Request('http://localhost/api',{method:'POST',headers,body:'{}',signal:controller.signal}));controller.abort();assert.equal((await pending).status,408);assert.equal((await post(new Request('http://localhost/api',{method:'POST',headers,body:'{}'}))).status,408);
});
module.exports={harness,until,scene};

test('later prepared items never bypass a failed earlier line; retry retains all ready audio',async()=>{
 let failing=true;const h=harness(async b=>{if(b.input==='Deux.'&&failing)throw Error('failed');return {arrayBuffer:async()=>Buffer.from(b.input)};});
 await h.session.start('CLARA: Un.\nMARC: Deux.\nCLARA: Trois.','normal',h.doc);await until(()=>h.session.theatre.getSnapshot().queue[2]?.audioBase64);assert.equal(h.session.theatre.getSnapshot().currentIndex,0);h.env.latest().end();await until(()=>h.session.theatre.getSnapshot().status==='error');assert.equal(h.session.theatre.getSnapshot().currentIndex,1);assert.deepEqual(h.session.theatre.getSnapshot().completions.map(c=>c.itemId),['line-1']);
 failing=false;h.session.theatre.replay();await until(()=>h.session.theatre.getSnapshot().status==='replaying');h.env.latest().end();assert.equal(h.session.theatre.getSnapshot().currentIndex,2);assert.equal(h.stats.calls.filter(c=>c.body.input==='Trois.').length,1);h.env.latest().end();assert.equal(h.session.theatre.getSnapshot().status,'completed');h.session.dispose();
});
test('same-document style/speed switch cancels old components and reuses Director identity',async()=>{
 const held=deferred();let first=true;const h=harness(async b=>{if(first){first=false;await held.promise;}return {arrayBuffer:async()=>Buffer.from(b.input)};});
 const text='CLARA: Marc...\nMARC: Ah.';await h.session.start(text,'normal',h.doc);await until(()=>h.stats.calls.length===1);
 await h.session.changeTheatreStyle('naturel',text,'normal',h.doc);await until(()=>h.session.theatre.getSnapshot().status==='playing');const voice=h.session.theatre.getSnapshot().queue[0].voice;assert.equal(h.stats.analyses,1);assert.ok(h.stats.calls.at(-1).body.instructions.includes('Scene-aware Director'));
 h.session.stop();await h.session.start(text,'fast',h.doc);await until(()=>h.session.theatre.getSnapshot().status==='playing');held.resolve();await tick();assert.equal(h.stats.analyses,1);assert.equal(h.session.theatre.getSnapshot().queue[0].voice,voice);assert.equal(h.session.theatre.getSnapshot().queue[0].speed,1.15);h.session.dispose();
});
test('unprepared out-of-order practice keeps exact reference and returns to saved line',async()=>{
 const h=harness();await h.session.start(scene,'normal',h.doc);await until(()=>h.session.theatre.getSnapshot().status==='playing');h.env.latest().progress(1.2);
 const item=h.session.theatre.getSnapshot().queue[12];assert.equal(h.session.theatre.enterPractice(item.id),true);assert.equal(h.session.theatre.getSnapshot().practiceTarget.text,item.text);h.session.theatre.replay();await until(()=>h.env.latest()?.url&&h.session.theatre.getSnapshot().queue[12].audioBase64);await tick();
 assert.equal(await h.env.created.find(x=>x.url===h.env.latest().url).blob.text(),item.text);h.env.latest().end();assert.equal(h.session.theatre.getSnapshot().status,'practising');h.session.theatre.finishPractice();assert.equal(h.session.theatre.getSnapshot().currentIndex,0);assert.equal(h.env.latest().currentTime,1.2);h.session.dispose();
});
test('microphone during pending practice audio keeps the model silent after response',async()=>{
 const hold=deferred();const h=harness(async b=>{if(b.input.includes('Ligne 13.'))await hold.promise;return {arrayBuffer:async()=>Buffer.from(b.input)};});await h.session.start(scene,'normal',h.doc);await until(()=>h.session.theatre.getSnapshot().status==='playing');h.session.theatre.enterPractice('line-13');h.session.theatre.replay();await until(()=>h.stats.calls.some(c=>c.body.input.includes('Ligne 13.')));
 const release=h.session.beginMicrophoneCapture();hold.resolve();await until(()=>h.session.theatre.getSnapshot().queue[12].audioBase64);assert.equal(h.env.latest().playCalls,0);assert.equal(h.session.theatre.getSnapshot().modelPaused,true);release();assert.equal(h.env.latest().playCalls,0);h.session.theatre.resume();assert.equal(h.env.latest().playCalls,1);h.session.dispose();
});
test('aborted scene analysis cannot attach a manifest and gate admits the replacement',async()=>{
 const load=createLoader(),{protectedRoute}=load('lib/beta-server.ts');let calls=0;const hold=deferred();
 const post=protectedRoute('reading',async req=>{calls++;if(calls===1)await hold.promise;req.signal.throwIfAborted();return Response.json({ok:true});});
 const controller=new AbortController(),headers={'x-beta-session':'12345678-1234-1234-1234-123456789099'};
 const first=post(new Request('http://localhost/api',{method:'POST',body:'{}',headers,signal:controller.signal}));await until(()=>calls===1);controller.abort();assert.equal((await first).status,408);assert.equal((await post(new Request('http://localhost/api',{method:'POST',body:'{}',headers}))).status,200);hold.resolve();await tick();
});
test('mismatched component identity/voice cannot attach or skip a line',async()=>{
 const h=harness();const manifest=await (await h.prepare(request({text:'CLARA: Ah.',contentType:'theatre'}))).json();const {IncrementalTheatreLoader}=h.load('lib/theatre-incremental.ts');
 for(const change of [{itemId:'line-99'},{voice:'invented'},{speed:99},{componentIndex:1}]){
  const loader=new IncrementalTheatreLoader(manifest,async()=>Response.json({mode:'theatre-component',itemId:'line-1',componentIndex:0,voice:manifest.clips[0].voice,speed:1,audioBase64:'YQ==',...change}),()=>({}));await assert.rejects(loader.load(0));loader.dispose();}
 h.session.dispose();
});
test('Universal Practice shows the canonical selected unit above controls and uses it for both references',async()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),load=createLoader();
 const doc=load('lib/content-document.ts').generatedDocument({title:'Essai',text:'Ah… vraiment ? Oui, c’est déjà prêt !'},'news','B1','practice-ui');
 const units=load('lib/practice-units.ts').practiceUnits(doc),selected=units[1];assert.ok(selected);
 const Controls=load('components/article-reader/PracticeControls.tsx').default,markup=renderToStaticMarkup(React.createElement(Controls,{active:true,units,selected}));
 const escaped=renderToStaticMarkup(React.createElement('span',null,selected.text)).slice(6,-7);assert.ok(markup.includes(escaped));assert.ok(markup.indexOf(escaped)<markup.indexOf('Écouter / Réécouter'));assert.match(markup,/whitespace-pre-wrap break-words/);
 const heard=[],recorded=[];const p=new (load('lib/practice-session.ts').PracticeSession)({stop(){},getSnapshot:()=>({mode:null}),start:async text=>heard.push(text)},{reset(){},isBusy:()=>false,start:t=>recorded.push(t.text)});p.enter(doc);p.select(selected.id);await p.listen('normal');p.record();assert.deepEqual(heard,[selected.text]);assert.deepEqual(recorded,[selected.text]);
});
