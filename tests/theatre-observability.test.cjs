const test=require('node:test'),assert=require('node:assert/strict');
const createLoader=require('./load-typescript.cjs');
const {harness,request,until,tick}=require('./incremental-fixtures.cjs');
const {planFor,analysisFor}=require('./director-fixtures.cjs');
const {environment,deferred}=require('./playback-fixtures.cjs');

async function manifest(h,text,intent='respond') {
 const {prepareTheatrePlan}=h.load('lib/theatre-generation.ts');
 const plan=await prepareTheatrePlan(text,{performanceStyle:'naturel',directorEnabled:true,analyze:async json=>{
  const {items}=JSON.parse(json),director=planFor(items);director.lines.forEach(l=>l.intent=intent);return {...analysisFor(items),director};
 }});
 return h.load('lib/theatre-scene-ticket.ts').sceneManifest(plan,1,h.load('lib/theatre-scene-ticket.ts').sealScene(plan,1,'incremental-test-placeholder'));
}
for(const intent of ['question','respond','unknown'])test(`authored question guard survives Director intent ${intent} in actual TTS request and debug`,async()=>{
 const h=harness(),m=await manifest(h,'JULIEN : Elle a dit oui ?',intent);
 const res=await h.clip(request({sceneToken:m.sceneToken,itemId:m.clips[0].id,componentIndex:0,debug:true})),data=await res.json();
 assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');
 assert.deepEqual(data.debug.tts,h.stats.calls[0].body);assert.equal(data.debug.director.delivery.intent,intent);
 assert.equal(data.debug.requestOutcome.sdkInvoked,true);assert.equal(data.debug.requestOutcome.audioReceived,true);
 assert.equal(data.debug.tts.input,'Elle a dit oui ?');assert.match(data.debug.tts.instructions,/Authored linguistic form: interrogative/);assert.match(data.debug.tts.instructions,/do not mechanically exaggerate rising intonation/);
 assert.doesNotMatch(JSON.stringify(data.debug),/incremental-test-placeholder|sceneToken|apiKey|audioBase64/);
 assert.equal(h.stats.analyses,0,'accepted plan reused, no debug analysis');h.session.dispose();
});
for(const text of ['Thomas !','Thomas ?','Alice !','Paul ?','Rose.','Marc…','Oh !'])test(`short French guidance preserves exact authored input: ${text}`,async()=>{
 const h=harness(),m=await manifest(h,`JULIEN : ${text}`);
 const res=await h.clip(request({sceneToken:m.sceneToken,itemId:m.clips[0].id,componentIndex:0}));assert.equal(res.status,200);
 const data=await res.json(),b=h.stats.calls[0].body;assert.equal(data.debug,undefined);assert.equal(b.input,text);assert.equal(b.voice,m.clips[0].voice);
 assert.match(b.instructions,/Short French-context utterance/);assert.match(b.instructions,/French vowel values/);assert.match(b.instructions,/Do not infer English/);h.session.dispose();
});
test('linguistic guards are narrow, independent from acting style and never respell input',()=>{
 const load=createLoader(),{parseTheatreItems}=load('lib/theatre.ts'),{theatreLinguisticGuidance}=load('lib/theatre-linguistic.ts');
 for(const text of ['JULIEN: Cette longue phrase garde son texte exact.'])assert.equal(theatreLinguisticGuidance(parseTheatreItems(text)[0]),'');
 assert.match(theatreLinguisticGuidance(parseTheatreItems('JULIEN: « Elle a dit oui ? »')[0]),/interrogative/);
 const {dramaticInstructions}=load('lib/theatre-direction.ts'),item=parseTheatreItems('JULIEN: Thomas ?')[0];
 for(const style of ['clarte','naturel'])assert.match(dramaticInstructions(item,null,style),/Short French-context utterance/);
});
test('opt-in loader captures exact accepted context without extra requests; debug off captures nothing',async()=>{
 for(const enabled of [false,true]){
  const h=harness(),m=await manifest(h,'JULIEN: Thomas !'),Loader=h.load('lib/theatre-incremental.ts').IncrementalTheatreLoader;
  const loader=new Loader(m,h.fetcher,()=>({}),42,enabled);await loader.load(0);
  assert.equal(h.stats.calls.length,1);assert.equal(h.stats.requests.length,1);
  const detail=loader.getDelivery(0);assert.equal(!!detail,enabled);if(enabled)assert.deepEqual(detail.tts,h.stats.calls[0].body);
  assert.ok(loader.getDiagnostics().every(e=>e.session===42&&e.attempt===1));loader.dispose();h.session.dispose();
 }
});
test('failed provider request retains safe instruction payload, retry has a distinct attempt',async()=>{
 let failing=true;const h=harness(async b=>{if(failing)throw Error('private upstream secret');return {arrayBuffer:async()=>Buffer.from(b.input)};});
 const m=await manifest(h,'JULIEN: Thomas ?'),loader=new (h.load('lib/theatre-incremental.ts').IncrementalTheatreLoader)(m,h.fetcher,()=>({}),7,true);
 await assert.rejects(loader.load(0));assert.equal(loader.getDelivery(0).tts.input,'Thomas ?');assert.equal(loader.getDelivery(0).requestOutcome.audioReceived,false);assert.doesNotMatch(JSON.stringify(loader.getDelivery(0)),/private upstream/);
 failing=false;await loader.load(0);assert.deepEqual(loader.getDiagnostics().filter(e=>e.phase==='request').map(e=>e.attempt),[1,2]);loader.dispose();h.session.dispose();
});
test('play attempt/resolution is distinct from actual playing/progress; trace contains duration and advancement reason',async()=>{
 const h=harness();await h.session.start('JULIEN: Thomas ?\nÉLISE: Oui.','normal',h.doc);await until(()=>h.session.theatre.getSnapshot().status==='playing');await tick();
 const c=h.session.theatre,a=h.env.latest();assert.ok(c.getDiagnostics().some(e=>e.phase==='play'));assert.ok(c.getDiagnostics().some(e=>e.phase==='play_resolved'));assert.ok(!c.getDiagnostics().some(e=>e.phase==='media_started'));
 a.duration=1.25;a.onloadedmetadata(new Event('loadedmetadata'));a.onplaying(new Event('playing'));a.progress(.1);a.progress(.2);a.progress(1.15);
 assert.equal(c.getDiagnostics().find(e=>e.phase==='play').call,c.getDiagnostics().find(e=>e.phase==='media_started').call);
 assert.equal(c.getDiagnostics().filter(e=>e.phase==='media_started').length,1);assert.equal(c.getDiagnostics().filter(e=>e.phase==='progress').length,2);
 const ended=a.onended;a.end();ended(new Event('ended'));await tick();
 const events=c.getDiagnostics();assert.ok(events.some(e=>e.phase==='stale'&&e.reason==='ended_event'));assert.ok(events.some(e=>e.phase==='ended'&&e.duration===1.25));
 const done=events.find(e=>e.phase==='ended'),advance=events.find(e=>e.phase==='advance');assert.equal(done.attempt,advance.attempt);assert.equal(advance.reason,'audio');
 const trace=h.session.exportTheatreDiagnostics();assert.doesNotMatch(JSON.stringify(trace),/JULIEN|ÉLISE|Thomas|sceneToken|audioBase64/);assert.equal(trace.items[0].speaker,'speaker-1');
 h.session.stop();assert.equal(h.session.exportTheatreDiagnostics().cancelled,true);h.session.dispose();
});
test('cancelled and late preparation is diagnosed without attaching old audio',async()=>{
 const hold=deferred(),h=harness(),m=await manifest(h,'JULIEN: Thomas !');
 const loader=new (h.load('lib/theatre-incremental.ts').IncrementalTheatreLoader)(m,async()=>{await hold.promise;return Response.json({});},()=>({}),9);
 const pending=loader.load(0);await tick();loader.dispose();hold.resolve();await assert.rejects(pending);
 assert.ok(loader.getDiagnostics().some(e=>e.phase==='cancelled'));assert.ok(loader.getDiagnostics().some(e=>e.phase==='stale'));h.session.dispose();
});
test('diagnostic storage is bounded and excludes arbitrary top-level response fields',async()=>{
 const h=harness(),m=await manifest(h,'JULIEN: Thomas ?'),clip=m.clips[0];
 const loader=new (h.load('lib/theatre-incremental.ts').IncrementalTheatreLoader)(m,async()=>Response.json({mode:'theatre-component',itemId:clip.id,componentIndex:0,voice:clip.voice,speed:clip.speed,audioBase64:'YQ==',debug:{tts:{input:clip.text},secret:'PRIVATE',sceneToken:'PRIVATE'}}),()=>({}),1,true);
 for(let i=0;i<1100;i++)await loader.load(0);assert.ok(loader.getDiagnostics().length<=1024);assert.doesNotMatch(JSON.stringify(loader.getDelivery(0)),/PRIVATE/);
 // Oversized selected-item metadata is discarded rather than expanding capture.
 const huge=new (h.load('lib/theatre-incremental.ts').IncrementalTheatreLoader)(m,async()=>Response.json({mode:'theatre-component',itemId:clip.id,componentIndex:0,voice:clip.voice,speed:clip.speed,audioBase64:'YQ==',debug:{tts:{instructions:'x'.repeat(33000)}}}),()=>({}),1,true);
 await huge.load(0);assert.equal(huge.getDelivery(0),null);loader.dispose();huge.dispose();h.session.dispose();
});
test('debug UI is absent until explicitly enabled; scheduler constants remain six/two',()=>{
 const load=createLoader(),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const Panel=load('components/article-reader/TheatreDebugPanel.tsx').default;
 assert.equal(renderToStaticMarkup(React.createElement(Panel,{playback:{},sessionId:0})), '');
 const config=load('lib/theatre-incremental.ts');assert.equal(config.THEATRE_LOOKAHEAD,6);assert.equal(config.THEATRE_PREPARATION_CONCURRENCY,2);
});

