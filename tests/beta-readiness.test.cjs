const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const createLoader = require("./load-typescript.cjs");
const { environment, deferred, flush } = require("./playback-fixtures.cjs");
const load = createLoader();
const { BetaJournal, betaJournal, betaContext, resetBetaDiagnostics, validateBetaEvent } = load("lib/beta-events.ts");
const { Preparation } = load("lib/preparation.ts");
const { ReadingPlaybackSession } = load("lib/reading-playback.ts");
const { generatedDocument } = load("lib/content-document.ts");
const doc = (type = "news", revision = 1) => ({ ...generatedDocument({title:"Fixture",text:"Bonjour le monde."}, type, "B1", "source-id"), revision });
const events = (name) => betaJournal.inspect().filter(e => e.name === name);

for (const field of ["importedText", "generatedPassage", "theatreDialogue", "conversationDialogue", "sentenceText", "word", "transcript", "audio", "recording", "prompt", "error", "ip"])
  test(`privacy boundary rejects ${field} without logging/storing its content`, () => {
    const journal = new BetaJournal(); journal.emit({name:"operation",operation:"reading",status:"started"});
    const valid = journal.inspect()[0];
    assert.throws(() => validateBetaEvent({...valid,[field]:"SENSITIVE"}));
    journal.emit({name:"operation",[field]:"SENSITIVE"});
    assert.equal(journal.inspect().length,1); assert.doesNotMatch(JSON.stringify(journal.aggregate()), /SENSITIVE/);
  });

test("privacy validation also rejects content smuggled into categories, IDs or numeric fields", () => {
  const journal = new BetaJournal();
  for (const bad of [{name:"SENSITIVE"},{name:"playback",documentId:"SENSITIVE"},{name:"playback",durationMs:"SENSITIVE"},{name:"playback",requests:-1},{name:"playback",code:{message:"SENSITIVE"}}]) journal.emit(bad);
  assert.equal(journal.inspect().length,0);
});

test("anonymous events have unique IDs, bounded retention and explicit reset/expiry", () => {
  let now=1; const journal=new BetaJournal(()=>now), session=journal.sessionId();
  for(let i=0;i<1010;i++) journal.emit({name:"playback",status:"started"});
  assert.equal(journal.inspect().length,1000);
  assert.equal(new Set(journal.inspect().map(e=>e.eventId)).size,1000);
  assert.ok(journal.inspect().every(e=>e.sessionId===session && e.eventId!==session));
  const copy=journal.inspect(); copy[0].name="bad"; assert.equal(journal.inspect()[0].name,"playback");
  now+=30*60_000; assert.notEqual(journal.sessionId(),session); assert.equal(journal.inspect().length,0);
  journal.emit({name:"playback"}); journal.reset(); assert.equal(journal.aggregate().events,0);
});

test("preparation is immediate, revision-scoped, measured and immune to stale completion", () => {
  let now=100; const journal=new BetaJournal(()=>now), p=new Preparation(journal,()=>now);
  const first=betaContext(doc()), second=betaContext(doc("poetry",2),"slow");
  assert.equal(first.documentId,second.documentId); assert.notEqual(first.documentId,"source-id");
  const a=p.begin("reading",first); assert.equal(p.getSnapshot().requestId,a);
  const b=p.begin("reading",second); p.finish(a,"completed"); assert.equal(p.getSnapshot().requestId,b);
  now=350; p.finish(b,"completed"); assert.equal(p.getSnapshot(),null);
  const completed=journal.inspect().filter(e=>e.status==="completed");
  assert.equal(completed.length,1); assert.equal(completed[0].durationMs,250);
  assert.equal(completed[0].revision,2); assert.equal(completed[0].contentType,"poetry");
  assert.equal(completed[0].level,"B1"); assert.equal(completed[0].speed,"slow");
  assert.equal(journal.aggregate().meanPreparationMs,250); assert.equal(journal.aggregate().medianPreparationMs,250);
  assert.equal(journal.aggregate().byMode.poetry["operation:reading:completed"],1);
  p.begin("vocabulary",first); p.cancel(); assert.equal(p.getSnapshot(),null);
  const failure=p.begin("reading",first); p.finish(failure,"failed","PROVIDER_FAILED"); assert.equal(p.getSnapshot(),null);
});

test("failed diagnostic storage cannot block preparation or provider work", async () => {
  const journal=new BetaJournal(); Object.freeze(journal.events);
  const p=new Preparation(journal), id=p.begin("reading"); p.finish(id,"completed"); assert.equal(p.getSnapshot(),null);
  resetBetaDiagnostics(); Object.freeze(betaJournal.events);
  try { assert.equal(await load("lib/beta-provider.ts").providerCall("tts",async()=>42,12),42); }
  finally { resetBetaDiagnostics(); }
});

