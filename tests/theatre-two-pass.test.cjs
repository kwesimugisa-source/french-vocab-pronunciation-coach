const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {createHash} = require('node:crypto');
const createLoader = require('./load-typescript.cjs');
const load = createLoader({openai:class {constructor(){throw Error('Provider forbidden');}}});
const api = load('lib/theatre-two-pass.ts');
const {planFor,analysisFor,state,ref} = require('./director-fixtures.cjs');
const clone = structuredClone;
const unwrap = r => {assert.equal(r.ok,true,JSON.stringify(r.ok?null:r.error));return r.value;};
const rejected = (r,reason) => {assert.equal(r.ok,false);if(reason)assert.equal(r.error.reason,reason);return r.error;};
const source = '[Alice et Marc attendent dans une salle.]\nALICE: Bonjour, Marc.\nMARC: Bonjour, Alice.\n[Alice et Marc restent dans la salle.]\nALICE: Nous attendons.';
function authorityHash(a){a.digest=createHash('sha256').update(JSON.stringify({...a,digest:undefined})).digest('hex');return a;}
function fixture(text=source,style='naturel') {
  const p=unwrap(api.createCanonicalPreparation(text,{productionId:'fixture-production',documentId:'fixture',documentRevision:1,performanceStyle:style}));
  const {items}=p;
  const director=planFor(items);
  const characters=[...new Set(items.filter(i=>load('lib/theatre-casting.ts').theatreRole(i)==='character').map(i=>i.speaker))];
  director.beats=[{at:items[0].id,event:{value:'unknown',evidence:[]},present:characters,presenceEvidence:[ref(items[0])],states:[]}];
  const proposal={version:1,context:{productionLanguage:'fr',inventoryComplete:true},entries:characters.map((name,i)=>({
    id:`cast-${i}`,name,aliases:[],classification:'french-convention',language:'fr',target:'French convention',
    evidence:[ref(items.find(item=>item.text.toUpperCase().includes(name)))],
    resolution:{status:'established',basis:'convention',localLanguage:'fr',rationale:'Established French dialogue'}
  }))};
  const ambience={environment:'none',confidence:'high',basis:'explicit',evidence:[],rationale:'No ambient layer',contradictory:false};
  const {lines,...global}=director;
  const data={version:1,scene:analysisFor(items).scene,director:global,ambience,pronunciation:proposal};
  const production=unwrap(api.acceptProductionDirection(p,data));
  const legacy={items,casting:p.casting,performanceStyle:style,pronunciationCharacters:[],analysis:{...analysisFor(items),director,ambience,pronunciation:proposal},direction:{fallbackReason:null}};
  const draft=load('lib/theatre-pronunciation-authority.ts').draftPronunciation(legacy,p.sourceDigest);
  const authority=authorityHash({...clone(draft),productionId:p.productionId});
  const delivery={version:1,items:analysisFor(items).items,lines};
  const performance=unwrap(api.acceptPerformanceDirection(p,production,authority,delivery));
  return {p,data,production,authority,delivery,performance};
}
function p1(mutator){const f=fixture();const data=clone(f.data);mutator(data,f);return api.acceptProductionDirection(f.p,data);}
function p2(mutator){const f=fixture();const data=clone(f.delivery);mutator(data,f);return api.acceptPerformanceDirection(f.p,f.production,f.authority,data);}