test('enabled debug panel exports trace separately from selected-item content',()=>{
 const React=require('react'),values=[true,'','',0,0];let cursor=0;
 const load=createLoader({react:{...React,useEffect:()=>{},useState:()=>{const i=cursor++;return [values[i],v=>{values[i]=v;}];}}});
 const Panel=load('components/article-reader/TheatreDebugPanel.tsx').default;
 const playback={theatre:{getSnapshot:()=>({queue:[{id:'line-1',index:0,type:'dialogue'}]})},exportTheatreDiagnostics:()=>({items:[{id:'item-0',speaker:'speaker-1'}]}),getTheatreDelivery:()=>({tts:{input:'Thomas !'}})};
 function render(){cursor=0;return Panel({playback,sessionId:1});}
 function elements(node){if(!node||typeof node!=='object')return [];return [node,...React.Children.toArray(node.props?.children).flatMap(elements)];}
 function click(label){const button=elements(render()).find(e=>e.type==='button'&&e.props.children===label);assert.ok(button);button.props.onClick();}
 click('Afficher la trace');assert.doesNotMatch(values[1],/Thomas/);assert.match(values[1],/speaker-1/);
 click('Afficher la direction et la requête TTS (contient du texte)');assert.match(values[1],/Thomas !/);
 const tree=elements(render());assert.ok(tree.some(e=>e.type==='textarea'&&e.props.readOnly));assert.ok(tree.some(e=>e.type==='button'&&e.props.children==='Télécharger le JSON affiché'));
});
