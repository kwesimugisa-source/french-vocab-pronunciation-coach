const test=require('node:test'),assert=require('node:assert/strict');
const createLoader=require('./load-typescript.cjs');
const {analysisFor,planFor}=require('./director-fixtures.cjs');
const {request}=require('./incremental-fixtures.cjs');
const {answer}=require('./pronunciation-review-fixture.cjs');
const {environment}=require('./playback-fixtures.cjs');
process.env.OPENAI_API_KEY='ambiguity-only-mock';
function entry(items,name,language,localLanguage,basis='convention',classification=language==='fr'?'french-convention':'language-convention',status='established') {
 const item=items.find(i=>i.text.includes(name));return {id:name.replace(/[^a-z]/gi,'_'),name,aliases:[],classification,language,target:`Established ${language} reading, consistently across voices.`,evidence:[{itemId:item.id,quote:item.text.slice(0,120)}],resolution:{status,basis,localLanguage,rationale:'The quoted dialogue and whole-scene context establish the intended reading; no materially plausible competing reading remains.'}};
}
function setup(source,productionLanguage,propose,options={}) {
 const stats={analyses:0,tts:[]};class OpenAI {constructor(){this.responses={create:async b=>{stats.analyses++;const {items}=JSON.parse(b.input[1].content);assert.equal(JSON.parse(b.input[1].content).documentLanguageHint,'fr');return {status:'completed',output_text:JSON.stringify({...analysisFor(items),director:planFor(items),pronunciation:{version:1,context:{productionLanguage,inventoryComplete:options.complete!==false},entries:propose(items)}})};}};this.audio={speech:{create:async b=>{stats.tts.push(b);return {arrayBuffer:async()=>Buffer.from('mock')};}}};}}
 const load=createLoader({openai:OpenAI}),prepare=load('app/api/read-passage/route.ts').POST,clip=load('app/api/theatre-clip/route.ts').POST;
 const body={text:source,contentType:'theatre',documentId:'contextual-production',revision:1,speed:'normal',performanceStyle:'naturel'};
 return {stats,load,prepare,clip,body,start:async()=>{const r=await prepare(request(body));assert.equal(r.status,200);return r.json();}};
}
const cases=[
 ['French production and dialogue','THOMAS: Je suis prêt.\nJULIEN: Thomas !','fr','fr','fr','convention','french-convention'],
 ['English production and dialogue','THOMAS: I am ready.\nJULIEN: Thomas, we are waiting for you.','en','en','en','convention','language-convention'],
 ['clearly English dialogue in a French play','JULIEN: Nous sommes à Paris.\nÉLISE: Thomas, please come here. We need your help.','fr','en','en','convention','language-convention'],
 ['authored English name declaration','THOMAS: Ma mère anglaise m’a donné le prénom Thomas avec sa prononciation anglaise.\nÉLISE: Thomas !','fr','en','fr','authored','declared'],
 ['foreign person intentionally preserved','JULIEN: Nous citons James Joyce, écrivain irlandais, sous son nom anglais.','fr','en','fr','established-identity','preserved-foreign'],
];
for(const [label,source,productionLanguage,language,local,basis,classification] of cases)for(const style of ['clarte','naturel'])test(`${label}: automatic authority, no owner form (${style})`,async()=>{
 const name=label.startsWith('foreign')?'James Joyce':'Thomas',h=setup(source,productionLanguage,items=>[entry(items,name,language,local,basis,classification)]);h.body.performanceStyle=style;
 const m=await h.start();assert.equal(m.protocol,'incremental-v1');assert.equal(m.entries,undefined);assert.equal(h.stats.analyses,1);assert.equal(h.stats.tts.length,0);
 const ticket=h.load('lib/theatre-scene-ticket.ts').openScene(m.sceneToken,'ambiguity-only-mock'),a=ticket.plan.pronunciation;
 assert.equal(a.acceptance,'director-established');assert.equal(a.policyVersion,2);assert.equal(a.entries[0].language,language);assert.equal(a.automaticIds.length,1);
 for(const item of m.clips.filter(i=>i.text.includes(name))){const r=await h.clip(request({sceneToken:m.sceneToken,itemId:item.id,componentIndex:0}));assert.equal(r.status,200);const b=h.stats.tts.at(-1);assert.equal(b.input,item.text);assert.equal(b.voice,item.voice);assert.equal(b.speed,item.speed);assert.equal(b.model,'gpt-4o-mini-tts');assert.ok(b.instructions.length<=3800);assert.match(b.instructions,new RegExp(`"language":"${language}"`));if(productionLanguage==='en'){assert.match(b.instructions,/Production speech context: English/);assert.doesNotMatch(b.instructions,/clear French diction/);}}
});