test('versioned global/performance artifacts accepted, immutable, deterministic and domain separated',()=>{
  const f=fixture();assert.equal(api.validateProductionDirection(f.p,f.production).ok,true);
  assert.equal(api.validatePerformanceDirection(f.p,f.production,f.authority,f.performance).ok,true);
  assert.deepEqual(unwrap(api.acceptProductionDirection(f.p,clone(f.data))),f.production);
  const reordered=Object.fromEntries(Object.entries(f.data).reverse());
  assert.equal(unwrap(api.acceptProductionDirection(f.p,reordered)).binding.digest,f.production.binding.digest);
  assert.notEqual(f.production.binding.digest,f.performance.binding.digest);
  assert.ok(Object.isFrozen(f.production.data.director.beats));
  assert.equal(f.performance.binding.upstream.productionDigest,f.production.binding.digest);
});
test('composer emits existing TheatrePlan shape and unchanged compiled instructions, without input mutation',()=>{
  const f=fixture(),before=JSON.stringify(f),plan=unwrap(api.composeTheatrePlan(f.p,f.production,f.authority,f.performance));
  assert.deepEqual(Object.keys(plan).sort(),['items','casting','analysis','direction','performanceStyle','pronunciationCharacters','pronunciation','analysisCacheKey','ambience'].sort());
  assert.deepEqual(plan.items,f.p.items);assert.deepEqual(plan.casting,f.p.casting);assert.deepEqual(plan.pronunciation,f.authority);
  assert.deepEqual(plan.analysis.scene,f.data.scene);assert.deepEqual(plan.analysis.ambience,f.data.ambience);
  assert.deepEqual(plan.analysis.director,{...f.data.director,lines:f.delivery.lines});assert.deepEqual(plan.analysis.items,f.delivery.items);
  assert.equal(JSON.stringify(f),before);
  const legacy={version:1,scene:f.data.scene,ambience:f.data.ambience,pronunciation:f.data.pronunciation,items:f.delivery.items,director:{...f.data.director,lines:f.delivery.lines}};
  const compile=load('lib/theatre-speech-instructions.ts').theatreSpeechInstructions;
  for(const item of f.p.items) for(const style of ['clarte','naturel']) {
    const context={voice:f.p.casting.members.find(m=>m.speaker===item.speaker).voice,items:f.p.items,pronunciation:f.authority};
    assert.equal(compile('fr',item,plan.analysis,style,context),compile('fr',item,legacy,style,context));
  }
  assert.deepEqual(unwrap(api.composeTheatrePlan(f.p,f.production,f.authority,f.performance)),plan);
});
test('Clarté retains not_applied metadata without removing validated Director',()=>{
  const f=fixture(source,'clarte');const plan=unwrap(api.composeTheatrePlan(f.p,f.production,f.authority,f.performance));
  assert.equal(plan.direction.director.status,'not_applied');assert.equal(plan.direction.director.directedItemCount,0);assert.ok(plan.analysis.director);
});
test('performance input order never determines canonical output order',()=>{
  const f=fixture();const raw=clone(f.delivery);raw.items.reverse();raw.lines.reverse();
  assert.deepEqual(unwrap(api.acceptPerformanceDirection(f.p,f.production,f.authority,raw)),f.performance);
});
for(const [name,mutation,reason] of [
  ['missing base item',d=>d.items.pop(),'missing_coverage'],
  ['duplicate base item',d=>d.items.push(d.items[0]),'duplicate_coverage'],
  ['unknown base item',d=>d.items[0].id='unknown','unknown_reference'],
  ['missing line',d=>d.lines.pop(),'missing_coverage'],
  ['duplicate line',d=>d.lines.push(d.lines[0]),'duplicate_coverage'],
  ['unknown line',d=>d.lines[0].itemId='unknown','unknown_reference'],
  ['stage line',(d,f)=>d.lines[0].itemId=f.p.items[0].id,'role_ineligible'],
  ['unknown listener',d=>d.lines[0].hearers=['UNKNOWN'],'unknown_character'],
  ['unknown addressee',d=>d.lines[0].addressee='UNKNOWN','unknown_character'],
  ['unknown line evidence',d=>d.lines[0].evidence[0].itemId='unknown','unknown_reference'],
  ['line excerpt mismatch',d=>d.lines[0].evidence[0].quote='PRIVATE NOT SOURCE','evidence_mismatch'],
  ['future line evidence',(d,f)=>d.lines[0].evidence=[ref(f.p.items[2])],'chronology_future'],
  ['projection lacks prior evidence',d=>d.lines[0].projection='soft','projection_evidence'],
  ['self listener',d=>d.lines[0].hearers=['ALICE'],'listener_violation'],
  ['addressee not a hearer',d=>d.lines[0].addressee='MARC','listener_violation'],
  ['lexical gap',d=>d.lexicalGaps=[{itemIndex:1}],'lexical_inventory_gap'],
]) test(name,()=>rejected(p2(mutation),reason));
for(const field of ['setting','relationships','beats','states','ambience','productionLanguage','pronunciation','pronunciationAuthority','casting','binding','revision','digest'])
  test(`Pass 2 rejects ownership field ${field}`,()=>rejected(p2(d=>d[field]='PRIVATE'), 'unauthorized_ownership'));
