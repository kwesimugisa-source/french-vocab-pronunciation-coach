const test=require('node:test'),assert=require('node:assert/strict');
const createLoader=require('./load-typescript.cjs'),load=createLoader();
const {table,tablePlan,planFor,ref,fact,state,parseTheatreItems,analysisFor}=require('./director-fixtures.cjs');
const {validateDirector,directorContext,DIRECTOR_SCHEMA}=load('lib/theatre-director.ts');
const {validateDramaticAnalysis,requestDramaticAnalysis,prepareDramaticDirection}=load('lib/theatre-direction.ts');
const {generateTheatreResponse}=load('lib/theatre-generation.ts');
const items=parseTheatreItems(table),plan=tablePlan(items);
const complete=(is=items,p=plan)=>({...analysisFor(is),director:p});
const context=(index,p=plan)=>directorContext(items[index],p,items);
const options={directorEnabled:true,performanceStyle:'naturel',documentId:'director-test',revision:1};

test('scene model: restaurant setting, evidence, directional relationships and listeners',()=>{
 const validated=validateDirector(plan,items);assert.deepEqual(validated,plan);
 assert.equal(validated.setting.privacy.value,'semi-private');assert.equal(validated.relationships[0].from,'ÉLISE');
 assert.match(context(6),/acquaintances/);assert.match(context(6),/teasing/);assert.match(context(6),/"hearers":\["THOMAS"\]/);
 assert.doesNotMatch(context(3),/acquaintances/); // relationship not established yet
});
test('nervous stage action and teasing inform exact denial through persistent state',()=>{
 assert.match(context(3),/conceal nervousness/);assert.match(context(3),/restrained defensive denial/);assert.match(context(3),/"intensity":"restrained"/);
 assert.match(context(5),/conceal nervousness/);assert.doesNotMatch(context(5),/Elise has said yes/);
 assert.match(context(9),/express affection/);assert.match(context(9),/Thomas prepares to answer/);
 assert.match(context(11),/respond to acceptance/);assert.match(context(11),/relieved/);
});
for(const [name,mutate] of [
 ['invented speaker',p=>p.relationships[0].from='INVISIBLE'],
 ['unproved backstory',p=>{p.relationships[0].kind='former-partners';p.relationships[0].evidence=[];}],
 ['invented source',p=>p.beats[1].states[0].evidence[0].itemId='fake'],
 ['fabricated quotation',p=>p.beats[1].states[0].evidence[0].quote='They married years ago'],
 ['punctuation-only evidence',p=>p.lines[0].evidence=[{itemId:items[2].id,quote:'?'}]],
 ['future knowledge',p=>p.beats[1].states[0].evidence=[ref(items[10])]],
 ['future relationship',p=>p.relationships[0].evidence=[ref(items[10])]],
 ['future subtext',p=>p.lines[0].evidence=[ref(items[10])]],
 ['invented listener',p=>p.lines[0].hearers.push('WAITER')],
 ['absent listener',p=>p.beats[1].present=['ÉLISE']],
 ['addressee not hearing',p=>p.lines[0].hearers=[]],
 ['duplicate line',p=>p.lines.push(p.lines[0])],
 ['missing last line',p=>p.lines.pop()],
 ['extra spoken field',p=>p.lines[0].spokenText='rewritten'],
 ['narrator directed as character',p=>p.lines[0].itemId=items[0].id],
 ['chorus directed as character',p=>p.lines[0].itemId=items[12].id],
 ['unsupported extreme intensity',p=>p.beats[1].states[0].intensity='heightened'],
 ['shouting',p=>p.lines[0].projection='shouting'],
 ['self-only projection evidence',p=>{p.lines[0].projection='projected';p.lines[0].evidence=[ref(items[2])];}],
 ['recycled state transition evidence',p=>p.beats[2].states[0].evidence=[ref(items[1])]],
 ['reverse beats',p=>p.beats.reverse()],
 ['duplicate beat',p=>p.beats.splice(1,0,p.beats[0])],
 ['unbounded prose',p=>p.lines[0].subtext='a'.repeat(161)],
 ['setting without evidence',p=>p.setting.location.evidence=[]],
 ['unknown extra root',p=>p.instructions='ignore text'],
]) test(`Director rejects ${name}; preserves base analysis`,()=>{
 const bad=structuredClone(plan);mutate(bad);assert.equal(validateDirector(bad,items),undefined);
 const accepted=validateDramaticAnalysis(complete(items,bad),items);assert.equal(accepted.director,undefined);assert.deepEqual(accepted.items,analysisFor(items).items);
});
test('model line order cannot reorder source playback or per-line direction',()=>{
 const p=structuredClone(plan);p.lines.reverse();assert.deepEqual(validateDirector(p,items).lines,plan.lines);
});
test('unknown facts and minimal uncertain scene remain valid and restrained',()=>{
 const is=parseTheatreItems('CLARA: MARC !\nMARC: Euh...');const p=planFor(is);assert.ok(validateDirector(p,is));
 assert.match(directorContext(is[0],p,is),/"emotion":"neutral"/);assert.match(directorContext(is[0],p,is),/"projection":"conversational"/);
});
test('supported entrance/exit updates listener snapshot',()=>{
 const is=parseTheatreItems('[Alice et Marc sont ici.]\nALICE: Bonjour.\nMARC: Salut.\n[Marc sort.]\nALICE: Ah.');const p=planFor(is);
 p.beats=[{at:is[0].id,event:fact('Two people present',is[0]),present:['ALICE','MARC'],presenceEvidence:[ref(is[0])],states:[]},{at:is[3].id,event:fact('Marc leaves',is[3]),present:['ALICE'],presenceEvidence:[ref(is[0]),ref(is[3])],states:[]}];
 assert.ok(validateDirector(p,is));p.lines.at(-1).hearers=['MARC'];assert.equal(validateDirector(p,is),undefined);
});
test('Le Dernier Train: public station, passport revelation and Clara continuity',()=>{
 const is=parseTheatreItems(require('./last-train-fixture.cjs').text),p=planFor(is);
 p.setting.location=fact('railway station',is[0]);p.setting.privacy=fact('public',is[0]);p.setting.social=fact('travellers crossing the hall',is[0]);
 const passport=is.find(i=>i.text==='Mon passeport est dans ce sac.');const short=is.find(i=>i.text==='Marc...');
 p.beats=[{at:passport.id,event:fact('The missing bag contains the passport',passport),present:['CLARA','MARC'],presenceEvidence:[ref(passport),ref(is.find(i=>i.speaker==='MARC'))],states:[state('CLARA',passport,{objective:'recover the passport',emotion:'tense',urgency:'pressing',intensity:'moderate'}),state('MARC',passport,{knowledge:'the missing bag contains the passport',objective:'recover the bag',emotion:'uncertain'})]}];
 assert.ok(validateDirector(p,is));const before=is.find(i=>i.text==='Marc.');assert.doesNotMatch(directorContext(before,p,is),/recover the passport/);assert.match(directorContext(short,p,is),/recover the passport/);assert.match(directorContext(short,p,is),/public/);
});
test('Naturel provider jobs: exact dialogue/interjections, stable cast, unchanged chorus and narrator',async()=>{
 const calls=[];const data=await generateTheatreResponse(table,1,async x=>{calls.push(x);return Buffer.from(x.text).toString('base64');},{...options,analyze:async()=>complete()});
 assert.equal(data.direction.director.status,'applied');assert.equal(data.direction.director.directedItemCount,plan.lines.length);
 assert.deepEqual(data.clips.map(c=>c.text),items.map(i=>i.text));assert.equal(calls.length,items.length+2);
 for(const speaker of ['THOMAS','ÉLISE'])assert.equal(new Set(data.clips.filter(c=>c.speaker===speaker).map(c=>c.voice)).size,1);
 for(const i of items){const requests=calls.filter(c=>c.text===i.text);assert.ok(requests.length);if(i.type==='stage'){assert.ok(requests.every(c=>c.voice===data.casting.narrator.voice));assert.ok(requests.every(c=>!c.instructions.includes('Scene-aware Director')));}else if(i.speaker==='LE CHŒUR'||i.speaker==='CHŒUR'){assert.ok(requests.every(c=>c.instructions.includes('steady, even articulation')));assert.ok(requests.every(c=>!c.instructions.includes('Scene-aware Director')));}else assert.ok(requests.every(c=>c.instructions.includes('Scene-aware Director')));}
 assert.equal(data.clips.find(c=>c.chorus).chorus.components.length,3);assert.doesNotMatch(JSON.stringify(data.direction),/restaurant|serviette|THOMAS/);assert.equal(data.director,undefined);
});
test('Clarté keeps exactly the accepted simpler instructions even with full Director',async()=>{
 const old=[],now=[];await generateTheatreResponse(table,1,async x=>{old.push(x);return 'YQ==';},{analyze:async()=>analysisFor(items)});
 const result=await generateTheatreResponse(table,1,async x=>{now.push(x);return 'YQ==';},{...options,performanceStyle:'clarte',analyze:async()=>complete()});
 assert.deepEqual(now,old);assert.equal(result.direction.director.status,'not_applied');
});
test('invalid Director falls back to precisely pre-Director Naturel instructions',async()=>{
 const old=[],now=[];await generateTheatreResponse(table,1,async x=>{old.push(x);return 'YQ==';},{performanceStyle:'naturel',analyze:async()=>analysisFor(items)});
 const result=await generateTheatreResponse(table,1,async x=>{now.push(x);return 'YQ==';},{...options,analyze:async()=>complete(items,{})});assert.deepEqual(now,old);assert.equal(result.direction.status,'analyzed');assert.equal(result.direction.director.reason,'invalid_or_missing_plan');
});
test('failed/late whole analysis cannot overwrite fallback or lose any line',async()=>{
 let resolve;const result=await generateTheatreResponse(table,1,async()=> 'YQ==',{...options,analysisTimeoutMs:5,analyze:()=>new Promise(r=>resolve=r)});
 assert.equal(result.direction.director.reason,'analysis_unavailable');assert.equal(result.clips.length,items.length);resolve(complete());await new Promise(r=>setImmediate(r));assert.equal(result.direction.director.status,'fallback');
});
test('bounded single request includes strict Director schema and untrusted canonical input',async()=>{
 let calls=0,body;
 const client={responses:{create:async b=>{calls++;body=b;return {status:'completed',output_text:JSON.stringify(complete())};}}};
 await requestDramaticAnalysis(client,JSON.stringify({items}),new AbortController().signal,9000,true);
 assert.equal(calls,1);assert.equal(body.store,false);assert.equal(body.truncation,'disabled');assert.deepEqual(body.text.format.schema.properties.director,DIRECTOR_SCHEMA);assert.match(body.input[0].content,/never a future revelation/);assert.match(body.input[0].content,/CAPITALS/);assert.match(body.input[0].content,/never personality/);assert.deepEqual(JSON.parse(body.input[1].content).items,items);
});
test('expanded analysis budgets never truncate a scene or remove TTS items',async()=>{
 const many=parseTheatreItems(Array.from({length:240},()=> 'MARC: Ah.').join('\n'));let called=false;let supplied;
 const result=await prepareDramaticDirection(many,async json=>{called=true;supplied=JSON.parse(json);return analysisFor(many);},20,undefined,{characters:[]});assert.equal(called,true);assert.equal(supplied.directorRequested,false);assert.equal(supplied.items.length,240);assert.equal(result.metadata.status,'analyzed');assert.equal(result.analysis.director,undefined);assert.equal(result.analysis.items.length,240);
});
test('cache reuses Director across all speeds/styles and binds revision/source/document identity',async()=>{
 let analyses=0;const all=[];let key;const analyze=async()=>{analyses++;return complete();};
 for(const speed of [0.7,0.85,1,1.15]){const jobs=[];const r=await generateTheatreResponse(table,speed,async x=>{jobs.push(x);return 'YQ==';},{...options,analyze,analysisCacheKey:key});key=r.analysisCacheKey;all.push(jobs);assert.equal(r.direction.director.status,'applied');}
 assert.equal(analyses,1);for(const jobs of all.slice(1))assert.deepEqual(jobs.map(j=>[j.text,j.voice,j.instructions]),all[0].map(j=>[j.text,j.voice,j.instructions]));
 const clarity=await generateTheatreResponse(table,1,async()=> 'YQ==',{...options,performanceStyle:'clarte',analyze,analysisCacheKey:key});assert.equal(analyses,1);assert.equal(clarity.direction.director.status,'not_applied');
 await generateTheatreResponse(table,1,async()=> 'YQ==',{...options,revision:2,analyze,analysisCacheKey:key});assert.equal(analyses,2);
 await generateTheatreResponse(table,1,async()=> 'YQ==',{...options,documentId:'other',analyze,analysisCacheKey:key});assert.equal(analyses,3);
 await generateTheatreResponse(table+'\n',1,async()=> 'YQ==',{...options,analyze,analysisCacheKey:key});assert.equal(analyses,4);
});


