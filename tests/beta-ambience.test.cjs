const test=require("node:test");
const assert=require("node:assert/strict");
const React=require("react");
const {renderToStaticMarkup}=require("react-dom/server");
const createLoader=require("./load-typescript.cjs");
const {environment,deferred,flush}=require("./playback-fixtures.cjs");
const {analysisFor}=require("./dramatic-fixtures.cjs");
const load=createLoader();
const {parseTheatreItems}=load("lib/theatre.ts");
const {generateTheatreResponse}=load("lib/theatre-generation.ts");
const {ReadingPlaybackSession}=load("lib/reading-playback.ts");
const {ambienceStatus,validateAmbience,localAmbienceProvider}=load("lib/theatre-ambience.ts");
const {betaJournal,resetBetaDiagnostics}=load("lib/beta-events.ts");
const source="(Dans un bureau.)\nNORA: Bonjour.\nLE CHŒUR: Ensemble !";
const items=parseTheatreItems(source);
const identity={documentId:"office-scene",revision:1,contentType:"theatre",origin:"imported"};
const recommendation=(environment="office")=>({environment,confidence:"high",basis:"explicit",evidence:environment==="none"?[]:[{itemId:items[0].id,quote:items[0].text}],rationale:"The stage direction establishes this setting.",contradictory:false});
const plan=()=>({...analysisFor(items),ambience:recommendation()});
const speech=async()=>"YQ==";

test("all semantic ambience statuses are distinct; uncertain evidence is never confident none",()=>{
  for(const [value,analyzed,expected] of [[recommendation("none"),true,"analyzed_no_ambience"],[recommendation(),true,"detected_available"],[recommendation("forest"),true,"detected_unavailable"],[null,false,"analysis_unavailable"],[{...recommendation("none"),confidence:"uncertain"},true,"analysis_unavailable"]]) {
    assert.equal(ambienceStatus(validateAmbience(value,items),analyzed),expected);
  }
});

test("successful same-document decision survives full Play, replay and speed changes; revision reanalyzes",async()=>{
  let analyses=0, requests=0;
  const env=environment(),s=new ReadingPlaybackSession(env,async(_url,request)=>{
    requests++; const body=JSON.parse(request.body);
    return Response.json(await generateTheatreResponse(body.text,body.speed==="slow"?0.85:1,speech,{analysisCacheKey:body.analysisCacheKey,ambienceDecision:body.ambienceDecision,skipAnalysis:body.skipAnalysis,analyze:async()=>{analyses++;return plan();}}));
  });
  await s.start(source,"normal",identity); assert.equal(analyses,1); assert.equal(s.getSnapshot().ambience.status,"detected_available");
  s.setAmbienceLevel("low"); const loop=env.audios.find(a=>a.loop); assert.equal(loop.volume,0.08);
  s.setAmbienceLevel("medium"); assert.equal(loop.volume,0.16); assert.equal(analyses,1);
  s.theatre.replay(); s.theatre.replay(); assert.equal(requests,1);
  s.stop(); await s.start(source,"slow",identity); assert.equal(requests,2); assert.equal(analyses,1);
  s.stop(); await s.start(source,"normal",{...identity,revision:2}); assert.equal(analyses,2);
  s.invalidateDocument(); await s.start(source,"normal",identity); assert.equal(analyses,3);
  s.dispose(); assert.equal(env.created.length,env.revoked.length);
});

test("failed analysis retries only on explicit Play after cooldown; interim plays do not extend it",async()=>{
  const before=Date.now; let now=1_000_000,analyses=0; Date.now=()=>now;
  const s=new ReadingPlaybackSession(environment(),async(_url,request)=>{
    const body=JSON.parse(request.body);
    return Response.json(await generateTheatreResponse(source,1,speech,{skipAnalysis:body.skipAnalysis,analyze:async()=>{analyses++;throw Error("unavailable");}}));
  });
  try {
    await s.start(source,"normal",identity); assert.equal(analyses,1); assert.equal(s.getSnapshot().ambience.status,"analysis_unavailable");
    now+=20_000; s.stop(); await s.start(source,"normal",identity); assert.equal(analyses,1);
    now+=10_001; s.stop(); await s.start(source,"normal",identity); assert.equal(analyses,2);
  } finally {s.dispose();Date.now=before;}
});

test("unknown cache reference causes fresh analysis without exposing summaries",async()=>{
  let analyses=0;
  const result=await generateTheatreResponse(source,1,speech,{analysisCacheKey:"missing",analyze:async()=>{analyses++;return plan();}});
  assert.equal(analyses,1); assert.equal(result.clips.length,items.length); assert.equal(result.direction.status,"analyzed");
  assert.equal(result.analysisPlan,undefined); assert.doesNotMatch(JSON.stringify(result),/Two friends disagree/);
});

test("server functional cache is bounded, source-bound, expiring and clearable",()=>{
  const {TheatreAnalysisCache}=load("lib/theatre-analysis-cache.ts"); let now=0;
  const cache=new TheatreAnalysisCache(()=>now,2), first=cache.put(source,plan());
  assert.deepEqual(cache.get(first,source),plan()); assert.equal(cache.get(first,"different source"),undefined);
  const copy=cache.get(first,source); copy.scene.mood="sad"; assert.equal(cache.get(first,source).scene.mood,"tense");
  cache.put(source,plan()); const last=cache.put(source,plan()); assert.equal(cache.get(first,source),undefined);
  now=30*60_000; assert.equal(cache.get(last,source),undefined);
  const cleared=cache.put(source,plan()); cache.clear(); assert.equal(cache.get(cleared,source),undefined);
});

