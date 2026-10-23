const test = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const fs = require('node:fs');
const createLoader = require('./load-typescript.cjs');
const {analysisFor,planFor} = require('./director-fixtures.cjs');
const {environment} = require('./playback-fixtures.cjs');
const terminal = r => ['failed','cancelled','succeeded','clarification'].includes(r.outcome);
const CONFIG = createLoader()('lib/beta-events.ts').PREPARATION_CONFIGURATION;
const source = 'ALICE: Bob, nous sommes prêts.\nBOB: Alice, entrons.';
// All transports are mocks. This file never imports the real provider SDK.
function harness(change = x => x, script = source) {
  let calls = 0;
  class OpenAI { constructor() { this.responses = {create: async body => {
    calls++;
    const {items} = JSON.parse(body.input[1].content);
    const raw = {...analysisFor(items), director:planFor(items), pronunciation:{version:1,context:{productionLanguage:'fr',inventoryComplete:true},entries:items.map((item,index) => ({
      id:`name-${index}`,name:item.speaker,aliases:[],classification:'french-convention',language:'fr',target:'French convention',
      evidence:[{itemId:item.id,quote:item.text}],resolution:{status:'established',basis:'convention',localLanguage:'fr',rationale:'Established dialogue context'}
    }))}};
    const result = await change(raw);
    return result?.transport ?? {status:'completed',output_text:JSON.stringify(result)};
  }}; this.audio = {speech:{create:()=>{throw Error('TTS prohibited');}}}; } }
  process.env.OPENAI_API_KEY = 'mock-recorder-test';
  const load = createLoader({openai:OpenAI});
  const route = load('app/api/read-passage/route.ts').POST;
  const journal = load('lib/beta-events.ts').betaJournal;
  const body = {text:script,contentType:'theatre',documentId:'fixture',revision:1};
  const request = (id=randomUUID(), extra={},signal) => route(new Request('http://localhost/api/read-passage', {
    method:'POST',headers:{'X-Theatre-Request-Id':id,'X-Theatre-Preparation':'1'},body:JSON.stringify({...body,...extra}),signal
  }));
  return {load,route,journal,request,body,calls:()=>calls};
}
async function logged(fn) {
  const records=[], old=console.info;
  console.info=(label,line)=>{if(label==='beta_theatre_preparation') records.push(JSON.parse(line));};
  try { return await fn(records); } finally {console.info=old;}
}
const failures = [
  ['provider failure','provider','provider_failure',()=>{throw Error('PRIVATE provider content');}],
  ['provider timeout','provider','timeout',()=>{const e=Error('PRIVATE');e.name='APIConnectionTimeoutError';throw e;}],
  ['incomplete response','structured_response','incomplete_response',()=>({transport:{status:'incomplete'}})],
  ['invalid JSON','structured_response','parse_rejected',()=>({transport:{status:'completed',output_text:'PRIVATE invalid JSON'}})],
  ['missing structured response','structured_response','structured_response_missing',()=>({transport:{status:'completed'}})],
  ['invalid dramatic schema','dramatic_validation','invalid_dramatic_analysis',r=>({...r,items:[]})],
  ['missing pronunciation','pronunciation_validation','output_missing',r=>{delete r.pronunciation;return r;}],
  ['invalid lexical schema','pronunciation_validation','validation_rejected',r=>{r.pronunciation.entries[0].id='invalid id';return r;}],
  ['evidence mismatch','occurrence_evidence','evidence_mismatch',r=>{r.pronunciation.entries[0].evidence[0].quote='PRIVATE unauthored';return r;}],
  ['explicit incomplete inventory','inventory','inventory_incomplete',r=>{r.pronunciation.context.inventoryComplete=false;return r;}],
  ['missing cast coverage','inventory','missing_cast_coverage',r=>{r.pronunciation.entries=[];return r;}],
  ['invalid established decision','authority','invalid_established_decision',r=>{r.pronunciation.entries[0].resolution.localLanguage='en';return r;}],
  ['unbound occurrence','occurrence_evidence','unbound_occurrence',r=>{r.pronunciation.entries.push({...r.pronunciation.entries[0],id:'unbound',name:'Absent',aliases:[]});return r;}],
];
for (const [label,stage,reason,change] of failures) test(`${label}: exact content-free boundary survives discarded browser response`,()=>logged(async records=>{
  const h=harness(change),id=randomUUID(),response=await h.request(id);
  assert.equal(response.status,503);
  const receipt=JSON.parse(response.headers.get('X-Theatre-Preparation-Receipt'));
  assert.equal(response.headers.get('X-Theatre-Request-Id'),id);
  const problem=await response.json();
  assert.equal(problem.code,'THEATRE_ANALYSIS_FAILED');assert.equal(problem.mode,undefined);assert.equal(problem.entries,undefined);
  // A log export alone suffices; neither response nor journal is required below.
  const retained=JSON.parse(JSON.stringify(records));h.journal.reset();
  const ends=retained.filter(terminal);assert.equal(ends.length,1);
  assert.deepEqual(ends[0],receipt);
  assert.equal(receipt.requestId,id);assert.equal(receipt.stage,stage);assert.equal(receipt.reason,reason);
  assert.equal(receipt.retryable,true);assert.equal(receipt.outcome,'failed');
  assert.equal(retained.find(r=>r.outcome==='rejected').reason,reason);
  assert.equal(receipt.disposition,'TECHNICAL_HOLD');
  assert.equal(h.calls(),1);
  assert.doesNotMatch(JSON.stringify(retained),/PRIVATE|ALICE|BOB|Bonjour|French convention|mock-recorder|sceneToken|pronunciationToken|output_text/);
}));

