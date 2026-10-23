const test=require('node:test'),assert=require('node:assert/strict');
const createLoader=require('./load-typescript.cjs');
const {analysisFor,planFor}=require('./director-fixtures.cjs');
const {environment}=require('./playback-fixtures.cjs');
const source='ÉLISE: Thomas, Nadia et Julien sont ici.\nTHOMAS: Élise, nous sommes prêts.\nNADIA: Julien nous attend.\nJULIEN: Nadia, entrons.';
const names=['Élise','Thomas','Nadia','Julien'];
function proposal(items){return {version:1,context:{productionLanguage:'fr',inventoryComplete:true},entries:names.map((name,index)=>{
 const item=items.find(i=>i.text.includes(name));return {id:`name-${index}`,name,aliases:[],classification:'french-convention',language:'fr',target:'Conventional French reading.',evidence:[{itemId:item.id,quote:item.text}],resolution:{status:'established',basis:'convention',localLanguage:'fr',rationale:'The French dialogue establishes the conventional reading.'}};
})};}
function harness(mutate=x=>x){
 const stats={analysis:0,tts:0};let change=mutate;
 class OpenAI{constructor(){this.responses={create:async b=>{stats.analysis++;const {items}=JSON.parse(b.input[1].content);const raw={...analysisFor(items),director:planFor(items),pronunciation:proposal(items)};const changed=change(raw);return {status:'completed',output_text:JSON.stringify(changed)};}};this.audio={speech:{create:async()=>{stats.tts++;throw Error('No audio expected');}}};}}
 const load=createLoader({openai:OpenAI});process.env.OPENAI_API_KEY='integration-hardening-mock';
 const route=load('app/api/read-passage/route.ts').POST,body={text:source,contentType:'theatre',documentId:'integration',revision:1};
 return {load,stats,body,route,repair(){change=x=>x;},request(){return route(new Request('http://localhost/api/read-passage',{method:'POST',body:JSON.stringify(body)}));}};
}
const cases=[
 ['accented lexical ID','validation_rejected',r=>{r.pronunciation.entries[0].id='élise';return r;}],
 ['malformed lexical ID','validation_rejected',r=>{r.pronunciation.entries[0].id='name 0';return r;}],
 ['evidence mismatch','evidence_mismatch',r=>{r.pronunciation.entries[0].evidence[0].quote='Not authored';return r;}],
 ['missing output','output_missing',r=>{delete r.pronunciation;return r;}],
 ['explicit incomplete inventory','inventory_incomplete',r=>{r.pronunciation.context.inventoryComplete=false;return r;}],
 ['known cast omission','missing_cast_coverage',r=>{r.pronunciation.entries=[];return r;}],
 ['invalid dramatic annotations with valid pronunciation','invalid_dramatic_analysis',r=>{r.items=[];return r;}],
 ['provider failure','provider_failure',()=>{throw Error('private provider detail');}],
 ['provider timeout','timeout',()=>{const e=Error('private timeout');e.name='APIConnectionTimeoutError';throw e;}],
];
for(const [label,reason,mutate] of cases)test(`${label}: technical failure never yields ordinary clarification; retry recovers`,async()=>{
 const h=harness(mutate),r=await h.request(),d=await r.json();assert.equal(r.status,503);assert.equal(d.code,'THEATRE_ANALYSIS_FAILED');assert.equal(d.reason,reason);assert.equal(d.retryable,true);
 assert.equal(d.mode,undefined);assert.equal(d.entries,undefined);assert.equal(d.pronunciationToken,undefined);assert.equal(d.sceneToken,undefined);assert.equal(h.stats.tts,0);
 assert.doesNotMatch(JSON.stringify(d),/Élise|THOMAS|Thomas|Nadia|Julien|Not authored|private/);
 h.repair();const next=await h.request();assert.equal(next.status,200);assert.equal((await next.json()).protocol,'incremental-v1');assert.equal(h.stats.analysis,2);assert.equal(h.stats.tts,0);
});
test('four-name scene automatically accepts French Thomas and accented display name without a form',async()=>{
 const h=harness(),r=await h.request(),m=await r.json();assert.equal(m.protocol,'incremental-v1');assert.equal(m.entries,undefined);
 const a=h.load('lib/theatre-scene-ticket.ts').openScene(m.sceneToken,'integration-hardening-mock').plan.pronunciation;
 assert.equal(a.acceptance,'director-established');assert.deepEqual(a.entries.map(e=>e.name),names);assert.equal(a.entries[0].id,'name-0');
});
test('schema, prompt and runtime enforce the identical lexical ID language',()=>{
 const h=harness(),p=h.load('lib/theatre-pronunciation.ts'),items=h.load('lib/theatre.ts').parseTheatreItems(source);
 const pattern=p.PRONUNCIATION_SCHEMA.properties.entries.items.properties.id.pattern;assert.equal(pattern,p.LEXICAL_ID_PATTERN);assert.ok(p.PRONUNCIATION_PROMPT.includes(pattern));assert.equal(p.PRONUNCIATION_SCHEMA.properties.entries.items.properties.id.minLength,1);assert.equal(p.PRONUNCIATION_SCHEMA.properties.entries.items.properties.id.maxLength,80);assert.match(p.PRONUNCIATION_PROMPT,/coverage of lexical entities, not certainty/);
 for(const id of ['name-0','LEXICAL_01','a'.repeat(80),'','é','has space','a'.repeat(81),'x\n']){
  const raw=proposal(items);raw.entries[0].id=id;assert.equal(!!p.validatePronunciationProposal(raw,items),new RegExp(pattern).test(id),id);assert.equal(new RegExp(pattern).test(id),['name-0','LEXICAL_01','a'.repeat(80)].includes(id));
 }
});
test('one technically invalid entry preserves unrelated valid decisions internally but cannot accept partial inventory',()=>{
 const h=harness(),items=h.load('lib/theatre.ts').parseTheatreItems(source),p=h.load('lib/theatre-pronunciation.ts'),raw=proposal(items);raw.entries[0].id='élise';
 const result=p.inspectPronunciationProposal(raw,items);assert.equal(result.proposal,undefined);assert.deepEqual(result.validEntries.map(e=>e.name),names.slice(1));assert.deepEqual(result.issues,[{index:0,reason:'validation_rejected'}]);
});
test('only genuinely unresolved entry enters clarification; established decisions remain automatic',async()=>{
 const h=harness(r=>{const e=r.pronunciation.entries[2];e.classification='uncertain';e.language='';e.target='';e.resolution.status='ambiguous';e.resolution.basis='uncertain';return r;}),r=await h.request(),d=await r.json();
 assert.equal(r.status,200);assert.equal(d.mode,'pronunciation-clarification');assert.equal(d.reason,'linguistic_ambiguity');assert.deepEqual(d.entries.map(e=>e.name),['Nadia']);assert.equal(h.stats.tts,0);
});
test('client technical failure clears clarification and releases busy state; explicit retry requests fresh analysis',async()=>{
 const h=harness(r=>{delete r.pronunciation;return r;}),env=environment();
 const session=new (h.load('lib/reading-playback.ts').ReadingPlaybackSession)(env,(url,options)=>h.route(new Request('http://localhost'+url,options)));
 const identity={documentId:'integration',revision:1,contentType:'theatre',language:'fr'};
 await session.start(source,'normal',identity);assert.equal(session.getSnapshot().clarification,null);assert.equal(session.getSnapshot().busy,false);assert.match(session.getSnapshot().error,/préparation de la scène/);assert.equal(env.audios.length,0);
 h.repair();await session.start(source,'normal',identity,undefined,'ÉLISE');assert.equal(h.stats.analysis,2);assert.equal(session.getSnapshot().clarification,null);assert.equal(session.theatre.getSnapshot().status,'learner_turn');session.dispose();
});
test('actual analysis deadline remains technical timeout',async()=>{
 const h=harness(),items=h.load('lib/theatre.ts').parseTheatreItems(source),result=await h.load('lib/theatre-direction.ts').prepareDramaticDirection(items,()=>new Promise(()=>{}),5);
 assert.equal(result.metadata.fallbackReason,'timeout');assert.throws(()=>h.load('lib/theatre-pronunciation-authority.ts').draftPronunciation({items,analysis:result.analysis,direction:result.metadata},'source'),e=>e.reason==='timeout');
});
test('accented and punctuated authored names and aliases stay byte-exact with independent machine IDs',()=>{
 const h=harness(),p=h.load('lib/theatre-pronunciation.ts'),items=h.load('lib/theatre.ts').parseTheatreItems('JULIEN: Émile, Jean-Pierre et O’Neil arrivent.');
 for(const name of ['Émile','Jean-Pierre','O’Neil']){
  const entry={...proposal(h.load('lib/theatre.ts').parseTheatreItems(source)).entries[0],id:'lexical_01',name,aliases:[name],evidence:[{itemId:items[0].id,quote:items[0].text}]};
  const result=p.inspectPronunciationProposal({version:1,context:{productionLanguage:'fr',inventoryComplete:true},entries:[entry]},items);
  assert.equal(result.issues.length,0);assert.equal(result.proposal.entries[0].name,name);assert.deepEqual(result.proposal.entries[0].aliases,[name]);assert.equal(result.proposal.entries[0].evidence[0].quote,items[0].text);
 }
});
test('pre-hardening sealed technical fallback cannot be approved through the owner-answer route',async()=>{
 const h=harness(),plan=await h.load('lib/theatre-generation.ts').prepareTheatrePlan(source),p=h.load('lib/theatre-pronunciation.ts');
 plan.pronunciation={version:1,policyVersion:2,productionLanguage:'unknown',automaticIds:[],productionId:'old-draft',sourceDigest:h.load('lib/theatre-pronunciation-authority.ts').pronunciationSourceDigest(source,h.body.documentId,h.body.revision),revision:1,digest:'',acceptance:'pending',excludedIds:[],status:'needs-clarification',inventoryReviewed:false,entries:p.pronunciationInventory(undefined,plan.items),occurrences:[]};
 const pronunciationToken=h.load('lib/theatre-scene-ticket.ts').sealScene(plan,1,'integration-hardening-mock');
 const r=await h.route(new Request('http://localhost/api/read-passage',{method:'POST',body:JSON.stringify({...h.body,pronunciationToken,pronunciationAnswer:require('./pronunciation-review-fixture.cjs').answer(plan.pronunciation.entries)})}));
 const d=await r.json();assert.equal(r.status,503);assert.equal(d.code,'THEATRE_ANALYSIS_FAILED');assert.equal(d.entries,undefined);assert.equal(d.pronunciationToken,undefined);assert.equal(h.stats.analysis,0);assert.equal(h.stats.tts,0);
});
test('technical rejection of a pending owner answer does not restore the old clarification form',async()=>{
 const h=harness(r=>{r.pronunciation.entries[0].resolution.status='unknown';return r;}),env=environment();let reject=false;
 const session=new (h.load('lib/reading-playback.ts').ReadingPlaybackSession)(env,(url,opts)=>reject?Promise.resolve(Response.json({code:'THEATRE_ANALYSIS_FAILED',reason:'output_missing',retryable:true},{status:503})):h.route(new Request('http://localhost'+url,opts)));
 await session.start(source,'normal',{documentId:'integration',revision:1,contentType:'theatre',language:'fr'});
 const state=session.getSnapshot().clarification;assert.ok(state);reject=true;
 await session.resolvePronunciation(state,require('./pronunciation-review-fixture.cjs').answer(state.entries).entries,true);
 assert.equal(session.getSnapshot().clarification,null);assert.equal(session.getSnapshot().busy,false);assert.equal(env.audios.length,0);assert.match(session.getSnapshot().error,/préparation/);session.dispose();
});