test("different server worker preserves the client ambience decision even if fresh direction disagrees or fails",async()=>{
  const {theatreAnalysisCache}=load("lib/theatre-analysis-cache.ts");
  for(const prior of [recommendation(),recommendation("none")]) {
    const first=await generateTheatreResponse(source,1,speech,{analyze:async()=>({...plan(),ambience:prior})});
    theatreAnalysisCache.clear();
    for(const fail of [false,true]) {
      const next=await generateTheatreResponse(source,1,speech,{analysisCacheKey:first.analysisCacheKey,ambienceDecision:first.ambience,analyze:async(json)=>{
        assert.deepEqual(JSON.parse(json).ambienceDecision,prior);
        if(fail) throw Error("unavailable");
        return {...plan(),ambience:recommendation("forest")};
      }});
      assert.deepEqual(next.ambience,prior); assert.doesNotMatch(JSON.stringify(next),/Two friends disagree/);
    }
  }
});

test("unsupported detected environment remains available as a decision but silent as audio",async()=>{
  const data=await generateTheatreResponse(source,1,speech,{analyze:async()=>({...plan(),ambience:recommendation("forest")})});
  const env=environment(),s=new ReadingPlaybackSession(env,async()=>Response.json(data));
  s.setAmbienceLevel("medium"); await s.start(source,"normal",identity); await flush();
  assert.equal(s.getSnapshot().ambience.status,"detected_unavailable"); assert.equal(env.audios.filter(a=>a.loop).length,0);
  s.dispose();
});

test("ambience playback failure is reported independently and off/on can recover",async()=>{
  resetBetaDiagnostics(); const data=await generateTheatreResponse(source,1,speech,{analyze:async()=>plan()});
  const env=environment(),s=new ReadingPlaybackSession(env,async()=>Response.json(data));
  await s.start(source,"normal",identity); s.setAmbienceLevel("medium"); await flush();
  env.audios.find(a=>a.loop).fail(); assert.equal(s.getSnapshot().ambience.status,"playback_failed");
  assert.equal(s.theatre.getSnapshot().status,"playing");
  assert.equal(betaJournal.inspect().filter(e=>e.name==="ambience" && e.status==="playback_failed").length,1);
  s.setAmbienceLevel("off"); s.setAmbienceLevel("medium"); await flush(); assert.equal(s.getSnapshot().ambience.status,"detected_available");
  const loop=env.audios.findLast(a=>a.loop); const release=s.beginMicrophoneCapture(); assert.equal(loop.volume,0); assert.ok(loop.pauseCalls);
  release(); assert.equal(loop.volume,0.16); s.dispose(); assert.equal(env.created.length,env.revoked.length);
});

test("stale ambience response cannot attach or populate a replacement scene cache",async()=>{
  const p=deferred(), data=await generateTheatreResponse(source,1,speech,{analyze:async()=>plan()}); let calls=0;
  const env=environment(),s=new ReadingPlaybackSession(env,async()=>++calls===1?p.promise:new Response("ordinary audio"));
  s.setAmbienceLevel("medium"); const old=s.start(source,"normal",identity); s.invalidateDocument();
  await s.start("Texte ordinaire.","normal",{...identity,documentId:"replacement",contentType:"news"});
  p.resolve(Response.json(data)); await old; await flush(); assert.equal(s.getSnapshot().mode,"ordinary");
  assert.equal(env.audios.filter(a=>a.loop).length,0); assert.equal(s.analysisCache,null); s.dispose();
});

test("office waveform has meaningful nonzero energy, differs from neutral room and stays below clipping",async()=>{
  async function stats(kind) {
    const bytes=Buffer.from(await localAmbienceProvider(kind).arrayBuffer()); let squares=0,peak=0;
    for(let i=44;i<bytes.length;i+=2) { const v=bytes.readInt16LE(i); squares+=v*v;peak=Math.max(peak,Math.abs(v)); }
    return {bytes,rms:Math.sqrt(squares/((bytes.length-44)/2)),peak};
  }
  const office=await stats("office"),room=await stats("neutral_room");
  assert.notDeepEqual(office.bytes,room.bytes); assert.ok(office.rms>1000); assert.ok(office.rms>room.rms*5);
  assert.ok(office.peak<32767); assert.ok(office.rms*0.16>office.rms*0.08);
});

test("theatre progress counts a multi-voice chorus once, with lifecycle pause/resume/completion",async()=>{
  resetBetaDiagnostics(); const data=await generateTheatreResponse(source,1,speech,{analyze:async()=>plan()});
  const env=environment(),s=new ReadingPlaybackSession(env,async()=>Response.json(data)); await s.start(source,"normal",identity); await flush();
  s.theatre.pause(); s.theatre.resume(); await flush();
  for(let i=0;i<items.length;i++) {env.audios.filter(a=>!a.removed&&!a.loop).forEach(a=>a.end());await flush();}
  const snapshot=s.theatre.getSnapshot(); assert.equal(snapshot.status,"completed"); assert.equal(snapshot.completions.length,items.length);
  assert.ok(data.clips.at(-1).chorus.components.length>1);
  const Controls=load("components/article-reader/TheatreControls.tsx").default;
  const html=renderToStaticMarkup(React.createElement(Controls,{playback:snapshot,recordingBusy:false}));
  assert.match(html,new RegExp(`${items.length} / ${items.length} éléments terminés`));
  assert.deepEqual(betaJournal.inspect().filter(e=>e.name==="playback").map(e=>e.status),["started","paused","resumed","completed"]);
  s.dispose();
});
