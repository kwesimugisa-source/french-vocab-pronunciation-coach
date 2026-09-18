const test=require("node:test"),assert=require("node:assert/strict");
const load=require("./load-typescript.cjs")();
const {environment,deferred,flush}=require("./playback-fixtures.cjs");
const {SEMANTIC_AUDIO_REGISTRY,SemanticAudioRegistry,SFX_IDS,isSemanticAudioId,semanticAudioEntry,resolveSemanticAudio,environmentId}=load("lib/semantic-audio.ts");
const {AmbiencePlayback}=load("lib/ambience-playback.ts");
const {parseTheatreItems}=load("lib/theatre.ts");
test("canonical IDs, categories, gain/loop metadata and availability are centralized",()=>{
  assert.equal(environmentId("station"),"environment.train_station");assert.equal(environmentId("street"),"environment.street_city");
  assert.equal(environmentId("none"),null);assert.equal(environmentId("../../file"),null);
  assert.equal(new Set(SEMANTIC_AUDIO_REGISTRY.map(e=>e.id)).size,SEMANTIC_AUDIO_REGISTRY.length);
  for(const entry of SEMANTIC_AUDIO_REGISTRY){assert.ok(isSemanticAudioId(entry.id));assert.equal(semanticAudioEntry(entry.id),entry);assert.equal(entry.loop,entry.category==="ambience");assert.ok(entry.defaultGain>0&&entry.defaultGain<=1);}
  for(const id of SFX_IDS){assert.equal(semanticAudioEntry(id).category,"sfx");assert.equal(resolveSemanticAudio(id),null);}
  assert.equal(semanticAudioEntry("environment.train_station").provider.kind,"procedural");
});
for(const bad of ["environment.unknown","sfx.unknown","../sound.mp3","C:\\sound.wav","https://example.com/sound.mp3","data:audio/wav;base64,AA==","__proto__",{id:"sfx.phone_ring",path:"../secret"}])
 test(`untrusted semantic selection cannot resolve an asset: ${JSON.stringify(bad)}`,()=>{assert.equal(isSemanticAudioId(bad),false);assert.equal(resolveSemanticAudio(bad),null);});
test("test-only SFX provider and approved async resolver extend registry without changing narration",async()=>{
  const text="[Son téléphone sonne.]\nMARC: Oui.",before=parseTheatreItems(text),blob=new Blob(["test-only"]);
  for(const kind of ["procedural","bundled","approved-remote"]){
    const base=semanticAudioEntry("sfx.phone_ring"),custom=new SemanticAudioRegistry([{...base,provider:{kind,resolve:()=>kind==="procedural"?blob:Promise.resolve(blob)}}]);
    assert.equal(await custom.resolve("sfx.phone_ring"),blob);assert.equal(custom.lookup("sfx.phone_ring").loop,false);
    assert.equal(custom.resolve("https://example.com/arbitrary"),null);assert.deepEqual(parseTheatreItems(text),before);
  }
  assert.equal(before[0].speaker,"NARRATOR");assert.equal(resolveSemanticAudio("sfx.phone_ring"),null,"no production SFX implementation installed");
});
test("invalid registry entries fail before resolution",()=>{
  const base=semanticAudioEntry("sfx.phone_ring");
  for(const bad of [{...base,id:"../sound"},{...base,loop:true},{...base,category:"ambience"},{...base,defaultGain:NaN}])assert.throws(()=>new SemanticAudioRegistry([bad]));
  assert.throws(()=>new SemanticAudioRegistry([base,base]));
});
test("station PCM has distinct meaningful energy, deterministic output and no clipping",async()=>{
  const station=Buffer.from(await (await resolveSemanticAudio("environment.train_station")).arrayBuffer());
  const office=Buffer.from(await (await resolveSemanticAudio("environment.office")).arrayBuffer());
  assert.notDeepEqual(station,office);assert.equal(station.toString("ascii",0,4),"RIFF");
  assert.deepEqual(station,Buffer.from(await (await resolveSemanticAudio("environment.train_station")).arrayBuffer()));
  let sum=0,peak=0;for(let i=44;i<station.length;i+=2){const v=station.readInt16LE(i);sum+=v*v;peak=Math.max(peak,Math.abs(v));}
  assert.ok(Math.sqrt(sum/((station.length-44)/2))>1000);assert.ok(peak<32767);
});
test("station Off/Low/Medium control only gain and capture silences it",async()=>{
  const env=environment();let resolutions=0;
  const loop=new AmbiencePlayback(env,()=>{resolutions++;return resolveSemanticAudio("environment.train_station");});
  loop.configure("station");loop.setActive(true);assert.equal(env.audios.length,0);
  loop.setLevel("low");const audio=env.latest();assert.equal(audio.volume,0.08);assert.equal(audio.loop,true);
  loop.setLevel("medium");assert.equal(audio.volume,0.16);assert.equal(resolutions,1);
  loop.setMuted(true);assert.equal(audio.volume,0);assert.ok(audio.pauseCalls);loop.setMuted(false);assert.equal(audio.volume,0.16);
  loop.setLevel("off");assert.ok(audio.removed);loop.stop();assert.equal(env.created.length,env.revoked.length);
});
test("async provider resolution respects replacement, Off, mute and rejected fetches",async()=>{
  const env=environment(),pending=deferred();let failed=0;
  const loop=new AmbiencePlayback(env,()=>pending.promise,()=>failed++);
  loop.configure("station");loop.setLevel("medium");loop.setActive(true);loop.setLevel("low");assert.equal(env.audios.length,0);
  loop.stop();pending.resolve(new Blob(["old"]));await flush();assert.equal(env.audios.length,0);
  const current=deferred(),other=new AmbiencePlayback(env,()=>current.promise,()=>failed++);
  other.configure("station");other.setLevel("medium");other.setActive(true);other.setMuted(true);
  current.resolve(new Blob(["new"]));await flush();assert.equal(env.latest().playCalls,0);
  other.setMuted(false);await flush();assert.equal(env.latest().playCalls,1);other.stop();
  const bad=new AmbiencePlayback(env,()=>Promise.reject(Error("unavailable")),()=>failed++);
  bad.configure("station");bad.setLevel("medium");bad.setActive(true);await flush();assert.equal(failed,1);bad.stop();
  assert.equal(env.created.length,env.revoked.length);
});
