const test = require("node:test");
const assert = require("node:assert/strict");
const createLoader = require("./load-typescript.cjs");
const { environment, deferred, flush } = require("./playback-fixtures.cjs");
process.env.OPENAI_API_KEY = "test-only-placeholder";
const basic = createLoader();
const { CONTENT_TYPES, generatedDocument } = basic("lib/content-document.ts");
const { importDocument } = basic("lib/smart-import.ts");
const { ReadingPlaybackSession } = basic("lib/reading-playback.ts");
function routes(output = { title: "Texte", text: "Bonjour à tous." }) {
  const calls = [], speech = [];
  class MockOpenAI {
    constructor() {
      this.responses = { create: async body => { calls.push(body); return { output_text: JSON.stringify(output) }; } };
      this.audio = { speech: { create: async body => { speech.push(body); return { arrayBuffer: async () => Buffer.from(body.input) }; } } };
    }
  }
  const load = createLoader({ openai: MockOpenAI });
  return { calls, speech, generate: load("app/api/generate-article/route.ts").POST, read: load("app/api/read-passage/route.ts").POST };
}
const request = body => new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
for (const type of CONTENT_TYPES) test(`nine-mode route identity: ${type}`, async () => {
  const text = type === "theatre" ? "NORA: Bonjour.\nSAMIR: Salut." : "Date: lundi\nLieu: Paris\nMarie: Bonjour.\nDavid: Salut.";
  const r = routes({ title: "Texte", text });
  const response = await r.generate(request({ contentType: type, level: "A1" })); assert.equal(response.status, 200);
  const doc = await response.json(); assert.equal(doc.contentType, type); assert.equal(doc.level, "A1"); assert.equal(doc.typeSource, "generated");
  assert.match(doc.source, /généré par IA/); assert.match(r.calls[0].input[0].content, new RegExp(`Content type: ${type}`));
  const audio = await r.read(request({ text: doc.text, contentType: doc.contentType, documentId: doc.documentId, revision: doc.revision }));
  assert.equal(audio.status, 200);
  if (type === "theatre") { assert.equal((await audio.json()).clips.length, 2); assert.equal(r.speech.length, 2); }
  else { assert.equal(r.calls.length, 1); assert.equal(r.speech.length, 1); assert.equal(r.speech[0].input, text); assert.equal(audio.headers.get("x-reading-mode"), type === "poetry" ? "poetry" : "standard"); }
});
for (const bad of [{}, { title: "Hi", text: 1 }, { title: "Hi" }, null]) test(`generation rejects malformed model output ${JSON.stringify(bad)}`, async () => {
  assert.equal((await routes(bad).generate(request({ contentType: "news", level: "B1" }))).status, 500);
});
test("invalid generation and playback boundaries do not call providers", async () => {
  const r = routes();
  for (const body of [{ contentType: "invalid", level: "B1" }, { contentType: "news", level: "invalid" }, null]) assert.equal((await r.generate(request(body))).status, 400);
  for (const body of [{}, { text: 7 }, { text: "Hi", contentType: "invalid" }, { text: "Hi", speed: "invalid" }, { text: "Hi", contentType: "news", revision: 0, documentId: "doc" }, { text: "Hi", revision: 1 }, { text: "a".repeat(60001) }]) assert.equal((await r.read(request(body))).status, 400);
  assert.equal(r.calls.length, 0); assert.equal(r.speech.length, 0);
});
test("unknown labelled conversation and metadata never request dramatic analysis", async () => {
  const r = routes();
  for (const text of ["Marie : Bonjour !\nDavid : Salut !", "Date: lundi\nLieu: Paris", "Définition: un terme\nObjectif: expliquer"]) {
    const result = await r.read(request({ text, contentType: "unknown" })); assert.equal(result.headers.get("content-type"), "audio/mpeg");
  }
  assert.equal(r.calls.length, 0); assert.equal(r.speech.length, 3);
});
test("ordinary limit is exact and never truncates; error is displayed by playback", async () => {
  const r = routes();
  const exact = "a".repeat(4096);
  assert.equal((await r.read(request({ text: exact, contentType: "poetry" }))).status, 200); assert.equal(r.speech[0].input, exact);
  const oversized = "mot ".repeat(1025);
  const response = await r.read(request({ text: oversized, contentType: "news" })); assert.equal(response.status, 413); assert.equal(r.speech.length, 1);
  const env = environment(), session = new ReadingPlaybackSession(env, (_url, options) => r.read(new Request("http://localhost/api", options)));
  await session.start(oversized, "normal", { documentId: "doc", revision: 1, contentType: "news" });
  assert.match(session.getSnapshot().error, /4096/); assert.equal(env.audios.length, 0); session.dispose();
});
test("oversized theatre item has identified failure and no partial response", async () => {
  const r = routes();
  const response = await r.read(request({ text: `NORA: ${"x".repeat(4097)}\nSAMIR: Bonjour.`, contentType: "theatre" }));
  assert.equal(response.status, 500); const body = await response.json(); assert.equal(body.clips, undefined);
  assert.equal(body.error.failedItems[0].id, "line-1"); assert.equal(r.speech.length, 1);
});
for (const wordsPerLine of [10, 25]) test(`smart import to route to playback complete order over repeated runs: ${wordsPerLine * 60} words`, async () => {
  const raw = "(La porte s’ouvre.)\n" + Array.from({length: 60}, (_, i) => `${i % 2 ? "SAMIR" : "NORA"}\nRéplique ${i + 1} ${"bonjour ".repeat(wordsPerLine - 2).trim()}.`).join("\n");
  const doc = importDocument(raw, "long"); assert.equal(doc.contentType, "theatre");
  for (let run = 0; run < 3; run++) {
    const r = routes(), env = environment(); let returned;
    const session = new ReadingPlaybackSession(env, async (_url, options) => {
      const body = JSON.parse(options.body); assert.equal(body.text, doc.text); assert.equal(body.documentId, doc.documentId);
      const response = await r.read(new Request("http://localhost/api", options)); returned = await response.clone().json(); return response;
    });
    await session.start(doc.text, "normal", doc);
    assert.equal(returned.clips.length, 61); assert.equal(r.speech.length, 61);
    for (let i = 0; i < 61; i++) { assert.equal(session.theatre.getSnapshot().currentIndex, i); env.latest().end(); }
    assert.equal(session.theatre.getSnapshot().status, "completed");
    assert.deepEqual(session.theatre.getSnapshot().completions.map(c => c.itemId), returned.clips.map(c => c.id)); session.dispose();
  }
});
test("document replacement invalidates pending audio even when transport ignores cancellation", async () => {
  const env = environment(), stale = deferred(), fresh = deferred(); let calls = 0;
  const session = new ReadingPlaybackSession(env, () => (++calls === 1 ? stale.promise : fresh.promise));
  const doc = generatedDocument({ title: "Hi", text: "Bonjour." }, "news", "A1", "old");
  const old = session.start(doc.text, "normal", doc); session.stop(); await old;
  const next = session.start("Salut.", "fast", { documentId: "new", revision: 2, contentType: "conversation" });
  fresh.resolve(new Response("new audio", { headers: { "Content-Type": "audio/mpeg" } })); await next;
  stale.resolve(new Response("old audio")); await flush(); assert.equal(env.audios.length, 1); session.dispose();
});

