const test=require("node:test"),assert=require("node:assert/strict");
const {pcm,webEnvironment,settle,setup,text,load,deferred}=require("./chorus-sync-fixtures.cjs");
const {audibleBounds,planChorusTiming,CHORUS_RATE_MIN,CHORUS_RATE_MAX}=load("lib/chorus-timing.ts");
const {SynchronizedChorus}=load("lib/synchronized-chorus.ts");
const {ReadingPlaybackSession}=load("lib/reading-playback.ts");
const {PronunciationSession}=load("lib/pronunciation-session.ts");
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test("PCM fixture demonstrates onset padding and duration drift independently of HTML startup",()=>{
  const bounds=[pcm(.05,2),pcm(.28,2.12),pcm(.48,1.9)].map(audibleBounds);
  near(bounds[2].onset-bounds[0].onset,.43);
  near(Math.max(...bounds.map(b=>b.end-b.onset))-Math.min(...bounds.map(b=>b.end-b.onset)),.22);
});
test("leading padding preserves 40ms guard, quiet initial signal, all channels and internal pauses",()=>{
  const b=pcm(.3,2,.1,2); b.getChannelData(1)[200]=0.00002; b.getChannelData(1).fill(0,700,900);
  assert.deepEqual(audibleBounds(b),{onset:.2,end:2.3});
  const t=planChorusTiming([b,b,b]);near(t[0].offset,.16);
  assert.equal(b.getChannelData(1)[200]>0,true);assert.equal(b.getChannelData(1)[750],0);
});
test("scheduled audible onsets align despite 430ms padding spread; rates remain within four percent",()=>{
  const buffers=[pcm(.05,2),pcm(.28,2.12),pcm(.48,1.9)];const timing=planChorusTiming(buffers);
  const starts=timing.map(t=>t.delay+(t.onset-t.offset)/t.rate);
  starts.forEach(s=>near(s,starts[0]));
  timing.forEach(t=>assert.ok(t.rate>=.96&&t.rate<=1.04));
  const ends=timing.map(t=>(t.end-t.onset)/t.rate);
  assert.ok(Math.max(...ends)-Math.min(...ends)<.06);
  assert.ok(Math.max(...timing.map(t=>t.delay))<.042);
});
test("zero-padding and extreme duration outliers never clip content or exceed rate bounds",()=>{
  const timings=planChorusTiming([pcm(0,1),pcm(.4,10),pcm(.8,30)]);
  assert.equal(timings[0].offset,0);assert.equal(timings[0].rate,CHORUS_RATE_MIN);
  assert.equal(timings[2].rate,CHORUS_RATE_MAX);assert.ok(timings.every(t=>t.offset<=t.onset));
  assert.throws(()=>planChorusTiming([pcm(0,0),pcm(),pcm()]));
  assert.throws(()=>planChorusTiming([pcm()]));
  const broken=pcm();broken.getChannelData(0)[2]=NaN;assert.throws(()=>audibleBounds(broken));
});
test("all three decodes AND context activation precede creating/scheduling any voice",async()=>{
  const env=webEnvironment();env.holdDecode=true;const activation=deferred();env.resumeResult=activation.promise;
  const {controller}=await setup(env);assert.equal(env.nodes.length,0);
  env.decodes[0].resolve(pcm());env.decodes[1].resolve(pcm());await settle();assert.equal(env.nodes.length,0);
  env.decodes[2].resolve(pcm());await settle();assert.equal(env.nodes.length,0);
  env.contexts[0].state="running";activation.resolve();await settle();assert.equal(env.nodes.length,3);
  env.nodes.forEach(n=>{near(n.starts[0][0],env.nodes[0].starts[0][0]);assert.ok(n.starts[0][0]>=10.05);});controller.dispose();
});
test("three distinct buffers start from a shared future anchor with measured onset compensation",async()=>{
  const {env,controller,data}=await setup();assert.equal(new Set(env.nodes.map(n=>n.buffer)).size,3);
  assert.equal(data.clips[0].chorus.components.length,3);assert.equal(env.audios.length,0);
  const audible=env.nodes.map(n=>n.starts[0][0]+(audibleBounds(n.buffer).onset-n.starts[0][1])/n.playbackRate.value);
  audible.forEach(t=>near(t,audible[0]));assert.ok(env.nodes.every(n=>n.starts[0][0]>=10.05));
  controller.dispose();assert.ok(env.contexts.every(c=>c.closed===1));assert.equal(env.created.length,0);
});
test("early, duplicate and stale component ends cannot double-advance the logical item",async()=>{
  const {env,controller}=await setup();const callbacks=env.nodes.map(n=>n.onended);
  env.nodes[0].end();env.nodes[1].end();assert.equal(controller.getSnapshot().currentIndex,0);
  env.nodes[2].end();assert.equal(controller.getSnapshot().currentIndex,1);
  callbacks.forEach(f=>f(new Event("ended")));assert.equal(controller.getSnapshot().completions.length,1);
  assert.equal(env.audios.length,1);env.latest().end();assert.equal(controller.getSnapshot().status,"completed");controller.dispose();
});
test("pause stops/mutes every node; resume recreates all unfinished nodes at retained raw offsets",async()=>{
  const {env,controller}=await setup();const first=env.nodes.slice();env.contexts[0].currentTime=10.8;
  const expected=first.map(n=>n.starts[0][1]+(10.8-n.starts[0][0])*n.playbackRate.value);
  controller.pause();assert.ok(first.every(n=>n.stops===1&&n.disconnects===1&&n.buffer===null));
  assert.ok(env.gains.every(g=>g.gain.value===0));env.contexts[0].currentTime=12;
  controller.resume();await settle();const next=env.nodes.slice(3);assert.equal(next.length,3);
  next.forEach((n,i)=>{near(n.starts[0][1],expected[i]);near(n.starts[0][0],12.05);});
  assert.equal(env.decodeCount,3);controller.dispose();
});
test("pause before scheduled onset retains relative remaining delays through resume",async()=>{
  const {env,controller}=await setup(webEnvironment([pcm(0,2),pcm(.1,2),pcm(.4,2)]));
  env.contexts[0].currentTime=10.06;controller.pause();env.contexts[0].currentTime=11;
  controller.resume();await settle();const next=env.nodes.slice(3);
  const audible=next.map(n=>n.starts[0][0]+(audibleBounds(n.buffer).onset-n.starts[0][1])/n.playbackRate.value);
  audible.forEach(t=>near(t,audible[0]));controller.dispose();
});
test("20 replays reuse decoded scene cache and exact generated bytes without generation",async()=>{
  const {env,controller,data,generation}=await setup();const original=JSON.stringify(data);const stale=[];
  for(let i=0;i<20;i++){stale.push(...env.nodes.slice(-3).map(n=>n.onended));controller.replay();await settle();
    assert.equal(env.decodeCount,3);assert.equal(controller.getSnapshot().currentIndex,0);
    const last=env.nodes.slice(-3);assert.equal(last.length,3);assert.ok(last.every(n=>n.starts.length===1));
  }
  stale.forEach(f=>f?.(new Event("ended")));assert.equal(controller.getSnapshot().completions.length,0);
  assert.equal(generation,4);assert.equal(JSON.stringify(data),original);
  env.nodes.slice(-3).forEach(n=>n.end());assert.equal(controller.getSnapshot().currentIndex,1);
  controller.dispose();assert.ok(env.contexts.every(c=>c.closed===1));assert.ok(env.nodes.every(n=>n.disconnects===1));
});
test("paused non-current practice restores chorus offsets and ended flags without starting",async()=>{
  const {env,controller}=await setup();env.nodes[0].end();env.contexts[0].currentTime=10.8;
  controller.pause();controller.enterPractice("line-4");controller.finishPractice();await settle();
  assert.equal(controller.getSnapshot().status,"paused");assert.equal(env.nodes.length,3);
  controller.resume();await settle();assert.equal(env.nodes.length,5);assert.equal(env.decodeCount,3);controller.dispose();
});
for(const stage of ["playing","paused","replaying","practising"]){test(`Stop while ${stage} closes every Web Audio resource and ignores callbacks`,async()=>{
  const {env,controller}=await setup();const stale=env.nodes.map(n=>n.onended);
  if(stage==="paused")controller.pause();if(stage==="replaying"){controller.replay();await settle();}
  if(stage==="practising")controller.enterPractice("line-4");
  controller.stop();stale.forEach(f=>f(new Event("ended")));assert.equal(controller.getSnapshot().status,"idle");
  assert.ok(env.contexts.every(c=>c.closed===1));assert.ok(env.nodes.every(n=>n.buffer===null));assert.equal(env.timers.size,0);
});}
test("stop/replacement during decode ignores late buffers and uses a fresh scene cache",async()=>{
  const env=webEnvironment();env.holdDecode=true;const {controller,data}=await setup(env);
  controller.stop();env.holdDecode=false;controller.acceptScene(controller.beginLoading(),data,text);await settle();
  env.decodes.slice(0,3).forEach(d=>d.resolve(pcm()));await settle();assert.equal(env.nodes.length,3);
  assert.equal(env.decodeCount,6);assert.equal(controller.getSnapshot().status,"playing");controller.dispose();
});
test("stop during pending resume cannot start stale nodes when activation resolves",async()=>{
  const env=webEnvironment(),d=deferred();env.resumeResult=d.promise;const {controller}=await setup(env);
  controller.stop();d.resolve();await settle();assert.equal(env.nodes.length,0);assert.equal(controller.getSnapshot().status,"idle");
});
for(const failure of ["decode","resume","start","create","silent","interruption","watchdog"]){test(`${failure} fails the whole group safely without advancement`,async()=>{
  const env=webEnvironment(failure==="silent"?[pcm(0,0),pcm(),pcm()]:undefined);
  if(failure==="decode"||failure==="watchdog")env.holdDecode=true;
  if(failure==="resume")env.resumeResult=Promise.reject(new Error("blocked"));
  if(failure==="start")env.failStart=2;if(failure==="create")env.failCreate=2;
  const {controller}=await setup(env);
  if(failure==="decode")env.decodes[1].reject(new Error("decode failed"));
  if(failure==="watchdog")env.runTimers(30000);
  if(failure==="interruption"){env.contexts[0].state="suspended";env.contexts[0].onstatechange();}
  await settle();assert.equal(controller.getSnapshot().status,"error");assert.equal(controller.getSnapshot().currentIndex,0);
  assert.equal(controller.getSnapshot().completions.length,0);assert.ok(env.contexts.every(c=>c.closed===1));
  assert.ok(env.nodes.every(n=>n.stops===1&&n.buffer===null));controller.dispose();
});}
test("microphone pipeline silences native chorus and ambience BEFORE permission; release does not resume speech",async()=>{
  const initial=await setup();const {data}=initial;initial.controller.dispose();const env=webEnvironment();data.ambience={environment:"office",confidence:"high",basis:"contextual",
    evidence:data.clips.map(c=>({itemId:c.id,quote:c.text})),rationale:"Fixture administrative setting.",contradictory:false};
  const session=new ReadingPlaybackSession(env,async()=>Response.json(data));await session.start(text,"normal");await settle();session.setAmbienceLevel("low");
  const permission=deferred();let checked=false;
  const pronunciation=new PronunciationSession({getUserMedia(){checked=true;
    assert.ok(env.nodes.every(n=>n.stops===1));assert.ok(env.gains.every(g=>g.gain.value===0));
    assert.equal(env.audios.find(a=>a.loop).volume,0);return permission.promise;
  }},session.beginMicrophoneCapture);
  const start=pronunciation.start({sessionId:1,itemId:"line-3",text:"Ensemble"});await settle();assert.equal(checked,true);
  permission.reject(new Error("denied"));await start;await settle();assert.equal(session.theatre.getSnapshot().status,"paused");
  assert.equal(env.audios.find(a=>a.loop).volume,.08);assert.equal(env.nodes.length,3);pronunciation.dispose();session.dispose();
});

