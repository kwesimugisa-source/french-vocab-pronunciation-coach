const test=require("node:test"), assert=require("node:assert/strict");
const createLoader=require("./load-typescript.cjs");
const {environment,deferred,flush}=require("./playback-fixtures.cjs");
const {webEnvironment,settle}=require("./chorus-sync-fixtures.cjs");
const {analysisFor}=require("./dramatic-fixtures.cjs");
const fixture=require("./last-train-fixture.cjs"), pages=require("./pagination-theatre-fixture.cjs");
const load=createLoader();
const {parseTheatreItems}=load("lib/theatre.ts");
const {importDocument}=load("lib/smart-import.ts");
const {createTheatreCasting}=load("lib/theatre-casting.ts");
const {generateTheatreResponse}=load("lib/theatre-generation.ts");
const {PRESENTATION_VOICES}=load("lib/voice-casting.ts");
const {ReadingPlaybackSession}=load("lib/reading-playback.ts");
const {validateTheatreCharacters}=load("lib/theatre-characters.ts");
const {nameConvention,normalizeConventionName,NAME_CONVENTIONS}=load("lib/name-conventions.ts");
const metadata=[{speakerId:"CLARA",displayName:"CLARA",voicePresentation:"female-presenting"},{speakerId:"MARC",displayName:"MARC",voicePresentation:"male-presenting"}];
const station=items=>({environment:"station",confidence:"high",basis:"explicit",evidence:[{itemId:items[0].id,quote:items[0].text}],rationale:"The scene is set in a railway station.",contradictory:false});
const character=(text,name,characters=[])=>createTheatreCasting(parseTheatreItems(text),undefined,characters).members.find(m=>m.speaker===name&&m.role==="character");

for(const [name,presentation] of [["Clara","female-presenting"],["Marc","male-presenting"],["Claudine","female-presenting"],["Claude","male-presenting"],["Élodie","female-presenting"],["Étienne","male-presenting"]])
 test(`French Theatre convention ${name} chooses an app presentation pool`,()=>{
   const member=character(`${name}: Bonjour.`,name.toUpperCase());
   assert.equal(member.presentation,presentation); assert.equal(member.castingSource,"name-convention-fr"); assert.ok(PRESENTATION_VOICES[presentation].includes(member.voice));
 });

test("name data is normalized, extensible, unique and does not rewrite display text",()=>{
  assert.ok(NAME_CONVENTIONS.length>80); assert.equal(new Set(NAME_CONVENTIONS.map(n=>n.normalizedName)).size,NAME_CONVENTIONS.length);
  for(const name of ["  ÉLODIE  ","Élodie:","(élodie)","E\u0301lodie"]) assert.equal(nameConvention(name).presentation,"female-presenting");
  assert.equal(normalizeConventionName(" Jean-Pierre "),"jean-pierre");
  const text="éLoDie : Bonjour."; assert.equal(parseTheatreItems(text)[0].text,"Bonjour."); assert.equal(text,"éLoDie : Bonjour.");
});

test("explicit script overrides metadata and conventional names, including bracket descriptions",()=>{
  for(const description of ["(Clara, un homme, entre.)","[Clara, un homme, entre.]"]){
    const member=character(`${description}\nCLARA: Bonjour.\nMARC: Salut.`,"CLARA",metadata);
    assert.equal(member.presentation,"male-presenting"); assert.equal(member.castingSource,"explicit-script");
  }
  assert.equal(character("[Andrea, un homme, attend.]\nANDREA: Oui.","ANDREA").presentation,"male-presenting");
  assert.equal(character("[Clara, un homme, entre.]\n[Clara, une femme, attend.]\nCLARA: Oui.","CLARA").presentation,"unspecified");
});