for(const field of ['items','lines','casting','authority','binding'])
  test(`Pass 1 rejects ownership field ${field}`,()=>rejected(p1(d=>d[field]=[]),'unauthorized_ownership'));

const relationship=(f,since=1,fromEvidence=2)=>({from:'ALICE',to:'MARC',since:f.p.items[since].id,kind:'acquaintances',stance:'unknown',evidence:[ref(f.p.items[fromEvidence])]});
test('Stage 10B 60-item first rejection: relationship cites index 2 from anchor 1',()=>{
  const error=rejected(p1((d,f)=>{d.director.relationships=[relationship(f)];d.director.relationships[0].evidence.unshift(ref(f.p.items[1]));}),'chronology_future');
  assert.equal(error.path,'production.director.relationships[0].evidence[1]');assert.equal(error.index,2);assert.equal(error.anchorIndex,1);
});
test('Stage 10B 117-item first rejection: presence cites index 2 from anchor 1',()=>{
  const error=rejected(p1((d,f)=>d.director.beats.push({at:f.p.items[1].id,event:{value:'unknown',evidence:[]},present:['ALICE','MARC'],presenceEvidence:[ref(f.p.items[1]),ref(f.p.items[2])],states:[]})),'chronology_future');
  assert.equal(error.path,'production.director.beats[1].presenceEvidence[1]');assert.equal(error.index,2);assert.equal(error.anchorIndex,1);
});
for(const [name,mutation,reason] of [
  ['future beat event',(d,f)=>d.director.beats[0].event={value:'event',evidence:[ref(f.p.items[1])]},'chronology_future'],
  ['future state',(d,f)=>d.director.beats[0].states=[state('ALICE',f.p.items[1])],'chronology_future'],
  ['duplicate beat anchor',d=>d.director.beats.push(clone(d.director.beats[0])),'chronology_order'],
  ['unknown beat anchor',d=>d.director.beats[0].at='unknown','unknown_reference'],
  ['unknown state speaker',(d,f)=>d.director.beats[0].states=[state('UNKNOWN',f.p.items[0])],'unknown_character'],
  ['state absent from snapshot',(d,f)=>{d.director.beats[0].present=['MARC'];d.director.beats[0].states=[state('ALICE',f.p.items[0])];},'presence_violation'],
  ['unknown setting evidence',d=>d.director.setting.location={value:'location',evidence:[{itemId:'unknown',quote:'PRIVATE'}]},'unknown_reference'],
  ['unknown relationship participant',(d,f)=>{d.director.relationships=[relationship(f,2,1)];d.director.relationships[0].to='UNKNOWN';},'unknown_character'],
  ['state without new evidence',(d,f)=>d.director.beats.push({at:f.p.items[3].id,event:{value:'unknown',evidence:[]},present:['ALICE','MARC'],presenceEvidence:[ref(f.p.items[0])],states:[state('ALICE',f.p.items[0])]}),'chronology_progression'],
  ['pronunciation incomplete',d=>d.pronunciation.context.inventoryComplete=false,'inventory_incomplete'],
  ['pronunciation evidence mismatch',d=>d.pronunciation.entries[0].evidence[0].quote='PRIVATE NOT SOURCE','evidence_mismatch'],
  ['invalid ambience',d=>d.ambience.environment='PRIVATE','ambience_invalid'],
]) test(name,()=>rejected(p1(mutation),reason));
test('whole-production setting may cite later canonical evidence',()=>{
  assert.equal(p1((d,f)=>d.director.setting.location={value:'room',evidence:[ref(f.p.items.at(-1))]}).ok,true);
});
test('valid prior projection evidence accepted',()=>assert.equal(p2((d,f)=>{d.lines[0].projection='soft';d.lines[0].evidence=[ref(f.p.items[0])];}).ok,true));
test('future beat cannot establish a current listener; current beat must contain speaker',()=>{
  const f=fixture(),data=clone(f.data);data.director.beats[0].present=['ALICE'];
  data.director.beats.push({at:f.p.items[3].id,event:{value:'unknown',evidence:[]},present:['ALICE','MARC'],presenceEvidence:[ref(f.p.items[3])],states:[]});
  const production=unwrap(api.acceptProductionDirection(f.p,data)),raw=clone(f.delivery);raw.lines[0].hearers=['MARC'];raw.lines[0].addressee='MARC';
  rejected(api.acceptPerformanceDirection(f.p,production,f.authority,raw),'presence_violation');
  rejected(api.acceptPerformanceDirection(f.p,production,f.authority,f.delivery),'presence_violation');
});
test('effective context derives past relationships/states; future entries cannot leak backward',()=>{
  const f=fixture(),data=clone(f.data);
  data.director.relationships=[relationship(f,3,3)];
  data.director.beats.push({at:f.p.items[3].id,event:{value:'unknown',evidence:[]},present:['ALICE','MARC'],presenceEvidence:[ref(f.p.items[3])],states:[state('ALICE',f.p.items[3],{emotion:'relieved'})]});
  const production=unwrap(api.acceptProductionDirection(f.p,data));
  const performance=unwrap(api.acceptPerformanceDirection(f.p,production,f.authority,f.delivery));
  const before=unwrap(api.twoPassDelivery(f.p,production,f.authority,performance,1));
  const after=unwrap(api.twoPassDelivery(f.p,production,f.authority,performance,4));
  assert.equal(before.relationships.length,0);assert.equal(before.state.emotion,'neutral');
  assert.equal(after.relationships.length,1);assert.equal(after.state.emotion,'relieved');
  const raw=clone(f.delivery);raw.lines[0].state={emotion:'relieved'};
  rejected(api.acceptPerformanceDirection(f.p,production,f.authority,raw),'malformed_structure');
});
for(const [name,change] of [
  ['wrong source digest',f=>f.p.sourceDigest='a'.repeat(64)],
  ['stale document',f=>f.p.documentId='stale'],
  ['stale revision',f=>f.p.documentRevision++],
  ['changed source',f=>f.p.text+='\nALICE: Encore.'],
  ['changed casting',f=>f.p.casting.narrator.voice='ash'],
  ['production digest',f=>f.production.binding.digest='a'.repeat(64)],
  ['production revision',f=>f.production.binding.revision++],
  ['production version',f=>f.production.binding.versions.policy++],
  ['performance digest',f=>f.performance.binding.digest='a'.repeat(64)],
  ['upstream digest',f=>f.performance.binding.upstream.productionDigest='a'.repeat(64)],
  ['upstream revision',f=>f.performance.binding.upstream.productionRevision++],
  ['authority digest',f=>f.authority.digest='a'.repeat(64)],
  ['authority revision',f=>{f.authority.revision++;authorityHash(f.authority);}],
  ['authority source',f=>{f.authority.sourceDigest='a'.repeat(64);authorityHash(f.authority);}],
  ['authority production identity',f=>{f.authority.productionId='other';authorityHash(f.authority);}],
]) test(`composition rejects ${name}`,()=>{const f=clone(fixture());change(f);rejected(api.composeTheatrePlan(f.p,f.production,f.authority,f.performance));});
test('new accepted Pass-1 revision cannot reuse old Pass 2 even with unchanged content',()=>{
  const f=fixture(),production=unwrap(api.acceptProductionDirection(f.p,f.data,2));
  rejected(api.composeTheatrePlan(f.p,production,f.authority,f.performance),'upstream_mismatch');
});
test('genuine ambiguity can be a valid Pass 1 but unresolved/missing authority cannot compose',()=>{
  const f=fixture(),data=clone(f.data);data.pronunciation.entries[0].resolution.status='ambiguous';
  assert.equal(api.acceptProductionDirection(f.p,data).ok,true);
  for(const authority of [undefined,null,{...clone(f.authority),status:'needs-clarification'}, {...clone(f.authority),inventoryReviewed:false}])
    rejected(api.composeTheatrePlan(f.p,f.production,authority,f.performance),'authority_violation');
});
test('narrator, chorus and silence retain canonical items/casting and no character-only lines',()=>{
  const f=fixture(source+'\nLE CHŒUR: Nous attendons.\n[Silence.]');
  const plan=unwrap(api.composeTheatrePlan(f.p,f.production,f.authority,f.performance));
  assert.equal(plan.items.length,7);assert.equal(plan.analysis.director.lines.length,3);
  assert.ok(plan.items.at(-1).pauseMs);assert.equal(plan.casting.chorus.voices.length,3);
  assert.deepEqual(plan.items,f.p.items);
});
test('diagnostics contain closed reasons/paths only, never unknown field text or accessors',()=>{
  const marker='PRIVATE_SECRET_AUTHORED';const f=fixture();
  const raw=clone(f.delivery);raw[marker]=marker;
  const issue=rejected(api.acceptPerformanceDirection(f.p,f.production,f.authority,raw));
  assert.ok(Object.hasOwn(api.TWO_PASS_REASONS,issue.reason));assert.doesNotMatch(JSON.stringify(issue),new RegExp(marker));
  let accessed=false;const malicious={get version(){accessed=true;throw Error(marker);}};
  rejected(api.acceptProductionDirection(f.p,malicious),'malformed_structure');assert.equal(accessed,false);
});
test('new module is not imported by any legacy production consumer',()=>{
  for(const file of ['app/api/read-passage/route.ts','app/api/theatre-clip/route.ts','lib/theatre-direction.ts','lib/theatre-generation.ts','lib/reading-playback.ts','lib/theatre-scene-ticket.ts','lib/theatre-analysis-cache.ts','lib/theatre-incremental.ts'])
    assert.doesNotMatch(fs.readFileSync(file,'utf8'),/theatre-two-pass/);
});