test("reading-session twenty replays issue one request; unmount clears buffers, timers and contexts",async()=>{
  const initial=await setup();initial.controller.dispose();const env=webEnvironment();let requests=0;
  const session=new ReadingPlaybackSession(env,async()=>{requests++;return Response.json(initial.data);});
  await session.start(text,"normal");await settle();
  for(let i=0;i<20;i++){session.theatre.replay();await settle();}
  assert.equal(requests,1);assert.equal(env.decodeCount,3);const stale=env.nodes.slice(-3).map(n=>n.onended);
  session.dispose();stale.forEach(f=>f(new Event("ended")));
  assert.equal(session.theatre.getSnapshot().status,"idle");assert.equal(env.timers.size,0);
  assert.ok(env.contexts.every(c=>c.closed===1));assert.ok(env.nodes.every(n=>n.buffer===null));
});
test("ordinary characters and narrator still use only HTML Audio even with Web Audio capability",async()=>{
  const {env,controller}=await setup(webEnvironment(),"(Entrée.)\nNORA: Bonjour.\nSAMIR: Salut.");
  assert.equal(env.contexts.length,0);assert.equal(env.audios.length,1);env.latest().end();env.latest().end();env.latest().end();
  assert.equal(controller.getSnapshot().status,"completed");assert.equal(env.contexts.length,0);controller.dispose();
});
test("rapid play calls share one preparation; pause during decoding cannot start a late group",async()=>{
  const env=webEnvironment();env.holdDecode=true;const parts=[1,2,3].map(()=>({audioBase64:"YQ=="}));
  const group=new SynchronizedChorus(parts,env,new Map());const a=group.play(),b=group.play();
  await settle();group.pause();env.decodes.forEach(d=>d.resolve(pcm()));await Promise.all([a,b]);
  assert.equal(env.nodes.length,0);await group.play();assert.equal(env.nodes.length,3);assert.equal(env.decodeCount,3);group.removeAttribute("src");
});
test("failed decode cache can be retried, while stale decode rejection cannot affect a newer scene",async()=>{
  const env=webEnvironment();env.holdDecode=true;const {controller,data}=await setup(env);
  env.decodes[0].reject(new Error("bad audio"));await settle();assert.equal(controller.getSnapshot().status,"error");
  env.holdDecode=false;controller.replay();await settle();assert.equal(controller.getSnapshot().status,"replaying");assert.equal(env.decodeCount,6);
  controller.stop();controller.acceptScene(controller.beginLoading(),data,text);await settle();
  env.decodes[1].reject(new Error("obsolete"));env.decodes[2].resolve(pcm());await settle();
  assert.equal(controller.getSnapshot().status,"playing");controller.dispose();
});
test("progress refreshes watchdog throughout a long chorus without polling stopped nodes",async()=>{
  const {env,controller}=await setup(webEnvironment([pcm(40,60),pcm(.1,60),pcm(.2,60)]));
  const firstTimers=[...env.timers.keys()];env.contexts[0].currentTime+=1;env.runTimers(200);
  assert.ok(firstTimers.every(id=>!env.timers.has(id)));controller.pause();assert.equal(env.timers.size,0);controller.dispose();
});
test("final chorus paused at completion resumes to one final scene completion",async()=>{
  const {env,controller}=await setup(webEnvironment(),"CHŒUR: Ensemble.");
  const stale=env.nodes.map(n=>n.onended);env.contexts[0].currentTime=20;
  controller.pause();stale.forEach(f=>f(new Event("ended")));
  assert.equal(controller.getSnapshot().status,"paused");assert.equal(controller.getSnapshot().completions.length,0);
  controller.resume();await settle();
  assert.equal(controller.getSnapshot().status,"completed");assert.equal(controller.getSnapshot().completions.length,1);controller.dispose();
});