test("generated metadata precedes convention without altering spoken text",async()=>{
  const text="CLARA: Oui.\nMARC: Non.", changed=metadata.map(m=>({...m,voicePresentation:m.speakerId==="CLARA"?"male-presenting":"female-presenting"}));
  const data=await generateTheatreResponse(text,1,async()=>"YQ==",{theatreCharacters:changed});
  assert.deepEqual(data.clips.map(c=>c.text),["Oui.","Non."]);
  assert.equal(data.casting.members[0].presentation,"male-presenting"); assert.equal(data.casting.members[0].castingSource,"generated-metadata");
});

test("explicit negative casting evidence blocks a conflicting convention without inventing binary identity",()=>{
  const member=character("[Clara n'est pas une femme.]\nCLARA: Oui.","CLARA");
  assert.equal(member.presentation,"unspecified");assert.equal(member.castingSource,"explicit-script-constraint");
  assert.ok(!PRESENTATION_VOICES["female-presenting"].includes(member.voice));
});

test("ambiguous context can help; unfamiliar names remain unspecified with varied voices",()=>{
  const alex=character("[Alex sourit. Elle attend.]\nALEX: Bonjour.","ALEX");
  assert.equal(alex.presentation,"female-presenting"); assert.equal(alex.castingSource,"named-subject-context");
  assert.equal(character("[Alex regarde Marie. Elle attend.]\nALEX: Bonjour.","ALEX").presentation,"unspecified");
  const text="ZYRA: Oui.\nQUOR: Non.\nXEL: Encore.\nVOR: Enfin.";
  const cast=createTheatreCasting(parseTheatreItems(text)), members=cast.members;
  assert.ok(members.every(m=>m.presentation==="unspecified")); assert.equal(new Set(members.map(m=>m.voice)).size,4);
  assert.ok(members.some(m=>PRESENTATION_VOICES["female-presenting"].includes(m.voice)));
  assert.ok(members.some(m=>PRESENTATION_VOICES["male-presenting"].includes(m.voice)));
  assert.deepEqual(cast,createTheatreCasting([...parseTheatreItems(text)].reverse()));
});

for(const bad of [null,[],[{...metadata[0],voicePresentation:"provider-female"},metadata[1]],[metadata[0],metadata[0]],[{...metadata[0],speakerId:"invented"},metadata[1]],[{...metadata[0],text:"rewrite"},metadata[1]]])
 test(`generated cast rejects incomplete/malformed metadata ${JSON.stringify(bad)}`,()=>assert.throws(()=>validateTheatreCharacters(bad,"CLARA: Oui.\nMARC: Non.")));

for(const [before,after] of [["MARC: Oui.","MARC: Non."],["MARC: Oui.","CLARA: Non."],["LE CHŒUR: Ensemble.","CLARA: Oui."],["","MARC: Oui."],["MARC: Oui.",""],["[Le rideau se lève.]","[Le rideau tombe.]"]])
 for(const direction of ["[Un train arrive.]","(Un train arrive.)"])
 test(`narrator owns ${direction} between ${before} / ${after}`,()=>{
   const items=parseTheatreItems([before,direction,after].filter(Boolean).join("\n\n"));
   const stage=items.find(i=>i.text===direction); assert.equal(stage.type,"stage"); assert.equal(stage.speaker,"NARRATOR");
   const cast=createTheatreCasting(items); assert.ok(cast.members.filter(m=>m.role!=="narrator").every(m=>m.voice!==cast.narrator.voice));
 });

test("inline parenthetical dialogue stays spoken by its character; pending labels survive stage interludes",()=>{
  const items=parseTheatreItems("CLARA:\n[Elle sourit.]\nOui (peut-être).\nMARC: [C'est une citation.] Non.");
  assert.deepEqual(items.map(i=>[i.type,i.speaker,i.text]),[["stage","NARRATOR","[Elle sourit.]"],["dialogue","CLARA","Oui (peut-être)."],["dialogue","MARC","[C'est une citation.] Non."]]);
  const doc=importDocument("CLARA\n[Elle sourit.]\nOui.\nMARC\n[Il attend.]\nNon.","pending");
  assert.equal(doc.contentType,"theatre"); assert.deepEqual(parseTheatreItems(doc.text).filter(i=>i.type==="dialogue").map(i=>i.speaker),["CLARA","MARC"]);
});

