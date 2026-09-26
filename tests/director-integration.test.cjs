const test=require('node:test'),assert=require('node:assert/strict');
const createLoader=require('./load-typescript.cjs');
const {table,tablePlan,planFor,analysisFor,parseTheatreItems}=require('./director-fixtures.cjs');
const {environment,flush}=require('./playback-fixtures.cjs');
process.env.OPENAI_API_KEY='test-placeholder';
function route(transform=(p)=>p){
 const calls=[],analyses=[];
 class OpenAI{constructor(){this.responses={create:async body=>{analyses.push(body);const input=JSON.parse(body.input[1].content);return {status:'completed',output_text:JSON.stringify({...analysisFor(input.items),ambience:{environment:'none',confidence:'uncertain',basis:'contextual',evidence:[],rationale:'No supported catalogue bed',contradictory:false},...(input.directorRequested?{director:transform(tablePlan(input.items))}:{})})};}};this.audio={speech:{create:async body=>{calls.push(body);return {arrayBuffer:async()=>Buffer.from(body.input)};}}};}}
 const load=createLoader({openai:OpenAI}),post=require('./complete-reading.cjs')(load);
 return {load,calls,analyses,post:body=>post(new Request('http://localhost/api/read-passage',{method:'POST',body:JSON.stringify(body)})),fetch:(_url,options)=>post(new Request('http://localhost/api/read-passage',options))};
}
for(const speed of ['very-slow','slow','normal','fast'])test(`real API ${speed}: French anchoring surrounds Director; exact input and fixed voice`,async()=>{
 const r=route(),doc=r.load('lib/smart-import.ts').importDocument(table,'restaurant');const reply=await r.post({...doc,speed,performanceStyle:'naturel'});assert.equal(reply.status,200);const data=await reply.json();assert.equal(data.direction.director.status,'applied');assert.equal(r.analyses.length,1);
 for(const call of r.calls){assert.match(call.instructions,/Document language: French \(fr\)/);assert.match(call.instructions,/Maintain French pronunciation and phonology/);assert.match(call.instructions,/do not switch pronunciation language/);assert.equal(call.model,'gpt-4o-mini-tts');}
 const denial=r.calls.find(c=>c.input==='Je ne suis pas nerveux.');assert.match(denial.instructions,/restrained defensive denial/);assert.equal(denial.voice,r.calls.find(c=>c.input.startsWith('Euh...')).voice);
 assert.deepEqual(data.clips.map(c=>c.text),parseTheatreItems(doc.text).map(i=>i.text));assert.doesNotMatch(JSON.stringify(data.direction),/serviette|conceal nervousness/);
});
test('full API/controller lifecycle: Clarté → Naturel → replay/practice → speed; uncertain ambience still reuses one analysis',async()=>{
 const r=route(),env=environment(),{ReadingPlaybackSession}=r.load('lib/reading-playback.ts');const session=new ReadingPlaybackSession(env,r.fetch);const doc=r.load('lib/smart-import.ts').importDocument(table,'director-lifecycle');
 await session.start(doc.text,'normal',doc);assert.equal(r.analyses.length,1);const before=session.theatre.getSnapshot().queue.map(c=>[c.speaker,c.voice]);
 await session.changeTheatreStyle('naturel',doc.text,'normal',doc);assert.equal(r.analyses.length,1);assert.deepEqual(session.theatre.getSnapshot().queue.map(c=>[c.speaker,c.voice]),before);
 const current=session.theatre.getSnapshot().queue.find(c=>c.text==='Je ne suis pas nerveux.');assert.equal(session.theatre.enterPractice(current.id),true);const target=session.theatre.getSnapshot().practiceTarget;assert.equal(target.text,'Je ne suis pas nerveux.');assert.equal(target.speaker,'THOMAS');const count=r.calls.length;
 for(let i=0;i<10;i++){session.theatre.replay();await flush();assert.equal(await env.created.find(c=>c.url===env.latest().url).blob.text(),target.text);env.latest().end();}
 assert.equal(r.calls.length,count);assert.equal(r.analyses.length,1);session.theatre.finishPractice();session.stop();await session.start(doc.text,'slow',doc);assert.equal(r.analyses.length,1);assert.ok(r.calls.slice(count).some(c=>c.instructions.includes('Scene-aware Director')));
 session.dispose();assert.equal(env.created.length,env.revoked.length);
});
test('generated identity labels are propagated without presentation stereotypes; imports need no metadata',async()=>{
 const r=route(),doc=r.load('lib/content-document.ts').generatedDocument({title:'Restaurant',text:table,theatreCharacters:[{speakerId:'THOMAS',displayName:'Thomas',voicePresentation:'male-presenting'},{speakerId:'ÉLISE',displayName:'Élise',voicePresentation:'female-presenting'}]},'theatre','B1','generated-director');
 const response=await r.post({...doc,performanceStyle:'naturel'});assert.equal(response.status,200);assert.equal((await response.json()).direction.director.status,'applied');
 const input=JSON.parse(r.analyses[0].input[1].content);assert.deepEqual(input.characters,doc.theatreCharacters.map(({speakerId,displayName})=>({speakerId,displayName})));assert.doesNotMatch(JSON.stringify(input.characters),/male|female|voice/);
 const imported=r.load('lib/smart-import.ts').importDocument(table,'imported-director');assert.equal(imported.theatreCharacters,undefined);const next=await r.post({...imported,performanceStyle:'naturel'});assert.equal((await next.json()).direction.director.status,'applied');
});
test('actual API malformed Director: sanitized fallback, complete exact clips and legacy Naturel',async()=>{
 const r=route(()=>({privateError:'DO NOT LEAK'})),reply=await r.post({text:table,contentType:'theatre',performanceStyle:'naturel'});assert.equal(reply.status,200);const data=await reply.json();assert.equal(data.direction.director.reason,'invalid_or_missing_plan');assert.equal(data.clips.length,parseTheatreItems(table).length);assert.ok(r.calls.some(c=>c.instructions.includes('Untrusted surrounding script data')));assert.ok(r.calls.every(c=>!c.instructions.includes('Scene-aware Director')));assert.doesNotMatch(JSON.stringify(data),/DO NOT LEAK/);
});
test('Director never runs for any ordinary mode, poetry, conversation or Virelangues',async()=>{
 const r=route();for(const contentType of ['news','opinion','creative','academic','everyday-life','poetry','tongue-twisters','conversation']){
 const text=contentType==='conversation'?'A: Bonjour.\nB: Salut.':contentType==='tongue-twisters'?'Exercice du son R\nTrois tortues trottent.':'Un jour calme.\nLe ciel est bleu.';
 const response=await r.post({text,contentType,performanceStyle:'naturel'});assert.equal(response.status,200,contentType);}
 assert.equal(r.analyses.length,0);assert.ok(r.calls.every(c=>!c.instructions.includes('Scene-aware Director')));
});
test('functional cache TTL, capacity, cloning and exact scope are private process-local protections',()=>{
 const {TheatreAnalysisCache}=require('./load-typescript.cjs')()('lib/theatre-analysis-cache.ts');let now=0;const cache=new TheatreAnalysisCache(()=>now,2),is=parseTheatreItems(table),plan={...analysisFor(is),director:tablePlan(is)};
 const key=cache.put(table,plan,'revision1');const copy=cache.get(key,table,'revision1');copy.director.lines[0].intent='conceal';assert.notEqual(cache.get(key,table,'revision1').director.lines[0].intent,'conceal');assert.equal(cache.get(key,table,'revision2'),undefined);assert.equal(cache.get(key,table+' changed','revision1'),undefined);
 cache.put(table,plan,'revision2');cache.put(table,plan,'revision3');assert.equal(cache.get(key,table,'revision1'),undefined);const fresh=cache.put(table,plan,'revision4');now=30*60_000;assert.equal(cache.get(fresh,table,'revision4'),undefined);
});