test("provider counters measure SDK calls, supplied characters and only returned numeric usage", async () => {
  resetBetaDiagnostics(); const {providerCall}=load("lib/beta-provider.ts");
  await providerCall("generation",async()=>({output_text:"SENSITIVE",usage:{input_tokens:31,output_tokens:12}}));
  await providerCall("tts",async()=>({audio:"SENSITIVE"}),23);
  await assert.rejects(providerCall("tts",async()=>{throw new Error("SENSITIVE");},7));
  const summary=betaJournal.aggregate();
  assert.equal(summary.requests,3); assert.equal(summary.ttsCharacters,30); assert.equal(summary.inputTokens,31); assert.equal(summary.outputTokens,12);
  assert.equal(summary.responsesWithTokenUsage,1); assert.equal(summary.counts["code:PROVIDER_FAILED"],1);
  assert.doesNotMatch(JSON.stringify(betaJournal.inspect()),/SENSITIVE/);
});

test("server gate rejects concurrent duplicates, bounds all clients, and permits sequential requests", () => {
  const {RequestGate}=load("lib/beta-server.ts"); let now=60_000;
  const gate=new RequestGate(()=>now,4,2), id=crypto.randomUUID();
  const a=gate.acquire(id,"reading"); assert.ok(a); assert.equal(gate.acquire(id,"reading"),null);
  const b=gate.acquire(id,"vocabulary"); assert.ok(b); assert.equal(gate.acquire(null,"reading"),null);
  a(); a(); const c=gate.acquire(id,"reading"); assert.ok(c); c(); b();
  const d=gate.acquire("invalid identity","reading"); assert.ok(d); d();
  assert.equal(gate.acquire(crypto.randomUUID(),"reading"),null);
  now+=60_000; assert.ok(gate.acquire(id,"reading"));
  const perSession=new RequestGate(()=>now,120,8);
  for(let i=0;i<30;i++) perSession.acquire(id,"reading")();
  assert.equal(perSession.acquire(id,"reading"),null);
});

test("protected route has safe 429, streamed body caps, origin checks and finally releases failures", async () => {
  const local=createLoader(), {protectedRoute}=local("lib/beta-server.ts");
  const pending=deferred(); let calls=0;
  const post=protectedRoute("reading",async req=>{calls++; const body=await req.text(); if(body==="fail") throw Error("SENSITIVE"); if(body==="wait") await pending.promise; return Response.json({ok:true});});
  const id=crypto.randomUUID(), request=(body,extra={})=>new Request("http://localhost/api/read-passage",{method:"POST",headers:{"X-Beta-Session":id,...extra},body});
  const first=post(request("wait")); await flush();
  const duplicate=await post(request("wait")); assert.equal(duplicate.status,429); assert.equal(duplicate.headers.get("Retry-After"),"60");
  assert.match((await duplicate.json()).error,/Trop de demandes/); pending.resolve(); assert.equal((await first).status,200);
  assert.equal((await post(request("x".repeat(500001)))).status,413);
  assert.equal((await post(request("x",{"content-length":"500001"}))).status,413);
  assert.equal((await post(request("x",{origin:"https://other.invalid"}))).status,403);
  const failed=await post(request("fail")); assert.equal(failed.status,500); assert.doesNotMatch(await failed.text(),/SENSITIVE/);
  assert.equal((await post(request("ok"))).status,200); assert.equal(calls,3);
});

test("ordinary preparation guards double submissions; replacement cannot emit stale completion", async () => {
  resetBetaDiagnostics(); const pending=[deferred(),deferred()]; let calls=0; const env=environment();
  const session=new ReadingPlaybackSession(env,()=>pending[calls++].promise);
  const a=session.start(doc().text,"normal",doc()); assert.ok(session.getSnapshot().preparation);
  await session.start(doc().text,"normal",doc()); assert.equal(calls,1);
  session.invalidateDocument(); const b=session.start(doc().text,"slow",doc("news",2));
  pending[0].resolve(new Response("old")); await a; await flush(); assert.equal(session.getSnapshot().preparation.revision,2); assert.equal(env.audios.length,0);
  pending[1].resolve(new Response("new")); await b; await flush(); assert.equal(session.getSnapshot().preparation,null);
  assert.deepEqual(events("operation").map(e=>e.status),["started","cancelled","started","completed"]);
  env.latest().end(); assert.deepEqual(events("playback").map(e=>e.status),["cancelled","started","completed"]);
  session.dispose(); assert.equal(env.created.length,env.revoked.length);
});