test('generic conventional names follow the same policy, with no privileged name string',async()=>{
 for(const name of ['Camille','Émile','Alice','Paul']){
  const h=setup(`JULIEN: ${name}, nous sommes prêts.`,'fr',items=>[entry(items,name,'fr','fr')]);assert.equal((await h.start()).protocol,'incremental-v1');
 }
 const fs=require('node:fs');for(const path of ['lib/theatre-pronunciation.ts','lib/theatre-pronunciation-authority.ts'])assert.doesNotMatch(fs.readFileSync(path,'utf8'),/Thomas|Hardy/);
});

test('complete empty inventory proceeds with no owner review or pronunciation targets',async()=>{
 const h=setup('JULIEN: Bonjour.\nÉLISE: Nous sommes prêts.','fr',()=>[]),m=await h.start();assert.equal(m.protocol,'incremental-v1');assert.equal(h.stats.analyses,1);assert.equal(h.stats.tts.length,0);
 const a=h.load('lib/theatre-scene-ticket.ts').openScene(m.sceneToken,'ambiguity-only-mock').plan.pronunciation;assert.deepEqual(a.entries,[]);assert.equal(a.acceptance,'director-established');
});

for(const status of ['unknown','ambiguous','conflicting'])test(`${status} evidence holds only the unresolved name and preserves established decisions`,async()=>{
 const h=setup('JULIEN: Thomas est ici. Zyrqel arrive.','fr',items=>[entry(items,'Thomas','fr','fr'),entry(items,'Zyrqel','','mixed','uncertain','uncertain',status)]),d=await h.start();
 assert.equal(d.mode,'pronunciation-clarification');assert.deepEqual(d.entries.map(e=>e.name),['Zyrqel']);assert.equal(h.stats.tts.length,0);
 const draft=h.load('lib/theatre-scene-ticket.ts').openScene(d.pronunciationToken,'ambiguity-only-mock').plan.pronunciation;assert.deepEqual(draft.automaticIds,['Thomas']);
 // A client cannot replace the automatically established decision while answering another name.
 const bad=await h.prepare(request({...h.body,pronunciationToken:d.pronunciationToken,pronunciationAnswer:{...answer(d.entries),entries:[...answer(d.entries).entries,draft.entries[0]]}}));assert.equal(bad.status,400);
 const r=await h.prepare(request({...h.body,pronunciationToken:d.pronunciationToken,pronunciationAnswer:answer(d.entries)}));assert.equal(r.status,200);const m=await r.json();assert.equal(m.protocol,'incremental-v1');const accepted=h.load('lib/theatre-scene-ticket.ts').openScene(m.sceneToken,'ambiguity-only-mock').plan.pronunciation;assert.deepEqual(accepted.entries[0],draft.entries[0]);assert.equal(h.stats.analyses,1);
});

test('a confident-looking target without valid evidence or with mismatched convention does not auto-accept',async()=>{
 for(const mutate of [e=>{e.evidence=[];},e=>{e.resolution.localLanguage='mixed';},e=>{e.language='en';},e=>{delete e.resolution;}]){
  const h=setup('JULIEN: Thomas nous attend.','fr',items=>{const e=entry(items,'Thomas','fr','fr');mutate(e);return [e];});const r=await h.prepare(request(h.body));assert.equal(r.status,503);assert.equal((await r.json()).code,'THEATRE_ANALYSIS_FAILED');assert.equal(h.stats.tts.length,0);
 }
});