test('success and genuine ambiguity have distinct terminal receipts; owner confirmation succeeds',()=>logged(async records=>{
  const success=harness(),response=await success.request();assert.equal(response.status,200);
  assert.equal((await response.json()).protocol,'incremental-v1');
  assert.equal(records.filter(terminal).at(-1).outcome,'succeeded');
  const ambiguous=harness(r=>{r.pronunciation.entries[0].resolution.status='unknown';return r;});
  const held=await ambiguous.request(),data=await held.json();assert.equal(data.mode,'pronunciation-clarification');
  const receipt=JSON.parse(held.headers.get('X-Theatre-Preparation-Receipt'));
  assert.equal(receipt.outcome,'clarification');assert.equal(receipt.reason,'linguistic_ambiguity');assert.equal(receipt.retryable,false);
  assert.equal(data.entries.length,1);
  const approved=await ambiguous.request(randomUUID(),{pronunciationToken:data.pronunciationToken,
    pronunciationAnswer:require('./pronunciation-review-fixture.cjs').answer(data.entries)});
  assert.equal(approved.status,200);assert.equal((await approved.json()).protocol,'incremental-v1');
  assert.equal(records.filter(terminal).at(-1).outcome,'succeeded');
}));

test('client, response, immediate server log and retained failure receipt share one request ID',()=>logged(async records=>{
  const h=harness(r=>{delete r.pronunciation;return r;}),env=environment();let sentId;
  const session=new (h.load('lib/reading-playback.ts').ReadingPlaybackSession)(env,(url,options)=>{
    sentId=options.headers['X-Theatre-Request-Id'];return h.route(new Request('http://localhost'+url,options));
  });
  await session.start(source,'normal',{documentId:'fixture',revision:1,contentType:'theatre',language:'fr'});
  const receipt=session.getTheatrePreparationReceipt();assert.equal(receipt.requestId,sentId);
  assert.deepEqual(receipt,records.filter(terminal)[0]);assert.equal(session.getSnapshot().clarification,null);
  assert.equal(session.getSnapshot().busy,false);assert.equal(env.audios.length,0);
  session.stop();assert.deepEqual(session.getTheatrePreparationReceipt(),receipt);
  receipt.reason='mutated';assert.equal(session.getTheatrePreparationReceipt().reason,'output_missing');session.dispose();
}));

test('client rejects receipt with wrong correlation or extra sensitive fields',async()=>{
  const h=harness(),env=environment(),Session=h.load('lib/reading-playback.ts').ReadingPlaybackSession;
  for(const wrong of ['id','field']) {
    const session=new Session(env,async(url,options)=>Response.json({code:'THEATRE_ANALYSIS_FAILED'},{status:503,headers:{
      'X-Theatre-Preparation-Receipt':JSON.stringify({...CONFIG,elapsedMs:0,totalElapsedMs:0,disposition:'TECHNICAL_HOLD',timestamp:1,build:'unknown',requestId:wrong==='id'?randomUUID():options.headers['X-Theatre-Request-Id'],
        stage:'provider',outcome:'failed',reason:'provider_failure',retryable:true,...(wrong==='field'?{prompt:'PRIVATE'}:{})})
    }}));
    await session.start(source,'normal',{documentId:'fixture',revision:1,contentType:'theatre',language:'fr'});
    assert.equal(session.getTheatrePreparationReceipt(),null);session.dispose();
  }
});

