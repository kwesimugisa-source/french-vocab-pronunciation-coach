const test = require("node:test");
const assert = require("node:assert/strict");
const createLoader = require("./load-typescript.cjs");
const { environment, flush } = require("./playback-fixtures.cjs");
const { analysisFor } = require("./dramatic-fixtures.cjs");
const load = createLoader();
const { generatedDocument, validateDocument, CONTENT_TYPES } = load("lib/content-document.ts");
const { importDocument } = load("lib/smart-import.ts");
const { pronunciationInstructions } = load("lib/document-language.ts");
const { ReadingPlaybackSession } = load("lib/reading-playback.ts");
const { ExercisePracticeSession } = load("lib/exercise-practice.ts");
process.env.OPENAI_API_KEY = "test-only-placeholder";

function route() {
  const calls = [], analyses = [], requests = [];
  class OpenAI {
    constructor() {
      this.responses = { create: async body => {
        analyses.push(body);
        return { status: "completed", output_text: JSON.stringify(analysisFor(JSON.parse(body.input[1].content).items)) };
      }};
      this.audio = { speech: { create: async body => {
        calls.push(body);
        return { arrayBuffer: async () => Buffer.from(body.input) };
      }}};
    }
  }
  const post = createLoader({ openai: OpenAI })("app/api/read-passage/route.ts").POST;
  return { calls, analyses, requests, post: body => post(new Request("http://localhost/api/read-passage", { method: "POST", body: JSON.stringify(body) })),
    fetch: (_url, options) => { requests.push(JSON.parse(options.body)); return post(new Request("http://localhost/api/read-passage", options)); } };
}
function anchored(call) {
  assert.match(call.instructions, /Document language: French \(fr\)/);
  assert.match(call.instructions, /Maintain French pronunciation and phonology/);
  assert.match(call.instructions, /do not switch pronunciation language/);
  assert.equal(call.model, "gpt-4o-mini-tts");
  assert.equal(Object.hasOwn(call, "language"), false, "no unsupported provider parameter");
}
const fragments = ["THOMAS.", "Thomas...", "Marc...", "Oui.", "Non.", "Ah.", "Oh.", "Euh...", "Hmm ?", "Silence.", "Restaurant.", "Important.", "Alexis ?", "Original."];
const source = ["[Une salle calme.]", "CLARA : Je suis contente de te revoir.", ...fragments.map(s => "CLARA : " + s), "MARC : À bientôt.", "LE CHŒUR : Ensemble !"].join("\n");