test('owner-confirmed resolution composes without changing automatically accepted entries',()=>{
  const f=fixture(),data=clone(f.data);data.pronunciation.entries[0].resolution.status='ambiguous';
  const production=unwrap(api.acceptProductionDirection(f.p,data));
  const legacy={items:f.p.items,pronunciationCharacters:[],analysis:{pronunciation:data.pronunciation},direction:{fallbackReason:null}};
  const acceptance=load('lib/theatre-pronunciation-authority.ts');
  const draft=acceptance.draftPronunciation(legacy,f.p.sourceDigest);
  const accepted=acceptance.acceptPronunciation(draft,{inventoryReviewed:true,entries:[data.pronunciation.entries[0]],excludedIds:[]},legacy);
  const authority=authorityHash({...clone(accepted),productionId:f.p.productionId});
  const performance=unwrap(api.acceptPerformanceDirection(f.p,production,authority,f.delivery));
  assert.equal(unwrap(api.composeTheatrePlan(f.p,production,authority,performance)).pronunciation.acceptance,'owner-confirmed');
});
test('rehashing cannot make a changed automatic pronunciation match Pass 1',()=>{
  const f=clone(fixture());f.authority.entries[0].target='different reading';authorityHash(f.authority);
  rejected(api.acceptPerformanceDirection(f.p,f.production,f.authority,f.delivery),'authority_violation');
});
test('missing acceptance provenance is rejected without throwing',()=>{
  const f=clone(fixture());delete f.authority.excludedIds;authorityHash(f.authority);
  rejected(api.composeTheatrePlan(f.p,f.production,f.authority,f.performance),'authority_violation');
});
test('malformed canonical state is rejected without throwing',()=>{
  const f=fixture();for(const p of [null,undefined,{},'PRIVATE']) rejected(api.composeTheatrePlan(p,f.production,f.authority,f.performance),'source_mismatch');
});
test('out-of-order relationships normalize like legacy before effective delivery lookup',()=>{
  const f=fixture(),data=clone(f.data);const early=relationship(f,1,1),later={...relationship(f,3,3),stance:'supportive'};
  data.director.relationships=[later,early];const production=unwrap(api.acceptProductionDirection(f.p,data));
  const performance=unwrap(api.acceptPerformanceDirection(f.p,production,f.authority,f.delivery));
  const context=unwrap(api.twoPassDelivery(f.p,production,f.authority,performance,4));
  assert.equal(context.relationships[0].stance,'supportive');
  assert.equal(production.data.director.relationships[0].since,f.p.items[1].id);
});