test('concurrent preparations completing in reverse order cannot cross-correlate',()=>logged(async records=>{
  const releases=[];const h=harness(r=>new Promise(resolve=>releases.push(()=>resolve(r))));
  const ids=[randomUUID(),randomUUID()], pending=ids.map(id=>h.request(id));
  while(releases.length<2) await new Promise(resolve=>setImmediate(resolve));
  releases[1]();const second=await pending[1];releases[0]();const first=await pending[0];
  for(const [i,response] of [first,second].entries()) {
    const receipt=JSON.parse(response.headers.get('X-Theatre-Preparation-Receipt'));
    assert.equal(receipt.requestId,ids[i]);assert.deepEqual(records.filter(r=>terminal(r)&&r.requestId===ids[i]),[receipt]);
  }
}));

test('terminal records bypass aggregate throttle; exactly one despite duplicate finish/late stages',()=>logged(async records=>{
  const load=createLoader(),{protectedRoute}=load('lib/beta-server.ts');
  const old=process.env.NODE_ENV;process.env.NODE_ENV='production';
  try {
    const route=protectedRoute('reading',async(req,d)=>{d.observe('provider','started');return Response.json({ok:true});},{theatrePreparation:true});
    for(let i=0;i<3;i++) await route(new Request('http://localhost/api/read-passage',{method:'POST',body:'{}',headers:{'X-Theatre-Preparation':'1'}}));
    assert.equal(records.filter(terminal).length,3);
    const Recorder=load('lib/beta-server.ts').TheatrePreparationRecorder,d=new Recorder(randomUUID());d.activate();
    d.finish(503);d.finish(200);d.observe('provider','passed');
    assert.equal(records.filter(r=>r.requestId===d.requestId&&terminal(r)).length,1);
  } finally { if(old===undefined) delete process.env.NODE_ENV;else process.env.NODE_ENV=old; }
}));

for(const kind of ['cancelled','timeout']) test(`${kind}: no contradictory terminal outcome after late handler completion`,()=>logged(async records=>{
  const load=createLoader(),{protectedRoute}=load('lib/beta-server.ts'),abort=new AbortController();let release,started;
  const ready=new Promise(resolve=>started=resolve);
  const route=protectedRoute('reading',async(req,d)=>{d.observe('provider','started');started();await new Promise(resolve=>release=resolve);d.observe('provider','passed');return Response.json({ok:true});},
    {theatrePreparation:true,...(kind==='timeout'?{deadlineMs:10}:{})});
  const pending=route(new Request('http://localhost/api/read-passage',{method:'POST',body:'{}',signal:abort.signal,headers:{'X-Theatre-Preparation':'1'}}));
  await ready;if(kind==='cancelled') abort.abort();
  const response=await pending;assert.equal(response.status,408);release();await new Promise(resolve=>setImmediate(resolve));
  const ends=records.filter(terminal);assert.equal(ends.length,1);assert.equal(ends[0].reason,kind);
  assert.equal(ends[0].outcome,kind==='timeout'?'failed':'cancelled');assert.equal(ends[0].stage,'provider');
  assert.deepEqual(JSON.parse(response.headers.get('X-Theatre-Preparation-Receipt')),ends[0]);
}));

test('actual Director deadline records timeout, not cancellation from internal abort',()=>logged(async records=>{
  const load=createLoader(),d=new (load('lib/beta-server.ts').TheatrePreparationRecorder)(randomUUID());d.activate();
  const items=load('lib/theatre.ts').parseTheatreItems(source);
  const result=await load('lib/theatre-direction.ts').prepareDramaticDirection(items,()=>new Promise(()=>{}),5,undefined,undefined,d.observe);
  assert.equal(result.metadata.fallbackReason,'timeout');d.finish(503);
  assert.equal(records.filter(terminal)[0].reason,'timeout');
}));