test("reading failure clears preparation and never exposes response or thrown payloads", async () => {
  for(const failure of [async()=>new Response("SENSITIVE",{status:429}),async()=>{throw Error("SENSITIVE");}]) {
    resetBetaDiagnostics(); const s=new ReadingPlaybackSession(environment(),failure); await s.start(doc().text,"normal",doc());
    assert.equal(s.getSnapshot().preparation,null); assert.doesNotMatch(s.getSnapshot().error,/SENSITIVE/);
    assert.equal(events("operation").at(-1).status,"failed"); s.dispose();
  }
});

test("conversation pending transitions, starts/completion and invalid-response failure remain truthful", async () => {
  resetBetaDiagnostics(); const text="Marie : Bonjour.\nDavid : Salut.", identity={...doc("conversation"),text};
  const data=await load("lib/conversation-generation.ts").generateConversation(text,1,async()=>"YQ==");
  const env=environment(), pending=deferred(); env.nextPlay=pending.promise;
  const s=new ReadingPlaybackSession(env,async()=>Response.json(data)); await s.start(text,"normal",identity);
  assert.equal(s.getSnapshot().conversationPreparing,true); assert.equal(events("playback").length,0);
  pending.resolve(); await flush(); assert.equal(s.getSnapshot().conversationPreparing,false);
  env.latest().end(); assert.equal(s.getSnapshot().conversationPreparing,true); await flush(); env.latest().end();
  assert.deepEqual(events("playback").map(e=>e.status),["started","completed"]); assert.equal(events("playback").at(-1).logicalItems,2); s.dispose();
  resetBetaDiagnostics(); const bad=new ReadingPlaybackSession(environment(),async()=>Response.json({mode:"conversation",clips:[]}));
  await bad.start(text,"normal",identity); assert.equal(events("operation").filter(e=>e.status==="completed").length,0); bad.dispose();
});

test("vocabulary double-click coalesces, records counts without words and safely handles rate limiting", async () => {
  resetBetaDiagnostics(); const {VocabularySession}=load("lib/vocabulary-session.ts"), s=new VocabularySession(), p=deferred(); let calls=0;
  const fetcher=()=>{calls++;return p.promise;}; const a=s.analyze(doc(),"Bonjour",0,fetcher);
  assert.ok(s.preparation.getSnapshot()); assert.equal(await s.analyze(doc(),"Bonjour",0,fetcher),null); assert.equal(calls,1);
  p.resolve(Response.json({word:"Bonjour",usage:"SENSITIVE"})); assert.ok(await a); assert.equal(s.preparation.getSnapshot(),null);
  const limited=await s.analyze(doc(),"Bonjour",0,async()=>new Response("SENSITIVE",{status:429})); assert.match(limited.usage,/Trop de demandes/);
  assert.equal(events("operation").filter(e=>e.status==="completed").length,1);
  assert.equal(events("operation").at(-1).code,"RATE_LIMITED"); assert.doesNotMatch(JSON.stringify(betaJournal.inspect()),/Bonjour|SENSITIVE/);
});

test("Virelangues per-sentence listen remains pending and coalesces until audio arrives", async () => {
  resetBetaDiagnostics(); const exercise=doc("tongue-twisters"), p=deferred(); let calls=0;
  const reading=new ReadingPlaybackSession(environment(),()=>{calls++;return p.promise;});
  const practice=new (load("lib/exercise-practice.ts").ExercisePracticeSession)(reading,{isBusy:()=>false,reset(){},start(){}});
  const id=exercise.tongueTwisters.exercises[0].id, listening=practice.listen(exercise,id,"slow");
  assert.ok(reading.getSnapshot().preparation); await practice.listen(exercise,id,"slow"); assert.equal(calls,1);
  p.resolve(new Response("audio")); await listening; practice.record();
  assert.equal(events("virelangue_listen").length,1); assert.equal(events("virelangue_listen")[0].speed,"slow");
  assert.equal(events("virelangue_practice").length,1); reading.dispose();
});

test("green feedback has accessible indeterminate state and diagnostics render only in development", () => {
  const Notice=load("components/article-reader/PreparationNotice.tsx").default;
  const html=renderToStaticMarkup(React.createElement(Notice,{label:"Préparation de la lecture…"}));
  assert.match(html,/emerald/); assert.match(html,/role="status"/); assert.doesNotMatch(html,/%|aria-valuenow|<progress/);
  assert.equal(renderToStaticMarkup(React.createElement(Notice,{label:null})),"");
  const Diagnostics=load("components/BetaDiagnostics.tsx").default, before=process.env.NODE_ENV;
  try { process.env.NODE_ENV="production"; assert.equal(renderToStaticMarkup(React.createElement(Diagnostics)),"");
    process.env.NODE_ENV="development"; assert.match(renderToStaticMarkup(React.createElement(Diagnostics)),/Diagnostics locaux/);
  } finally { if(before===undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV=before; }
});