test("generated/imported documents persist French authority in every content mode; legacy documents remain valid", () => {
  for (const type of CONTENT_TYPES) {
    for (const doc of [generatedDocument({ title: "Essai", text: "Bonjour à tous." }, type, "B1", "generated"), importDocument("Bonjour à tous.", "imported", type)]) {
      assert.equal(doc.language, "fr");
      validateDocument(doc);
      const legacy = { ...doc }; delete legacy.language; validateDocument(legacy);
      assert.throws(() => validateDocument({ ...doc, language: "en" }));
    }
  }
});
for (const style of ["clarte", "naturel"]) for (const [speed, factor] of Object.entries({ "very-slow": .7, slow: .85, normal: 1, fast: 1.15 })) {
  test("French provider boundary: " + style + " / " + speed + " keeps exact fragments and casting", async () => {
    const r = route(), doc = importDocument(source, "scene");
    const response = await r.post({ ...doc, performanceStyle: style, speed });
    assert.equal(response.status, 200);
    const scene = await response.json();
    assert.deepEqual(scene.clips.filter(c => c.speaker === "CLARA").map(c => c.text), ["Je suis contente de te revoir.", ...fragments]);
    assert.equal(new Set(scene.clips.filter(c => c.speaker === "CLARA").map(c => c.voice)).size, 1);
    for (const clip of scene.clips) {
      const calls = r.calls.filter(c => c.input === clip.text);
      assert.equal(calls.length, clip.chorus ? 3 : 1);
      for (const call of calls) {
        anchored(call);
        assert.equal(call.speed, clip.type === "stage" ? Math.max(.65, factor - .15) : factor);
        assert.match(call.instructions, style === "clarte" ? /Clarté:/ : /Naturel:/);
        assert.ok((clip.chorus ? clip.chorus.components.map(c => c.voice) : [clip.voice]).includes(call.voice));
      }
    }
  });
}
for (const type of CONTENT_TYPES.filter(t => !["theatre", "conversation"].includes(t))) {
  test(type + ": ordinary provider path shares language authority without theatre machinery", async () => {
    const r = route(), text = "Alexis. Original. Silence.";
    const response = await r.post({ text, contentType: type, language: "fr", speed: "fast" });
    assert.equal(response.status, 200); assert.equal(response.headers.get("content-type"), "audio/mpeg");
    assert.equal(await response.text(), text); assert.equal(r.analyses.length, 0);
    assert.equal(r.calls.length, 1); anchored(r.calls[0]);
    assert.equal(r.calls[0].instructions, pronunciationInstructions("fr"));
    assert.equal(r.calls[0].voice, "alloy"); assert.equal(r.calls[0].speed, 1.15);
  });
}
test("Conversation keeps French anchor, exact spoken turns, non-spoken labels and stable voices", async () => {
  const r = route(), text = "NORA : Bonjour, je suis là.\nSAMIR : Ah.\nNORA : Alexis...\nSAMIR : Original.";
  const response = await r.post({ text, contentType: "conversation", language: "fr" });
  assert.equal(response.status, 200);
  assert.deepEqual(r.calls.map(c => c.input), ["Bonjour, je suis là.", "Ah.", "Alexis...", "Original."]);
  r.calls.forEach(anchored); assert.equal(r.calls[0].voice, r.calls[2].voice);
  assert.equal(r.calls[1].voice, r.calls[3].voice); assert.notEqual(r.calls[0].voice, r.calls[1].voice);
  assert.equal(r.analyses.length, 0);
});
test("replay/practice reuse anchored audio and exact reference; style and speed restarts retain document authority", async () => {
  const r = route(), env = environment(), s = new ReadingPlaybackSession(env, r.fetch), doc = importDocument("CLARA : Marc...\nMARC : Oui.", "replay", "theatre");
  await s.start(doc.text, "normal", doc); await flush();
  assert.equal(r.requests[0].language, "fr"); r.calls.forEach(anchored);
  const item = s.theatre.getSnapshot().queue[0];
  assert.equal(s.theatre.enterPractice(item.id), true);
  assert.equal(s.theatre.getSnapshot().practiceTarget.text, "Marc...");
  const count = r.calls.length;
  for (let i = 0; i < 3; i++) {
    s.theatre.replay(); await flush();
    assert.equal(await env.created.find(c => c.url === env.latest().url).blob.text(), "Marc...");
    env.latest().end(); await flush();
  }
  assert.equal(r.calls.length, count);
  await s.changeTheatreStyle("naturel", doc.text, "slow", doc);
  assert.equal(r.requests.at(-1).language, "fr");
  assert.equal(s.theatre.getSnapshot().queue[0].voice, item.voice);
  assert.equal(s.theatre.getSnapshot().practiceTarget, null);
  s.stop(); await s.start(doc.text, "fast", doc);
  assert.equal(r.requests.at(-1).language, "fr"); r.calls.forEach(anchored);
  s.dispose();
});
test("individual Virelangue listen carries document language and unchanged exercise pronunciation target", async () => {
  const r = route(), env = environment(), s = new ReadingPlaybackSession(env, r.fetch);
  const doc = generatedDocument({ title: "Exercice", text: "Trois très gros rats gris.\nAlexis rit." }, "tongue-twisters", "A1", "practice");
  const recorded = [], p = { isBusy: () => false, reset() {}, start: target => recorded.push(target) };
  const practice = new ExercisePracticeSession(s, p), item = doc.tongueTwisters.exercises[0];
  await practice.listen(doc, item.id, "slow");
  assert.equal(r.requests[0].language, "fr"); assert.equal(r.calls[0].input, item.text); anchored(r.calls[0]);
  practice.record(); assert.equal(recorded[0].text, item.text);
  await practice.listen(doc, item.id, "fast"); assert.equal(r.calls.at(-1).speed, 1.15); anchored(r.calls.at(-1));
  s.dispose();
});
test("deferred switching: complete foreign sentence stays French anchored, next request cannot inherit English", async () => {
  const r = route();
  for (const text of ["Bonjour.", "I would like to buy a train ticket tomorrow.", "Alexis..."]) {
    const response = await r.post({ text, contentType: "news", language: "fr" });
    assert.equal(response.status, 200); assert.equal(await response.text(), text);
  }
  r.calls.forEach(anchored);
  assert.ok(r.calls.every(c => c.instructions === pronunciationInstructions("fr")));
});
test("legacy requests default to French; invalid language metadata fails before generation", async () => {
  const r = route();
  for (const language of ["en", null, {}, ["fr"], "fr-FR"]) {
    assert.equal((await r.post({ text: source, contentType: "theatre", language })).status, 400);
  }
  assert.equal(r.calls.length, 0); assert.equal(r.analyses.length, 0);
  assert.equal((await r.post({ text: "Alexis." })).status, 200); anchored(r.calls[0]);
});