test('closed schema rejects unknown/free-form/sensitive fields and bounds size',()=>{
  const {validatePreparationRecord:validate}=createLoader()('lib/beta-events.ts');
  const good={...CONFIG,elapsedMs:0,totalElapsedMs:0,disposition:'TECHNICAL_HOLD',timestamp:1,build:'a'.repeat(40),requestId:randomUUID(),stage:'provider',outcome:'failed',reason:'provider_failure',retryable:true};
  validate(good);assert.ok(JSON.stringify(good).length<=1024);
  for(const field of ['text','name','target','decision','prompt','contentHash','token','error','body','attachment','output_text']) assert.throws(()=>validate({...good,[field]:'PRIVATE'}));
  for(const field of ['stage','outcome','reason','build','requestId','timestamp','retryable']) assert.throws(()=>validate({...good,[field]:'PRIVATE'}));
  for(const field of ['build','requestId']) for(const bad of [good[field]+'\n','\n'+good[field],good[field]+'\r','\t'+good[field],good[field]+'\0',good[field]+'x',good[field].slice(1),'z'.repeat(good[field].length)]) assert.throws(()=>validate({...good,[field]:bad}));
  for(const field of Object.keys(good)) {const missing={...good};delete missing[field];assert.throws(()=>validate(missing));}
});

test('journal and request budgets are bounded; server build is validated and IDs are opaque',()=>{
  const load=createLoader(),{TheatrePreparationRecorder:Recorder}=load('lib/beta-server.ts'),{BetaJournal}=load('lib/beta-events.ts');
  const old=process.env.VERCEL_GIT_COMMIT_SHA;process.env.VERCEL_GIT_COMMIT_SHA='not safe build';
  try {
    const logs=[],d=new Recorder('PRIVATE invalid id',r=>logs.push(r));d.activate();
    for(let i=0;i<10000;i++) d.observe('provider','started');
    d.observe('provider','rejected','provider_failure');const end=d.finish(503);
    assert.equal(logs.length,63);d.observe('provider','passed');assert.equal(logs.length,64);assert.equal(logs.filter(terminal).length,1);assert.equal(end.build,'unknown');assert.equal(end.reason,'provider_failure');
    assert.match(end.requestId,/^[0-9a-f-]{36}$/);assert.ok(logs.every(r=>JSON.stringify(r).length<=1024));
    let now=0;const journal=new BetaJournal(()=>now);
    for(let i=0;i<1200;i++) journal.recordPreparation({...end,timestamp:i});
    assert.equal(journal.inspectPreparations().length,1000);now=30*60_000;assert.equal(journal.inspectPreparations().length,0);
    process.env.VERCEL_GIT_COMMIT_SHA='b'.repeat(40);const trusted=new Recorder(randomUUID(),()=>{});trusted.activate();assert.equal(trusted.finish(200).build,'b'.repeat(40));
  } finally {if(old===undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;else process.env.VERCEL_GIT_COMMIT_SHA=old;}
});

test('logging and observer exceptions cannot break successful preparation',async()=>{
  const h=harness(),old=console.info;console.info=()=>{throw Error('sink unavailable');};
  try { const response=await h.request();assert.equal(response.status,200);assert.equal((await response.json()).protocol,'incremental-v1'); }
  finally {console.info=old;}
  const items=h.load('lib/theatre.ts').parseTheatreItems(source);
  const result=await h.load('lib/theatre-direction.ts').prepareDramaticDirection(items,async()=>analysisFor(items),100,undefined,undefined,()=>{throw Error('sink');});
  assert.equal(result.metadata.status,'analyzed');
});

test('UI receipt is available without debug query flag or prepared clips; existing clipboard exporter remains',()=>{
  const text=fs.readFileSync('components/article-reader/TheatreDebugPanel.tsx','utf8');
  assert.match(text,/if\(!enabled && !receipt && !unconfirmed\) return null/);
  assert.match(text,/getTheatrePreparationReceipt/);assert.match(text,/show\(receipt\)/);assert.match(text,/navigator.clipboard.writeText\(output\)/);
  const page=fs.readFileSync('app/page.tsx','utf8');assert.match(page,/article.contentType === "theatre" && <TheatreDebugPanel/);
});

test('normal-mode failure panel renders and copies only the safe receipt without a queue',async()=>{
  const React=require('react'),values=[false,'','',0,0];let cursor=0,copied;
  const load=createLoader({react:{...React,useEffect:()=>{},useState:()=>{const i=cursor++;return [values[i],v=>{values[i]=v;}];}}});
  const Panel=load('components/article-reader/TheatreDebugPanel.tsx').default;
  const receipt={timestamp:1,build:'unknown',requestId:randomUUID(),stage:'inventory',outcome:'failed',reason:'inventory_incomplete',retryable:true};
  const playback={getTheatrePreparationReceipt:()=>receipt,getUnconfirmedTheatrePreparation:()=>null,theatre:{getSnapshot:()=>({queue:[]})}};
  function elements(node){if(!node||typeof node!=='object')return [];return [node,...React.Children.toArray(node.props?.children).flatMap(elements)];}
  function render(){cursor=0;return elements(Panel({playback,sessionId:0}));}
  function button(label){const found=render().find(e=>e.type==='button'&&e.props.children===label);assert.ok(found);return found;}
  button('Afficher le reçu de préparation (sans contenu)').props.onClick();assert.deepEqual(JSON.parse(values[1]),receipt);
  assert.equal(render().some(e=>e.type==='select'),false);
  const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async text=>{copied=text;}}}});
  try {await button('Copier le JSON affiché').props.onClick();assert.deepEqual(JSON.parse(copied),receipt);}
  finally {if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
});