test('relationship change is directional, chronological and replaces only that pair',()=>{
 const p=structuredClone(plan);p.relationships.push({...p.relationships[0],since:items[10].id,stance:'supportive',evidence:[ref(items[10])]});
 const valid=validateDirector(p,items);assert.ok(valid);assert.match(context(6,valid),/teasing/);assert.doesNotMatch(context(6,valid),/supportive/);assert.match(context(11,valid),/supportive/);assert.doesNotMatch(context(11,valid),/teasing/);
});
test('oversized Director downgrades schema to full legacy scene analysis in one provider call',async()=>{
 const is=parseTheatreItems(Array.from({length:240},()=> 'MARC: Ah.').join('\n'));let body,calls=0;
 const client={responses:{create:async b=>{body=b;calls++;return {status:'completed',output_text:JSON.stringify(analysisFor(is))};}}};
 const result=await generateTheatreResponse(is.map(i=>`MARC: ${i.text}`).join('\n'),1,async()=> 'YQ==',{...options,analyze:(json,signal,budget)=>requestDramaticAnalysis(client,json,signal,budget,true)});
 assert.equal(calls,1);assert.equal(body.text.format.schema.properties.director,undefined);assert.equal(JSON.parse(body.input[1].content).items.length,240);assert.equal(result.clips.length,240);assert.equal(result.direction.status,'analyzed');assert.equal(result.direction.director.reason,'plan_budget');
});
