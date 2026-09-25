const test=require("node:test"),assert=require("node:assert/strict");
const createLoader=require("./load-typescript.cjs");
const {environment,flush,deferred}=require("./playback-fixtures.cjs");
const {analysisFor}=require("./dramatic-fixtures.cjs");
const train=require("./last-train-fixture.cjs");
const load=createLoader();
const {importDocument}=load("lib/smart-import.ts");
const {parseTheatreItems}=load("lib/theatre.ts");
const {ReadingPlaybackSession}=load("lib/reading-playback.ts");
const interjections="[Une petite salle. Deux personnes attendent.]\nMARC : Euh... je ne sais pas.\nCLARA : Ah ! Enfin.\nMARC : Oh non...\nCLARA : Hein ?\nMARC : Hum... attends.\nCLARA : Ben, vas-y.";
function route(plan=analysisFor){
 const calls=[],analyses=[];
 class OpenAI{constructor(){this.responses={create:async body=>{analyses.push(body);const items=JSON.parse(body.input[1].content).items;return {status:"completed",output_text:JSON.stringify(plan(items))};}};this.audio={speech:{create:async body=>{calls.push(body);return {arrayBuffer:async()=>Buffer.from(body.input)};}}};}}
 return {calls,analyses,post:createLoader({openai:OpenAI})("app/api/read-passage/route.ts").POST};
}
async function withKey(fn){const before=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY="test-placeholder";try{await fn();}finally{if(before===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=before;}}
test("audit: Clara short and long lines retain the same identity at the actual provider boundary",()=>withKey(async()=>{
 const r=route();const response=await r.post(new Request("http://localhost/api",{method:"POST",body:JSON.stringify({text:train.text,contentType:"theatre",speed:"normal"})}));assert.equal(response.status,200);const data=await response.json();
 const clara=data.clips.filter(c=>c.speaker==="CLARA");assert.equal(clara.length,16);assert.ok(clara.some(c=>c.text==="Marc..."));
 assert.deepEqual([...new Set(clara.map(c=>c.voice))],["coral"]);assert.equal(data.casting.members.find(c=>c.speaker==="CLARA").presentation,"female-presenting");
 for(const c of clara){const sent=r.calls.find(x=>x.input===c.text);assert.equal(sent.voice,c.voice);assert.equal(sent.speed,1);}
}));
for(const style of ["clarte","naturel"]) for(const source of [interjections,"[Une salle.]\nMARC: Euh...\nCLARA: Ah !\nMARC: Oh...\nCLARA: Hein ?\nMARC: Hum...\nCLARA: Ben...\nMARC: EUH…\nCLARA: Pff !"])
 test(`audit ${style}: authored interjections survive import → real TTS request → played bytes → practice target`,()=>withKey(async()=>{
  const doc=importDocument(source,"interjections"),expected=source.split("\n").slice(1).map(l=>l.slice(l.indexOf(":")+1).trim());assert.equal(doc.contentType,"theatre");assert.equal(doc.originalText,source);
  const r=route(),env=environment(),session=new ReadingPlaybackSession(env,(_url,options)=>r.post(new Request("http://localhost/api",options)));
  await session.changeTheatreStyle(style,doc.text,"normal",doc);
  await session.start(doc.text,"normal",doc);await flush();const q=session.theatre.getSnapshot().queue;
  assert.deepEqual(q.slice(1).map(c=>c.text),expected);assert.equal(new Set(q.slice(1).map(c=>c.speaker)).size,2);
  for(let i=0;i<q.length;i++){
   const clip=q[i];assert.equal(session.theatre.getSnapshot().currentIndex,i);assert.equal(r.calls[i].input,clip.text);
   assert.equal(await env.created.find(e=>e.url===env.latest().url).blob.text(),clip.text);
   if(i){assert.equal(clip.type,"dialogue");assert.equal(clip.chorus,undefined);assert.equal(session.theatre.enterPractice(clip.id),true);assert.equal(session.theatre.getSnapshot().practiceTarget.text,expected[i-1]);session.theatre.replay();await flush();assert.equal(await env.created.find(e=>e.url===env.latest().url).blob.text(),expected[i-1]);session.theatre.finishPractice();}
   else env.latest().end();await flush();
  }
  assert.equal(session.theatre.getSnapshot().status,"completed");assert.equal(r.calls.length,q.length);session.dispose();
 }));


const {generateTheatreResponse}=load("lib/theatre-generation.ts");
const {theatreStyle}=load("lib/theatre-performance.ts");
test("style validation: default Clarté; invalid values rejected",()=>{assert.equal(theatreStyle(undefined),"clarte");for(const v of [null,"fast","NATUREL",{},1])assert.throws(()=>theatreStyle(v));});
for(const style of ["clarte","naturel"]) for(const [speed,value] of Object.entries({"very-slow":0.7,slow:0.85,normal:1,fast:1.15}))
 test(`train provider matrix: ${style} × ${speed}; fixed voice, exact words, evolving context`,()=>withKey(async()=>{
  const r=route();const response=await r.post(new Request("http://localhost/api",{method:"POST",body:JSON.stringify({text:train.text,contentType:"theatre",speed,performanceStyle:style})}));assert.equal(response.status,200);const data=await response.json();assert.equal(data.performanceStyle,style);
  const expected=parseTheatreItems(train.text);assert.deepEqual(data.clips.map(c=>c.text),expected.map(i=>i.text));assert.equal(data.clips.length,47);
  for(const c of data.clips){const requests=r.calls.filter(x=>x.input===c.text);assert.ok(requests.length);assert.ok(requests.every(x=>x.speed===(c.type==="stage"?Math.max(0.65,value-0.15):value)));assert.equal(c.speed,requests[0].speed);assert.ok(requests.every(x=>x.instructions.includes(style==="clarte"?"Clarté:":"Naturel:")));assert.ok(requests.every(x=>x.instructions.includes("Preserve every authored interjection")));}
  const clara=data.clips.filter(c=>c.speaker==="CLARA");assert.deepEqual([...new Set(clara.map(c=>c.voice))],["coral"]);assert.equal(data.casting.narrator.voice,"cedar");assert.ok(data.clips.filter(c=>c.type==="stage").every(c=>c.voice==="cedar"));assert.ok(data.clips.filter(c=>c.chorus).every(c=>c.chorus.components.length===3));
  const short=r.calls.find(c=>c.input==="Marc...");assert.equal(short.voice,"coral");assert.match(short.instructions,/Fixed voice identity/);assert.match(short.instructions,/Untrusted surrounding script data/);assert.match(short.instructions,/Au bout du quai/);assert.match(short.instructions,/Advisory scene context/);assert.match(short.instructions,/Tension gives way to warmth/);
  assert.notEqual(short.instructions,r.calls.find(c=>c.input===clara[0].text).instructions);
  for(const c of r.calls.filter(c=>data.clips.find(i=>i.text===c.input)?.chorus))assert.match(c.instructions,/steady, even articulation/);
 }));
test("invalid Theatre style fails before model/TTS calls; non-Theatre styles do not affect ordinary audio",()=>withKey(async()=>{
 const r=route();const body={text:interjections,contentType:"theatre",performanceStyle:"invented"};const response=await r.post(new Request("http://localhost/api",{method:"POST",body:JSON.stringify(body)}));assert.equal(response.status,400);assert.equal(r.calls.length,0);assert.equal(r.analyses.length,0);
 const ordinary=await r.post(new Request("http://localhost/api",{method:"POST",body:JSON.stringify({text:"Bonjour à tous.",contentType:"news",performanceStyle:"naturel",speed:"slow"})}));assert.equal(ordinary.status,200);assert.equal(r.calls[0].instructions,load("lib/document-language.ts").pronunciationInstructions("fr"));assert.equal(r.calls[0].speed,0.85);
}));
test("style switch cancels stale preparation and never accepts mismatched cached audio",async()=>{
 const pending=[],bodies=[],env=environment();const s=new ReadingPlaybackSession(env,(_url,options)=>{const d=deferred();pending.push(d);bodies.push(JSON.parse(options.body));return d.promise;});const doc=importDocument(interjections,"switch");
 assert.equal(s.getSnapshot().performanceStyle,"clarte");const old=s.start(doc.text,"slow",doc);assert.ok(s.getSnapshot().preparation);
 const newer=s.changeTheatreStyle("naturel",doc.text,"slow",doc);assert.ok(s.getSnapshot().preparation);assert.deepEqual(bodies.map(b=>[b.performanceStyle,b.speed,b.documentId,b.revision]),[["clarte","slow",doc.documentId,1],["naturel","slow",doc.documentId,1]]);
 const natural=await generateTheatreResponse(doc.text,0.85,async()=>"YQ==",{performanceStyle:"naturel"});pending[1].resolve(Response.json(natural));await newer;const id=s.theatre.getSnapshot().sessionId;assert.equal(s.getSnapshot().mode,"theatre");
 pending[0].resolve(Response.json(await generateTheatreResponse(doc.text,0.85,async()=>"YQ==")));await old;await flush();assert.equal(s.theatre.getSnapshot().sessionId,id);assert.equal(s.getSnapshot().performanceStyle,"naturel");
 const third=s.changeTheatreStyle("clarte",doc.text,"slow",doc);pending[2].resolve(Response.json(natural));await third;assert.ok(s.getSnapshot().error);assert.equal(s.theatre.getSnapshot().queue.length,0);s.dispose();
});
test("style switches regenerate speech, reuse station analysis, preserve casting and invalidate practice/audio",()=>withKey(async()=>{
 const r=route(items=>({...analysisFor(items),ambience:{environment:"station",confidence:"high",basis:"explicit",evidence:[{itemId:items[0].id,quote:items[0].text}],rationale:"Railway setting",contradictory:false}}));const env=environment();const s=new ReadingPlaybackSession(env,(_url,options)=>r.post(new Request("http://localhost/api",options)));const doc=importDocument(train.text,"station-switch");
 await s.start(doc.text,"normal",doc);const original=s.theatre.getSnapshot().queue;const cast=original.map(c=>[c.speaker,c.voice,c.chorus?.components.map(x=>x.voice)]);const count=r.calls.length;assert.equal(s.getSnapshot().ambience.status,"detected_available");
 s.setAmbienceLevel("low");s.theatre.enterPractice(original[1].id);s.theatre.replay();await flush();assert.equal(r.calls.length,count);
 await s.changeTheatreStyle("naturel",doc.text,"normal",doc);assert.equal(r.calls.length,count*2);assert.equal(r.analyses.length,1);assert.equal(s.theatre.getSnapshot().practiceTarget,null);assert.equal(s.theatre.getSnapshot().currentIndex,0);assert.deepEqual(s.theatre.getSnapshot().queue.map(c=>[c.speaker,c.voice,c.chorus?.components.map(x=>x.voice)]),cast);
 assert.equal(s.getSnapshot().ambience.status,"detected_available");assert.equal(env.audios.findLast(a=>a.loop&&!a.removed).volume,0.08);s.setAmbienceLevel("medium");assert.equal(env.audios.findLast(a=>a.loop&&!a.removed).volume,0.16);
 const release=s.beginMicrophoneCapture();assert.equal(env.audios.findLast(a=>a.loop&&!a.removed).volume,0);await s.changeTheatreStyle("clarte",doc.text,"normal",doc);assert.equal(s.getSnapshot().performanceStyle,"naturel");release();
 s.stop();await s.start(doc.text,"fast",doc);assert.equal(s.getSnapshot().performanceStyle,"naturel");assert.equal(s.theatre.getSnapshot().queue[1].speed,1.15);assert.equal(r.analyses.length,1);s.dispose();assert.equal(env.created.length,env.revoked.length);
}));
test("style UI is compact, Theatre-scoped and independent of speed",()=>{
 const React=require("react"),{renderToStaticMarkup}=require("react-dom/server");const Setup=load("components/article-reader/ReadingSetupBar.tsx").default;
 const props={contentType:"news",level:"B1",readingSpeed:"normal",isPlayingAudio:false,isGenerating:false};const plain=renderToStaticMarkup(React.createElement(Setup,props));assert.doesNotMatch(plain,/id="theatreStyle"/);
 const markup=renderToStaticMarkup(React.createElement(Setup,{...props,theatreStyle:"clarte"}));assert.match(markup,/id="theatreStyle"/);assert.match(markup,/Clarté/);assert.match(markup,/Naturel/);assert.match(markup,/id="readingSpeed"/);assert.match(markup,/relance la scène au début/);
 const page=require("node:fs").readFileSync("app/page.tsx","utf8");assert.match(page,/theatreStyle=\{article.contentType === "theatre"/);
});

for(const style of ["clarte","naturel"]) test(`${style}: interjection practice sends exact authored reference to pronunciation analysis`,async()=>{
 const {PronunciationSession}=load("lib/pronunciation-session.ts");const {TheatrePlaybackController}=load("lib/theatre-playback.ts");const env=environment(),controller=new TheatrePlaybackController(env);const data=await generateTheatreResponse(interjections,1,async()=>"YQ==",{performanceStyle:style});controller.acceptScene(controller.beginLoading(),data,interjections);
 const sent=[];const p=new PronunciationSession({getUserMedia:async()=>({getTracks:()=>[{stop(){}}]}),createRecorder:()=>({state:"inactive",start(){this.state="recording";},stop(){this.state="inactive";this.ondataavailable({data:new Blob(["recording"])});this.onstop();}}),fetch:async(url,options)=>{sent.push({url,text:options.body.get("text"),speaker:options.body.get("speaker")});return Response.json({});}});
 for(const item of data.clips.slice(1)){assert.equal(controller.enterPractice(item.id),true);const target=controller.getSnapshot().practiceTarget;await p.start({...target,documentId:"practice",revision:1,contentType:"theatre"});p.stop();await p.analyze();assert.equal(p.getSnapshot().status,"analyzed");assert.deepEqual(sent.at(-1),{url:"/api/analyze-pronunciation",text:item.text,speaker:item.speaker});controller.finishPractice();}
 p.dispose();controller.dispose();
});
for(const style of ["clarte","naturel"]) test(`${style}: synchronized chorus, replay, pause/resume and capture keep one logical item`,async()=>{
 const {webEnvironment,settle}=require("./chorus-sync-fixtures.cjs");const {TheatrePlaybackController}=load("lib/theatre-playback.ts");const text="LE CHŒUR: Ensemble !\nCLARA: Ah !";const data=await generateTheatreResponse(text,0.85,async()=>"YQ==",{performanceStyle:style});const env=webEnvironment(),c=new TheatrePlaybackController(env);c.acceptScene(c.beginLoading(),data,text);await settle();
 assert.equal(c.getSnapshot().queue.length,2);assert.equal(env.nodes.length,3);const {audibleBounds}=load("lib/chorus-timing.ts");const onsets=env.nodes.map(n=>n.starts[0][0]+(audibleBounds(n.buffer).onset-n.starts[0][1])/n.playbackRate.value);assert.ok(onsets.every(t=>Math.abs(t-onsets[0])<1e-6));c.pause();c.resume();await settle();c.replay();await settle();c.setCaptureBlocked(true);assert.ok(env.nodes.every(n=>n.stops));c.setCaptureBlocked(false);c.resume();await settle();
 const nodes=env.nodes.slice(-3);nodes[0].end();assert.equal(c.getSnapshot().currentIndex,0);nodes.slice(1).forEach(n=>n.end());await settle();assert.equal(c.getSnapshot().currentIndex,1);env.latest().end();assert.equal(c.getSnapshot().status,"completed");assert.equal(c.getSnapshot().completions.length,2);c.dispose();
});