test("playback refuses response modes inconsistent with known document", async () => {
  for (const [contentType, response] of [["news", Response.json({ mode: "theatre" })], ["theatre", new Response("audio")]]) {
    const env = environment(), session = new ReadingPlaybackSession(env, async () => response);
    await session.start("Bonjour.", "normal", { documentId: "doc", revision: 1, contentType });
    assert.ok(session.getSnapshot().error); assert.equal(env.audios.length, 0); session.dispose();
  }
});

test("pronunciation route cannot return acoustic claims or unsupported weak words", async () => {
  const calls = [];
  class MockOpenAI {
    constructor() {
      this.audio = { transcriptions: { create: async () => ({ text: "bonjour" }) } };
      this.responses = { create: async body => { calls.push(body); return { output_text: JSON.stringify({
        score: { overall: 80, pronunciation: 90, fluency: 99, intonation: 100 },
        summary: { overall: "Perfect intonation" },
        weakPoints: [{ word: "Bonjour", note: "wrong stress" }, { word: "absent", note: "bad phoneme" }, { word: "Bonjour ami" }], transcript: "fake",
      }) }; } };
    }
  }
  const post = createLoader({ openai: MockOpenAI, "next/server": { NextResponse: { json: (...args) => Response.json(...args) } } })("app/api/analyze-pronunciation/route.ts").POST;
  const form = new FormData(); form.append("audio", new Blob(["speech"]), "audio.webm"); form.append("text", "Bonjour ami.");
  const response = await post(new Request("http://localhost/api", { method: "POST", body: form })); assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.score.fluency, null); assert.equal(result.score.intonation, null);
  assert.equal(result.transcript, "bonjour"); assert.deepEqual(result.weakPoints.map(p => p.word), ["Bonjour"]);
  assert.doesNotMatch(JSON.stringify(result), /Perfect intonation|wrong stress|bad phoneme/);
  assert.equal(calls[0].text.format.schema.properties.score.properties.intonation.type, "null");
});
test("word route validates identity and preserves unknown passage level", async () => {
  const calls = [];
  class MockOpenAI { constructor() { this.responses = { create: async body => { calls.push(body); return { output_text: JSON.stringify({ word: "chat" }) }; } }; } }
  const post = createLoader({ openai: MockOpenAI, "next/server": { NextResponse: { json: (...args) => Response.json(...args) } } })("app/api/analyze-word/route.ts").POST;
  const body = { word: "chat", sentence: "Le chat joue.", level: "unknown", contentType: "unknown", documentId: "doc", revision: 2 };
  assert.equal((await post(request(body))).status, 200); assert.match(calls[0].input[1].content[0].text, /Level: unknown/);
  assert.equal((await post(request({ ...body, revision: -1 }))).status, 400);
  assert.equal((await post(request({ ...body, contentType: "bogus" }))).status, 400); assert.equal(calls.length, 1);
});

test("explicit unknown identity stays generic; only identity-free legacy requests infer theatre", async () => {
  const r = routes(); const text = "(La porte s’ouvre.)\nNORA: Bonjour.\nSAMIR: Salut.";
  const explicit = await r.read(request({ text, contentType: "unknown", documentId: "doc", revision: 2 }));
  assert.equal(explicit.headers.get("content-type"), "audio/mpeg"); assert.equal(r.calls.length, 0);
  const legacy = await r.read(request({ text })); assert.equal((await legacy.json()).mode, "theatre");
});