test("ensemble instructions preserve exact imported text, three voices and requested speed",async()=>{
  const {source}=require("./chorus-import-fixture.cjs");const {generateTheatreResponse}=load("lib/theatre-generation.ts");
  const {parseTheatreItems}=load("lib/theatre.ts");const expected=parseTheatreItems(source);const calls=[];
  const data=await generateTheatreResponse(source,1.15,async input=>{calls.push(input);return "YQ==";});
  for(const clip of data.clips.filter(c=>c.chorus)){
    const group=calls.filter(c=>c.text===clip.text);assert.equal(group.length,3);
    assert.deepEqual(group.map(c=>c.voice),["echo","fable","onyx"]);
    group.forEach(c=>{assert.equal(c.speed,1.15);assert.match(c.instructions,/steady, even articulation/);});
  }
  assert.deepEqual(data.clips.map(c=>[c.id,c.text,c.sourceLines]),expected.map(c=>[c.id,c.text,c.sourceLines]));
  assert.ok(calls.filter(c=>!c.instructions.includes("three-voice")).length>0);
});
test("partial gain construction failure disconnects its unstarted source and closes context",async()=>{
  const env=webEnvironment();const create=env.createChorusContext;
  env.createChorusContext=()=>{const context=create();context.createGain=()=>{throw new Error("gain unavailable");};return context;};
  const {controller}=await setup(env);assert.equal(controller.getSnapshot().status,"error");
  assert.equal(env.nodes[0].starts.length,0);assert.equal(env.nodes[0].disconnects,1);assert.equal(env.contexts[0].closed,1);controller.dispose();
});