function routes(){
  const speech=[],analyses=[]; let generationCalls=0;
  class OpenAI {constructor(){
    this.responses={create:async body=>{
      if(body.text.format.name==="learning_passage"){generationCalls++;return {output_text:JSON.stringify({...fixture,characters:metadata})};}
      const input=JSON.parse(body.input[1].content),items=input.items;analyses.push(input);
      return {status:"completed",output_text:JSON.stringify({...analysisFor(items),ambience:station(items)})};
    }};
    this.audio={speech:{create:async body=>{speech.push(body);return {arrayBuffer:async()=>Buffer.from(body.input)};}}};
  }}
  const loader=createLoader({openai:OpenAI});
  return {speech,analyses,get generationCalls(){return generationCalls;},generate:loader("app/api/generate-article/route.ts").POST,read:loader("app/api/read-passage/route.ts").POST};
}
const request=body=>new Request("http://localhost/api",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});

for(const origin of ["imported","generated"]) test(`exact Le Dernier Train: ${origin} → real routes → synchronized complete playback`,async()=>{
  const before=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY="test-only-placeholder";
  try{
    const r=routes(); let doc;
    if(origin==="imported")doc=importDocument(fixture.text,"train");
    else {const response=await r.generate(request({contentType:"theatre",level:"B1"}));assert.equal(response.status,200);doc=await response.json();assert.deepEqual(doc.theatreCharacters,metadata);}
    assert.equal(doc.contentType,"theatre"); assert.equal(doc.originalText,fixture.text);
    const stages=fixture.text.split("\n").filter(line=>line.startsWith("[")); assert.equal(stages.length,12);
    const originalItems=parseTheatreItems(fixture.text);assert.equal(originalItems.length,47);
    let expectedCast;
    for(const speed of ["very-slow","slow","normal","fast"]){
      const env=webEnvironment();let result;
      const s=new ReadingPlaybackSession(env,async(_url,options)=>{const response=await r.read(new Request("http://localhost/api",options));assert.equal(response.status,200);result=await response.clone().json();return response;});
      await s.start(doc.text,speed,doc);await settle();
      assert.deepEqual(result.clips.map(c=>c.text),originalItems.map(i=>i.text));
      assert.deepEqual(result.clips.filter(c=>c.type==="dialogue").map(c=>c.text),fixture.text.split("\n").filter(line=>/^(CLARA|MARC|LE CHŒUR) : /u.test(line)).map(line=>line.slice(line.indexOf(" : ")+3)));
      assert.deepEqual(result.clips.filter(c=>c.type==="stage").map(c=>c.text),stages);
      const cast=result.casting,clara=cast.members.find(m=>m.speaker==="CLARA"),marc=cast.members.find(m=>m.speaker==="MARC");
      assert.equal(clara.presentation,"female-presenting");assert.equal(marc.presentation,"male-presenting");assert.notEqual(clara.voice,marc.voice);
      assert.equal(clara.castingSource,origin==="imported"?"name-convention-fr":"generated-metadata");
      if(expectedCast)assert.deepEqual(cast,expectedCast);else expectedCast=cast;
      for(const c of result.clips){assert.equal(c.voice,c.type==="stage"?cast.narrator.voice:c.speaker==="CHŒUR"?cast.chorus.voice:c.speaker==="CLARA"?clara.voice:marc.voice);}
      assert.ok([clara.voice,marc.voice,...cast.chorus.voices].every(v=>v!==cast.narrator.voice));
      assert.equal(result.clips.filter(c=>c.chorus).length,2);assert.equal(s.getSnapshot().ambience.status,"detected_available");
      s.setAmbienceLevel("low");const loop=env.audios.find(a=>a.loop);assert.equal(loop.volume,0.08);s.setAmbienceLevel("medium");assert.equal(loop.volume,0.16);
      const speechCount=r.speech.length;
      s.theatre.pause();assert.equal(s.theatre.enterPractice(result.clips[1].id),true);
      s.theatre.replay();await settle();assert.equal(s.theatre.getSnapshot().practiceTarget.speaker,"CLARA");
      assert.equal(s.theatre.getSnapshot().queue[1].voice,clara.voice);s.theatre.finishPractice();s.theatre.resume();await settle();
      assert.equal(r.speech.length,speechCount);
      for(let i=0;i<47;i++){
        await settle();assert.equal(s.theatre.getSnapshot().currentIndex,i);
        if(result.clips[i].chorus){const nodes=env.nodes.slice(-3);assert.equal(nodes.length,3);assert.equal(new Set(nodes.map(n=>n.context)).size,1);nodes[0].end();assert.equal(s.theatre.getSnapshot().currentIndex,i);nodes.slice(1).forEach(n=>n.end());}
        else {if(i===1){s.theatre.pause();s.theatre.resume();s.theatre.replay();await settle();assert.equal(s.theatre.getSnapshot().queue[i].voice,clara.voice);}env.audios.findLast(a=>!a.loop&&!a.removed).end();}
      }
      await settle();assert.equal(s.theatre.getSnapshot().status,"completed");assert.equal(s.theatre.getSnapshot().completions.length,47);
      const analysisCount=r.analyses.length;
      await s.start(doc.text,speed,doc);await settle();assert.equal(r.analyses.length,analysisCount,"unchanged station classification reused");
      assert.equal(s.getSnapshot().ambience.environment,"station");
      s.dispose();assert.equal(env.created.length,env.revoked.length);assert.ok(env.contexts.every(c=>c.closed));
    }
  }finally{if(before===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=before;}
});

test("realistic PDF pagination removes only evidenced markers, retaining complete source provenance",async()=>{
  const doc=importDocument(pages,"pages");assert.equal(doc.contentType,"theatre");assert.equal(doc.originalText,pages);
  const removed=doc.normalization.filter(a=>a.kind==="pagination");assert.equal(removed.length,3);
  assert.deepEqual(removed.map(a=>pages.split("\n")[a.originalLines[0]-1]),["12","13","14"]);
  for(const retained of ["ACTE II","SCÈNE 2","2026","14 h","3 places","ligne 2","1. Prendre","2. Vérifier","20 euros","01 23 45 67 89","8 rue Victor-Hugo"])assert.ok(doc.text.includes(retained),retained);
  const mapped=doc.sourceMap.flatMap(m=>m.originalLines),deleted=removed.flatMap(a=>a.originalLines);
  assert.equal(new Set([...mapped,...deleted]).size,pages.split("\n").length);assert.ok(deleted.every(line=>!mapped.includes(line)));
  const data=await generateTheatreResponse(doc.text,1,async()=>"YQ==");assert.ok(data.clips.every(c=>!/[\s]?(?:12|13|14)$/.test(c.text)));
  assert.ok(data.clips.some(c=>c.speaker==="MARC"&&c.text==="2"));assert.equal(data.clips.filter(c=>c.chorus).length,2);
  assert.deepEqual(data.clips.filter(c=>c.type==="stage"&&c.text.startsWith("[")).map(c=>c.voice),Array(4).fill(data.casting.narrator.voice));
});

for(const number of ["2026","14 h","3 places","ligne 2","ACTE 2","ACTE II","SCÈNE 2","PARTIE 2","CHAPITRE 2","Exercice 2","12","1. Premier point","01 23 45 67 89"])
 test(`ambiguous/meaningful numeric line survives: ${number}`,()=>{
   const doc=importDocument(`[Entrée.]\nCLARA: Bonjour.\n${number}\nMARC: Salut.`,"number");assert.ok(doc.text.includes(number));
 });