test('ordinary reading receives no Theatre diagnostic record or receipt',()=>logged(async records=>{
  const load=createLoader(),{protectedRoute}=load('lib/beta-server.ts');
  const route=protectedRoute('reading',async()=>new Response('ordinary'),{theatrePreparation:true});
  const response=await route(new Request('http://localhost/api/read-passage',{method:'POST',body:'{}'}));
  assert.equal(await response.text(),'ordinary');assert.equal(response.headers.get('X-Theatre-Preparation-Receipt'),null);assert.equal(records.length,0);
}));

test('lost HTTP response retains only local correlation; server logs recover the actual cause',()=>logged(async records=>{
  const h=harness(r=>{delete r.pronunciation;return r;}),env=environment();
  const session=new (h.load('lib/reading-playback.ts').ReadingPlaybackSession)(env,async(url,opts)=>{
    await h.route(new Request('http://localhost'+url,opts));throw new TypeError('Network closed');
  });
  await session.start(source,'normal',{documentId:'fixture',revision:1,contentType:'theatre',language:'fr'});
  assert.equal(session.getTheatrePreparationReceipt(),null);
  const reference=session.getUnconfirmedTheatrePreparation();assert.deepEqual(Object.keys(reference),['requestId']);
  const saved=records.find(r=>terminal(r)&&r.requestId===reference.requestId);assert.equal(saved.reason,'output_missing');
  session.stop();assert.deepEqual(session.getUnconfirmedTheatrePreparation(),reference);session.dispose();
}));

test('already-aborted request has one cancellation record and never starts handler',()=>logged(async records=>{
  const load=createLoader(),abort=new AbortController();abort.abort();let calls=0;
  const route=load('lib/beta-server.ts').protectedRoute('reading',async()=>{calls++;return new Response();},{theatrePreparation:true});
  const response=await route(new Request('http://localhost/api/read-passage',{method:'POST',body:'{}',signal:abort.signal,headers:{'X-Theatre-Preparation':'1'}}));
  assert.equal(response.status,408);assert.equal(calls,0);assert.equal(records.filter(terminal).length,1);assert.equal(records.at(-1).reason,'cancelled');
}));

test('invalid request and rate rejection finish at request boundary without provider calls',()=>logged(async records=>{
  const load=createLoader(),{protectedRoute,RequestGate}=load('lib/beta-server.ts');let calls=0;
  for(const [status,options,headers] of [[429,{gate:new RequestGate(Date.now,0)},{}],[403,{}, {origin:'http://other.invalid'}],[413,{}, {'content-length':'500001'}]]) {
    const route=protectedRoute('reading',async()=>{calls++;return new Response();},{theatrePreparation:true,...options});
    const response=await route(new Request('http://localhost/api/read-passage',{method:'POST',body:'{}',headers:{'X-Theatre-Preparation':'1',...headers}}));
    assert.equal(response.status,status);const receipt=JSON.parse(response.headers.get('X-Theatre-Preparation-Receipt'));
    assert.equal(receipt.stage,'request');assert.equal(receipt.reason,status===429?'rate_limited':'invalid_request');
  }
  assert.equal(calls,0);assert.equal(records.filter(terminal).length,3);
}));

