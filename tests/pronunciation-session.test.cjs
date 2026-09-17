const test = require("node:test");
const assert = require("node:assert/strict");
const createLoader = require("./load-typescript.cjs");
const { load, setup, deferred, flush } = require("./playback-fixtures.cjs");
const { PronunciationSession } = load("lib/pronunciation-session.ts");
const { betaJournal, resetBetaDiagnostics } = load("lib/beta-events.ts");

const feedback = {
  score: { overall: 80, pronunciation: 81, fluency: 82, intonation: 83 },
  summary: { overall: "Bien", clarity: "Claire", rhythm: "Régulier", priority: "Voyelles" },
  weakPoints: [{ word: "Bonjour", note: "Possible omission", severity: "low" }],
  transcript: "Bonjour",
};
function recordingEnvironment(fetch = async () => Response.json(feedback)) {
  const streams = [], recorders = [];
  return {
    streams, recorders, fetch,
    async getUserMedia() {
      const track = { stopped: false, stop() { this.stopped = true; } };
      const stream = { getTracks: () => [track] };
      streams.push(stream); return stream;
    },
    createRecorder() {
      const recorder = {
        state: "inactive", ondataavailable: null, onstop: null, onerror: null,
        start() { this.state = "recording"; },
        stop() {
          this.state = "inactive";
          this.ondataavailable?.({ data: new Blob(["recorded speech"], { type: "audio/webm" }) });
          this.onstop?.();
        },
      };
      recorders.push(recorder); return recorder;
    },
  };
}

test("CP4.4 recording attempts/retries and analysis preparation use metadata only",async()=>{
  resetBetaDiagnostics(); const pending=deferred(), env=recordingEnvironment(()=>pending.promise), s=new PronunciationSession(env);
  const target={text:"SENSITIVE",documentId:"practice-document",revision:2,itemId:"line-2",contentType:"theatre",origin:"imported"};
  assert.equal(env.streams.length,0); await s.start(target); s.stop(); await s.start(target); s.stop();
  const analyze=s.analyze(); assert.ok(s.preparation.getSnapshot()); assert.equal(s.getSnapshot().status,"analyzing");
  pending.resolve(Response.json(feedback)); await analyze; assert.equal(s.preparation.getSnapshot(),null);
  const all=betaJournal.inspect(); assert.equal(all.filter(e=>e.name==="pronunciation_attempt" && e.status==="started").length,2);
  assert.equal(all.filter(e=>e.name==="pronunciation_retry").length,1);
  assert.equal(all.filter(e=>e.name==="operation"&&e.status==="completed").length,1);
  assert.ok(all.every(e=>e.contentType==="theatre" && e.revision===2)); assert.doesNotMatch(JSON.stringify(all),/SENSITIVE|Bonjour|recorded speech/);
  s.dispose(); assert.ok(env.streams.every(stream=>stream.getTracks()[0].stopped));
});

test("CP4.4 cancelled pronunciation analysis cannot complete newer preparation or report old errors",async()=>{
  resetBetaDiagnostics(); const pending=[deferred(),deferred()]; let calls=0;
  const s=new PronunciationSession(recordingEnvironment(()=>pending[calls++].promise));
  await s.start({text:"Old",documentId:"old",revision:1}); s.stop(); const old=s.analyze(); s.reset();
  await s.start({text:"New",documentId:"new",revision:2}); s.stop(); const current=s.analyze();
  pending[0].resolve(new Response("SENSITIVE",{status:500})); await old; assert.equal(s.preparation.getSnapshot().revision,2);
  pending[1].resolve(new Response("SENSITIVE",{status:429})); await current;
  assert.equal(s.preparation.getSnapshot(),null); assert.match(s.getSnapshot().error,/Trop de demandes/);
  assert.equal(betaJournal.inspect().filter(e=>e.name==="operation"&&e.status==="completed").length,0);
  assert.equal(betaJournal.inspect().at(-1).code,"RATE_LIMITED"); s.dispose();
});

test("CP4.4 missing recorder capability releases microphone and reports a safe category",async()=>{
  resetBetaDiagnostics(); const env=recordingEnvironment(); env.createRecorder=()=>{throw Error("SENSITIVE");};
  const s=new PronunciationSession(env); await s.start({text:"Fixture"});
  assert.equal(s.getSnapshot().status,"error"); assert.doesNotMatch(s.getSnapshot().error,/SENSITIVE/);
  assert.ok(env.streams[0].getTracks()[0].stopped); assert.equal(betaJournal.inspect().at(-1).code,"MICROPHONE_UNAVAILABLE"); s.dispose();
});

