const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const load=require('./load-typescript.cjs')(),events=load('lib/beta-events.ts'),{TheatrePreparationRecorder}=load('lib/beta-server.ts');
const context=(pass='pass1',preparationId=randomUUID(),epoch=1)=>({preparationId,epoch,pass});
function recorder(lineage=context(),sink){const rows=[];const r=new TheatrePreparationRecorder(randomUUID(),sink??(x=>rows.push(x)),()=>1000,lineage);r.activate();return{r,rows,lineage};}
const checkpoint={contract:1,prompt:1,schema:1,policy:1,pass1Revision:1,pass2Revision:0};
test('Pass-1 accepted is an intermediate terminal, never playable READY',()=>{const {r,rows,lineage}=recorder();
 for(const stage of ['pass1_provider','pass1_structured_response','pass1_validation','pronunciation_validation','inventory','occurrence_evidence','authority','pass1_accepted'])r.observe(stage,'passed');
 r.observe('pass1_accepted','passed','none',{checkpoint});const terminal=r.finish(200);assert.equal(terminal.disposition,'PASS1_READY');assert.equal(terminal.checkpoint,undefined);
 assert.ok(rows.every(row=>row.lineage.preparationId===lineage.preparationId&&row.requestId===r.requestId));assert.equal(rows.filter(x=>x.disposition).length,1);
 assert.deepEqual(r.finish(200),terminal);assert.deepEqual(rows.find(x=>x.checkpoint).checkpoint,checkpoint);
});
test('unaccepted two-pass response never silently reports READY',()=>{const {r}=recorder();assert.equal(r.finish(200).disposition,'TECHNICAL_HOLD');});
test('genuine ambiguity remains clarification, technical rejection stays technical',()=>{
 const {r}=recorder();r.observe('authority','passed','linguistic_ambiguity');assert.equal(r.finish(200).disposition,'CLARIFICATION_REQUIRED');
 const bad=recorder().r;bad.observe('pronunciation_validation','rejected','output_missing');bad.observe('authority','passed','linguistic_ambiguity');assert.equal(bad.finish(200).disposition,'TECHNICAL_HOLD');
});
test('Pass-2 hold and explicit retry correlate independently, earliest blocking cause survives',()=>{
 const lineage=context('pass2'),first=recorder(lineage);first.r.observe('pass2_structured_response','rejected','parse_rejected');first.r.observe('pass2_validation','rejected','validation_rejected');
 const terminal=first.r.finish(503);assert.equal(terminal.reason,'parse_rejected');assert.equal(terminal.stage,'pass2_structured_response');assert.equal(terminal.disposition,'TECHNICAL_HOLD');
 const second=recorder({...lineage,epoch:2});second.r.observe('pass2_validation','passed');assert.equal(second.r.finish(200).disposition,'PASS2_READY');
 assert.notEqual(first.r.requestId,second.r.requestId);assert.equal(first.rows[0].lineage.preparationId,second.rows[0].lineage.preparationId);
});
test('composition and ticket acceptance explicitly distinguish final READY',()=>{const {r,rows}=recorder(context('pass2'));
 for(const stage of ['pass2_provider','pass2_structured_response','pass2_validation','composition','ticket'])r.observe(stage,'passed');
 assert.equal(r.finish(200).disposition,'READY');assert.deepEqual(rows.slice(1,-1).map(x=>x.stage),['pass2_provider','pass2_structured_response','pass2_validation','composition','ticket']);
});
test('timeout/cancellation and late settlement have one terminal outcome',()=>{
 for(const cause of ['timeout','cancelled']){const {r,rows}=recorder(context('pass2'));r.observe('pass2_provider','started');assert.equal(r.finish(503,cause).reason,cause);r.finish(200);r.observe('pass2_provider','passed');r.observe('pass2_provider','rejected','provider_failure');
 assert.equal(rows.filter(x=>x.disposition).length,1);assert.equal(rows.filter(x=>x.outcome==='ignored').length,1);}
});
test('existing record bounds support maximal lineage and separate evidence/versions',()=>{
 const {r,rows}=recorder(context('pass2',randomUUID(),10000));
 for(const [kind,fields]of Object.entries(events.PREPARATION_BOUNDARY_RULES)){
 const boundary={kind,...Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,typeof v==='number'?v:[...v].sort((a,b)=>b.length-a.length)[0]]))};
 r.observe('provider_evidence','present','none',{boundary});}
 r.observe('pass2_validation','passed','none',{checkpoint:{contract:10000,prompt:10000,schema:10000,policy:10000,pass1Revision:10000,pass2Revision:10000}});
 assert.equal(rows.filter(x=>x.boundary).length,4);assert.equal(rows.filter(x=>x.checkpoint).length,1);
 for(let i=0;i<100;i++)r.observe('pass2_provider','started');r.observe('pass2_provider','rejected','timeout');r.finish(503);r.observe('pass2_provider','passed');
 assert.equal(rows.length,64);assert.equal(rows.filter(x=>x.disposition).length,1);
 for(const row of rows){const max={...row,timestamp:1e15,elapsedMs:3600000,totalElapsedMs:3600000,build:'a'.repeat(40)};events.validatePreparationRecord(max);assert.ok(JSON.stringify(max).length<=1024);}
});
test('closed privacy contract rejects authored content, hashes, output and extra fields',()=>{
 const {r,rows}=recorder();r.observe('pass1_accepted','passed');const good=r.finish(200);
 for(const key of ['text','sourceDigest','artifactDigest','modelOutput','evidence','prompt']){
 assert.throws(()=>events.validatePreparationRecord({...good,[key]:'PRIVATE'}));
 assert.throws(()=>events.validatePreparationRecord({...good,lineage:{...good.lineage,[key]:'PRIVATE'}}));}
 for(const checkpoint of [{...globalThis,modelOutput:'PRIVATE'},{contract:-1,prompt:1,schema:1,policy:1,pass1Revision:1,pass2Revision:1}])assert.throws(()=>events.validatePreparationRecord({...good,checkpoint}));
 assert.doesNotMatch(JSON.stringify(rows),/PRIVATE|sourceDigest|artifactDigest|modelOutput/);
});
test('lineage is snapshotted, journal copying cannot mutate history, retention unchanged',()=>{
 const lineage=context(),{r,rows}=recorder(lineage);const id=lineage.preparationId;lineage.preparationId=randomUUID();r.observe('pass1_accepted','passed');r.finish(200);assert.ok(rows.every(x=>x.lineage.preparationId===id));
 let now=0;const journal=new events.BetaJournal(()=>now);for(let i=0;i<1100;i++)journal.recordPreparation(rows[0]);assert.equal(journal.inspectPreparations().length,1000);
 const copy=journal.inspectPreparations();copy[0].lineage.preparationId='mutated';assert.equal(journal.inspectPreparations()[0].lineage.preparationId,id);
 now=1800000;assert.equal(journal.inspectPreparations().length,0);
});
test('logging failure cannot change protocol outcome',()=>{const {r}=recorder(context(),()=>{throw Error('PRIVATE logging error');});r.observe('pass1_accepted','passed');assert.equal(r.finish(200).disposition,'PASS1_READY');});
test('invalid lineage is never copied into receipts and getters are not invoked',()=>{
 let executed=false;const getter=Object.defineProperty(context(),'secret',{get(){executed=true;return 'PRIVATE';}});
 for(const lineage of [{...context(),text:'PRIVATE'},getter]){const {r,rows}=recorder(lineage);const receipt=r.finish(503);assert.equal(receipt.lineage,undefined);assert.doesNotMatch(JSON.stringify([rows,receipt]),/PRIVATE|secret/);}
 assert.equal(executed,false);
});