test('no diagnostic hint still identifies explicit Theatre; forged build/stage/reason headers are ignored',()=>logged(async records=>{
  const h=harness(r=>{delete r.pronunciation;return r;});
  const response=await h.route(new Request('http://localhost/api/read-passage',{method:'POST',body:JSON.stringify(h.body),headers:{
    'X-Theatre-Request-Id':'invalid','X-Theatre-Build':'PRIVATE','X-Theatre-Stage':'PRIVATE','X-Theatre-Reason':'PRIVATE'
  }}));
  const receipt=JSON.parse(response.headers.get('X-Theatre-Preparation-Receipt'));
  assert.equal(receipt.reason,'output_missing');assert.notEqual(receipt.requestId,'invalid');assert.doesNotMatch(JSON.stringify(records),/PRIVATE/);
}));

test('budget/unavailable fallbacks are not misrepresented as provider invocations',()=>logged(async records=>{
  const load=createLoader(),{prepareDramaticDirection}=load('lib/theatre-direction.ts'),items=load('lib/theatre.ts').parseTheatreItems(source);
  for(const [expected,input,analyzer] of [['analysis_unavailable',items,undefined],['empty_scene',[],async()=>{}],['input_budget',[{...items[0],text:'x'.repeat(130000)}],async()=>{throw Error('Must not call');}]]) {
    const d=new (load('lib/beta-server.ts').TheatrePreparationRecorder)(randomUUID());d.activate();
    await prepareDramaticDirection(input,analyzer,20,undefined,undefined,d.observe);d.finish(503);
    const mine=records.filter(r=>r.requestId===d.requestId);assert.equal(mine.at(-1).reason,expected);
    assert.equal(mine.some(r=>r.stage==='provider'&&r.outcome==='started'),false);
  }
}));

test('authority construction rejection is distinguishable without exposing thrown content',()=>logged(async records=>{
  const base=createLoader(),pronunciation=base('lib/theatre-pronunciation.ts');let occurrences=0;
  const load=createLoader({'./theatre-pronunciation':{...pronunciation,pronunciationOccurrences(...args){if(++occurrences===2) throw Error('PRIVATE');return pronunciation.pronunciationOccurrences(...args);}}});
  const items=base('lib/theatre.ts').parseTheatreItems(source);
  const entries=items.map((item,index)=>({id:`name-${index}`,name:item.speaker,aliases:[],classification:'french-convention',language:'fr',target:'French convention',
    evidence:[{itemId:item.id,quote:item.text}],resolution:{status:'established',basis:'convention',localLanguage:'fr',rationale:'Context'}}));
  const plan={items,analysis:{pronunciation:{version:1,context:{productionLanguage:'fr',inventoryComplete:true},entries}},direction:{fallbackReason:null}};
  const d=new (load('lib/beta-server.ts').TheatrePreparationRecorder)(randomUUID());d.activate();
  assert.throws(()=>load('lib/theatre-pronunciation-authority.ts').draftPronunciation(plan,'unused',d.observe));d.finish(503);
  assert.equal(records.at(-1).stage,'authority');assert.equal(records.at(-1).reason,'authority_rejected');assert.doesNotMatch(JSON.stringify(records),/PRIVATE/);
}));

test('successful Director trace reconstructs accepted stages, configuration, counts and READY',()=>logged(async records=>{
  const h=harness(),response=await h.request(),receipt=JSON.parse(response.headers.get('X-Theatre-Preparation-Receipt'));
  assert.equal(response.status,200);assert.equal(receipt.disposition,'READY');
  for(const stage of ['director','provider','structured_response','dramatic_validation','director_validation','pronunciation_validation','inventory','occurrence_evidence','authority']) {
    assert.ok(records.some(r=>r.stage===stage&&r.outcome==='started'),stage+' start');
    assert.ok(records.some(r=>r.stage===stage&&r.outcome==='passed'),stage+' completion');
  }
  assert.ok(records.some(r=>r.stage==='structured_response'&&r.outcome==='present'));
  assert.deepEqual(receipt.counts,{established:2,ambiguous:0,conflicting:0,unknown:0,rejected:0,accepted:2,unbound:0});
  assert.equal(receipt.authorityRevision,1);
  for(const record of records) for(const [field,value] of Object.entries(CONFIG)) assert.equal(record[field],value);
  assert.equal(CONFIG.model,h.load('lib/theatre-direction.ts').DRAMATIC_ANALYSIS_MODEL);
  assert.equal(CONFIG.pronunciationSchemaVersion,h.load('lib/theatre-pronunciation.ts').PRONUNCIATION_VERSION);
  assert.deepEqual(h.load('lib/theatre-director.ts').DIRECTOR_SCHEMA.properties.version.enum,[CONFIG.directorSchemaVersion]);
  assert.equal(records.filter(terminal).length,1);
  const data=await response.json();const authority=h.load('lib/theatre-scene-ticket.ts').openScene(data.sceneToken,'mock-recorder-test').plan.pronunciation;
  assert.equal(authority.policyVersion,CONFIG.pronunciationPolicyVersion);assert.equal(h.calls(),1);
}));