test("repeated réplique recordings use the EXISTING pronunciation route, reference prompt and feedback", async () => {
  const transcriptionCalls = [], analysisCalls = [], requests = [];
  class MockOpenAI {
    constructor() {
      this.audio = { transcriptions: { create: async (input) => {
        transcriptionCalls.push(input); return { text: "Bonjour" };
      } } };
      this.responses = { create: async (input) => {
        analysisCalls.push(input); return { output_text: JSON.stringify(feedback) };
      } };
    }
  }
  const route = createLoader({ openai: MockOpenAI, "next/server": { NextResponse: { json: (...args) => Response.json(...args) } } })("app/api/analyze-pronunciation/route.ts");
  const recording = recordingEnvironment(async (url, options) => {
    requests.push({ url, text: options.body.get("text"), itemId: options.body.get("itemId"), speaker: options.body.get("speaker") });
    return route.POST(new Request(`http://localhost${url}`, options));
  });
  const pronunciation = new PronunciationSession(recording);
  const { env, controller } = setup(); env.latest().end(); controller.enterPractice("line-2");
  const target = controller.getSnapshot().practiceTarget;
  for (let i = 0; i < 3; i++) {
    controller.replay(); controller.suspendPracticeAudio();
    await pronunciation.start(target); pronunciation.stop(); await pronunciation.analyze();
    assert.equal(pronunciation.getSnapshot().status, "analyzed");
    assert.deepEqual(pronunciation.getSnapshot().feedback.score, { overall: 80, pronunciation: 80, fluency: null, intonation: null });
    assert.deepEqual(pronunciation.getSnapshot().feedback.weakPoints.map(p => p.word), ["Bonjour"]);
    assert.match(pronunciation.getSnapshot().feedback.weakPoints[0].note, /reconnaissance vocale/);
    assert.equal(pronunciation.getSnapshot().recording.target.itemId, "line-2");
    assert.equal(controller.getSnapshot().currentIndex, 1);
    assert.equal(controller.getSnapshot().status, "practising");
  }
  assert.equal(transcriptionCalls.length, 3);
  assert.ok(transcriptionCalls.every((call) => call.model === "gpt-4o-mini-transcribe" && call.file instanceof File));
  assert.ok(analysisCalls.every((call) => call.model === "gpt-5.4-mini"));
  assert.ok(analysisCalls.every((call) => call.input[1].content[0].text.includes("Reference passage:\nBonjour.\n")));
  assert.deepEqual(requests, Array(3).fill({ url: "/api/analyze-pronunciation", text: "Bonjour.", itemId: "line-2", speaker: "NORA" }));
  assert.ok(recording.streams.every((stream) => stream.getTracks()[0].stopped));
  pronunciation.reset(); controller.finishPractice();
  assert.equal(controller.getSnapshot().currentItemId, "line-3");
  pronunciation.dispose(); controller.dispose();
});

test("ordinary recording still uses the full passage and the same multipart endpoint", async () => {
  const calls = [];
  const env = recordingEnvironment(async (url, options) => { calls.push([url, options.body]); return Response.json(feedback); });
  const session = new PronunciationSession(env);
  const target = { text: "Tout le passage original." };
  await session.start(target); target.text = "Modified later";
  session.stop(); await session.analyze();
  assert.equal(calls[0][0], "/api/analyze-pronunciation");
  assert.equal(calls[0][1].get("text"), "Tout le passage original.");
  assert.equal(calls[0][1].get("itemId"), null);
  assert.equal(calls[0][1].get("audio").type, "audio/webm");
  assert.deepEqual(session.getSnapshot().feedback, feedback);
  session.dispose();
});

test("rapid recording/analysis clicks are guarded; replacing a target aborts and ignores old feedback", async () => {
  const analysis = deferred();
  const calls = [];
  const env = recordingEnvironment((_url, options) => { calls.push(options); return analysis.promise; });
  const session = new PronunciationSession(env);
  const target = { text: "Bonjour.", itemId: "line-2", speaker: "NORA", sessionId: 4 };
  await Promise.all([session.start(target), session.start(target)]);
  assert.equal(env.recorders.length, 1);
  session.stop();
  const pending = session.analyze(); await session.analyze();
  assert.equal(calls.length, 1);
  session.reset();
  assert.equal(calls[0].signal.aborted, true);
  await session.start({ text: "Salut.", itemId: "line-3", speaker: "SAMIR", sessionId: 4 });
  analysis.resolve(Response.json(feedback)); await pending;
  assert.equal(session.getSnapshot().feedback, null);
  assert.equal(session.getSnapshot().target.itemId, "line-3");
  session.dispose();
  assert.ok(env.streams.every((stream) => stream.getTracks()[0].stopped));
});

test("unmount/scene replacement during microphone permission closes a late stream", async () => {
  const permission = deferred();
  let stopped = false;
  const session = new PronunciationSession({
    getUserMedia: () => permission.promise,
    createRecorder() { assert.fail("obsolete permission must not create a recorder"); },
    fetch() { assert.fail("no analysis expected"); },
  });
  const pending = session.start({ text: "Bonjour." });
  assert.equal(session.getSnapshot().status, "requesting-microphone");
  session.dispose();
  permission.resolve({ getTracks: () => [{ stop() { stopped = true; } }] });
  await pending;
  assert.equal(stopped, true);
  assert.equal(session.getSnapshot().status, "idle");
});

test("obsolete recorder callbacks cannot replace a new target; analysis failure can be retried", async () => {
  let calls = 0;
  const env = recordingEnvironment(async () => ++calls === 1 ? new Response("failure", { status: 500 }) : Response.json(feedback));
  const session = new PronunciationSession(env);
  await session.start({ text: "Ancien." });
  const staleData = env.recorders[0].ondataavailable, staleStop = env.recorders[0].onstop;
  session.reset(); await session.start({ text: "Bonjour." });
  staleData({ data: new Blob(["obsolete"]) }); staleStop();
  assert.equal(session.getSnapshot().recording, null);
  session.stop(); await session.analyze();
  assert.equal(session.getSnapshot().status, "error");
  await session.analyze();
  assert.equal(session.getSnapshot().status, "analyzed");
  assert.equal(session.getSnapshot().recording.target.text, "Bonjour.");
  session.dispose();
});