test('known cast omissions and incomplete inventories cannot masquerade as a complete empty decision',async()=>{
 for(const options of [{},{complete:false}]){
  const h=setup('THOMAS: Bonjour.\nJULIEN: Thomas !','fr',()=>[],options),r=await h.prepare(request(h.body));assert.equal(r.status,503);const d=await r.json();assert.equal(d.reason,'inventory_incomplete');assert.equal(d.entries,undefined);assert.equal(h.stats.tts.length,0);
 }
});

test('automatic authority reaches the client with no clarification and survives style reuse without reanalysis',async()=>{
 const source='THOMAS: Bonjour.\nJULIEN: Thomas ?',h=setup(source,'fr',items=>[entry(items,'Thomas','fr','fr')]),env=environment();
 const session=new (h.load('lib/reading-playback.ts').ReadingPlaybackSession)(env,(url,opts)=>(url.includes('theatre-clip')?h.clip:h.prepare)(new Request('http://localhost'+url,opts)));
 const doc={documentId:'contextual-production',revision:1,contentType:'theatre',language:'fr'};
 await session.start(source,'normal',doc,undefined,'THOMAS');assert.equal(session.getSnapshot().clarification,null);assert.equal(session.theatre.getSnapshot().status,'learner_turn');
 session.stop();await session.changeTheatreStyle('naturel',source,'slow',doc);await session.start(source,'slow',doc,undefined,'THOMAS');assert.equal(session.getSnapshot().clarification,null);assert.equal(h.stats.analyses,1);session.dispose();
});

test('overlapping entity names hold only those entities, not unrelated established names',async()=>{
 const h=setup('JULIEN: Thomas attend Camille.','fr',items=>[entry(items,'Thomas','fr','fr'),entry(items,'Camille','fr','fr'),{...entry(items,'Camille','fr','fr'),id:'another-person'}]),d=await h.start();
 assert.equal(d.mode,'pronunciation-clarification');assert.deepEqual(d.entries.map(e=>e.id),['Camille','another-person']);assert.equal(h.stats.tts.length,0);
});

test('old policy tickets require explicit restart',async()=>{
 const h=setup('JULIEN: Thomas arrive.','fr',items=>[entry(items,'Thomas','fr','fr')]),m=await h.start();
 const tickets=h.load('lib/theatre-scene-ticket.ts'),ticket=tickets.openScene(m.sceneToken,'ambiguity-only-mock');ticket.plan.pronunciation.policyVersion=1;
 const r=await h.prepare(request({...h.body,pronunciationToken:tickets.sealScene(ticket.plan,1,'ambiguity-only-mock')}));assert.equal(r.status,410);assert.equal(h.stats.analyses,1);assert.equal(h.stats.tts.length,0);
});

test('automatically accepted name authority reaches narrator and all chorus voices unchanged',async()=>{
 const h=setup('JULIEN: Thomas !\n[Thomas regarde sa serviette.]\nLE CHŒUR: Thomas, nous sommes prêts.','fr',items=>[entry(items,'Thomas','fr','fr')]),m=await h.start();assert.equal(m.protocol,'incremental-v1');
 for(const item of m.clips)for(let c=0;c<(item.chorus?3:1);c++){
  const r=await h.clip(request({sceneToken:m.sceneToken,itemId:item.id,componentIndex:c}));assert.equal(r.status,200);const data=await r.json(),b=h.stats.tts.at(-1);assert.equal(data.pronunciationDigest,m.pronunciationDigest);assert.equal(b.input,item.text);assert.equal(b.voice,item.chorus?.components[c].voice??item.voice);assert.match(b.instructions,/"language":"fr"/);
 }
 assert.equal(h.stats.tts.length,5);assert.equal(h.stats.analyses,1);
});