test('established French-context Thomas reaches READY without a form and without content in logs',()=>logged(async records=>{
  const h=harness(x=>x,'ALICE: Thomas, nous sommes prêts.\nTHOMAS: Alice, entrons.');
  const response=await h.request(),data=await response.json();assert.equal(data.protocol,'incremental-v1');assert.equal(data.entries,undefined);
  assert.equal(records.filter(terminal)[0].disposition,'READY');assert.equal(records.at(-1).counts.accepted,2);
  assert.doesNotMatch(JSON.stringify(records),/Thomas|THOMAS|ALICE|Alice|entrons|French convention/);
}));

for(const status of ['ambiguous','conflicting','unknown']) test(`${status} proposal is counted; clarification includes only the unresolved item`,()=>logged(async records=>{
  const h=harness(r=>{r.pronunciation.entries[0].resolution.status=status;return r;});
  const response=await h.request(),body=await response.json();assert.equal(body.mode,'pronunciation-clarification');assert.equal(body.entries.length,1);
  const end=records.filter(terminal)[0];assert.equal(end.disposition,'CLARIFICATION_REQUIRED');assert.equal(end.counts[status],1);
  assert.equal(end.counts.established,1);assert.equal(end.counts.accepted,1);assert.equal(end.reason,'linguistic_ambiguity');
}));

test('missing/invalid optional Director plan is observable fallback, not a new blocking policy',()=>logged(async records=>{
  for(const invalid of [false,true]) {
    const h=harness(r=>{if(invalid)r.director={};else delete r.director;return r;});
    const response=await h.request();assert.equal(response.status,200);const receipt=JSON.parse(response.headers.get('X-Theatre-Preparation-Receipt'));
    assert.equal(receipt.disposition,'READY');
    assert.ok(records.some(r=>r.requestId===receipt.requestId&&r.stage==='director_validation'&&r.reason===(invalid?'director_plan_rejected':'director_plan_missing')&&r.outcome===(invalid?'fallback':'absent')));
  }
}));

test('absent dramatic analysis is visible and remains a technical hold',()=>logged(async records=>{
  const h=harness(r=>{delete r.scene;return r;});const response=await h.request();assert.equal(response.status,503);
  assert.ok(records.some(r=>r.stage==='dramatic_validation'&&r.outcome==='absent'));
  assert.equal(records.at(-1).disposition,'TECHNICAL_HOLD');assert.equal(records.at(-1).reason,'invalid_dramatic_analysis');
}));

test('actual provider result arriving after cancellation is ignored with one terminal record',()=>logged(async records=>{
  let release,started;const ready=new Promise(resolve=>started=resolve),abort=new AbortController();
  const h=harness(r=>{started();return new Promise(resolve=>release=()=>resolve(r));});
  const id=randomUUID(),pending=h.request(id,{},abort.signal);await ready;abort.abort();const response=await pending;
  assert.equal(response.status,408);release();await new Promise(resolve=>setTimeout(resolve,20));
  const mine=records.filter(r=>r.requestId===id),end=mine.filter(terminal);assert.equal(end.length,1);assert.equal(end[0].disposition,'CANCELLED');
  const ignored=mine.filter(r=>r.outcome==='ignored');assert.equal(ignored.length,1);assert.equal(ignored[0].reason,'late_result_ignored');
  assert.equal(mine.some(r=>r.outcome==='succeeded'),false);assert.equal(h.calls(),1);
}));

test('cache and sealed accepted-plan reuse are visible without another Director invocation',()=>logged(async records=>{
  const h=harness(),first=await h.request(),data=await first.json();
  for(const extra of [{analysisCacheKey:data.analysisCacheKey},{pronunciationToken:data.sceneToken}]) {
    const id=randomUUID(),response=await h.request(id,extra);assert.equal(response.status,200);
    const mine=records.filter(r=>r.requestId===id);assert.ok(mine.some(r=>r.stage==='director'&&r.outcome==='reused'));
    assert.equal(mine.some(r=>r.stage==='provider'&&r.outcome==='started'),false);assert.equal(mine.filter(terminal)[0].disposition,'READY');
  }
  assert.equal(h.calls(),1);
}));

test('bounded timings measure provider/validation/authority and total duration',()=>{
  const load=createLoader(),logs=[];let clock=1000;
  const d=new (load('lib/beta-server.ts').TheatrePreparationRecorder)(randomUUID(),r=>logs.push(r),()=>clock);d.activate();
  d.observe('director','started');d.observe('provider','started');clock+=125;d.observe('provider','passed');
  d.observe('structured_response','started');clock+=7;d.observe('structured_response','passed');d.observe('director','passed');
  d.observe('authority','started');clock+=11;d.observe('authority','passed');const end=d.finish(200);
  assert.equal(logs.find(r=>r.stage==='provider'&&r.outcome==='passed').elapsedMs,125);
  assert.equal(logs.find(r=>r.stage==='structured_response'&&r.outcome==='passed').elapsedMs,7);
  assert.equal(logs.find(r=>r.stage==='authority'&&r.outcome==='passed').elapsedMs,11);
  assert.equal(end.totalElapsedMs,143);
  const other=new (load('lib/beta-server.ts').TheatrePreparationRecorder)(randomUUID(),()=>{},()=>clock);other.activate();clock+=9_000_000;assert.equal(other.finish(503).totalElapsedMs,3_600_000);
});

test('counts/configuration/timing/disposition cannot accept content or inconsistent terminal states',()=>{
  const load=createLoader(),{validatePreparationRecord:validate}=load('lib/beta-events.ts');
  const good={...CONFIG,timestamp:1,build:'unknown',requestId:randomUUID(),stage:'response',outcome:'succeeded',reason:'none',retryable:false,elapsedMs:0,totalElapsedMs:0,disposition:'READY'};
  validate({...good,counts:{established:2,accepted:2},authorityRevision:1});
  for(const counts of [{name:'PRIVATE'},{aliases:[]},{established:'PRIVATE'},{unknown:-1},{accepted:100001},[],new Date(),Object.defineProperty({},'toJSON',{value:()=> 'PRIVATE'})]) assert.throws(()=>validate({...good,counts}));
  for(const extra of [{model:'PRIVATE'},{provider:'PRIVATE'},{disposition:'TECHNICAL_HOLD'},{elapsedMs:Infinity},{totalElapsedMs:3600001},{authorityRevision:10001}]) assert.throws(()=>validate({...good,...extra}));
  const logs=[],d=new (load('lib/beta-server.ts').TheatrePreparationRecorder)(randomUUID(),r=>logs.push(r));d.activate();
  d.observe('authority','passed','none',{prompt:'PRIVATE'});d.observe('authority','passed','none',{build:'a'.repeat(40)});d.observe('authority','passed','none',{counts:{name:'PRIVATE'}});
  assert.equal(logs.length,1);d.finish(200);assert.doesNotMatch(JSON.stringify(logs),/PRIVATE/);
});

test('successful client receipt is retained, correlated and cannot mutate stored counts',()=>logged(async records=>{
  const h=harness(),env=environment();const session=new (h.load('lib/reading-playback.ts').ReadingPlaybackSession)(env,(url,opts)=>h.route(new Request('http://localhost'+url,opts)));
  await session.start(source,'normal',{documentId:'fixture',revision:1,contentType:'theatre',language:'fr'},undefined,'ALICE');
  const receipt=session.getTheatrePreparationSuccess();assert.equal(receipt.disposition,'READY');assert.deepEqual(receipt,records.filter(terminal)[0]);
  receipt.counts.accepted=99;assert.equal(session.getTheatrePreparationSuccess().counts.accepted,2);assert.equal(session.getTheatrePreparationReceipt(),null);session.dispose();
}));
