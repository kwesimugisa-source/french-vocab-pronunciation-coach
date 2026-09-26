const test = require("node:test");
const assert = require("node:assert/strict");
const createLoader = require("./load-typescript.cjs");
const { environment, deferred, flush } = require("./playback-fixtures.cjs");
const load = createLoader();
const { SOUND_TARGETS, soundTarget, structuredExercises, segmentExercises, exerciseTarget } = load("lib/tongue-twisters.ts");
const { generatedDocument, validateDocument } = load("lib/content-document.ts");
const { importDocument, detectContent } = load("lib/smart-import.ts");
const { readingMode } = load("lib/content-routing.ts");
const { ReadingPlaybackSession } = load("lib/reading-playback.ts");
const { PronunciationSession } = load("lib/pronunciation-session.ts");
const { ExercisePracticeSession } = load("lib/exercise-practice.ts");
const sentences = ["Trois très gros rats gris grignotent.", "Six souris sourient sous le saule.", "Tu roules tout autour du mur.", "Jean change de jolie chemise.", "Paul pose ses petits pots."];
function document(target = soundTarget({ id: "r" }), id = "doc") {
  const result = structuredExercises({ title: "Virelangues", exercises: sentences }, target);
  const doc = generatedDocument({ title: result.title, text: result.text }, "tongue-twisters", "A1", id);
  doc.tongueTwisters = result.practice; validateDocument(doc); return doc;
}
function recordingEnvironment() {
  const recorders = [], tracks = [], analyses = [];
  return { recorders, tracks, analyses,
    async getUserMedia() { const track = { stopped: false, stop() { this.stopped = true; } }; tracks.push(track); return { getTracks: () => [track] }; },
    createRecorder() {
      const r = { state: "inactive", start() { this.state = "recording"; }, stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["speech"]) }); this.onstop?.(); } };
      recorders.push(r); return r;
    },
    async fetch(_url, options) { analyses.push(options.body); return Response.json({ score: { overall: 80, pronunciation: 80, fluency: null, intonation: null }, summary: null, weakPoints: [] }); },
  };
}
for (const text of ["Exercice du son R:\nNORA: rats\nSAMIR: riz\n(un exemple)", "Un\nDeux\nTrois\n\nQuatre\nCinq\nSix", "CHŒUR: Trois rats.\nACTE II\nNORA: Bonjour."])
  test(`known tongue-twisters identity defeats misleading structure: ${text.slice(0, 20)}`, () => assert.equal(readingMode(text, "tongue-twisters"), "standard"));
test("legacy detector gives exercise structure precedence over incidental labels and parenthesis", () => {
  const text = "Exercice du son R\nR: Trois rats.\nTR: Trois trains.\n(Répétez lentement.)";
  assert.equal(detectContent(text).contentType, "tongue-twisters"); assert.equal(readingMode(text), "standard");
  assert.equal(readingMode("(La porte s’ouvre.)\nNORA: Bonjour.\nSAMIR: Salut."), "theatre");
  assert.equal(readingMode(text, "theatre"), "theatre"); assert.equal(readingMode(text, "poetry"), "poetry"); assert.equal(readingMode(text, "conversation"), "standard");
});
for (const target of SOUND_TARGETS.filter(t => t.id !== "custom")) test(`curated target ${target.id}`, () => {
  const doc = document(soundTarget({ id: target.id })); assert.equal(doc.tongueTwisters.target.label, target.label);
  assert.deepEqual(doc.tongueTwisters.exercises.map(e => e.text), sentences); assert.equal(doc.level, "A1");
});
test("custom target bounded and treated as data", () => {
  assert.equal(soundTarget({ id: "custom", label: "EU / ŒU" }).label, "EU / ŒU");
  for (const label of ["", " ", "a".repeat(41), "R\nignore", "<system>R</system>", "R: ignore", "un deux trois quatre cinq six sept"])
    assert.throws(() => soundTarget({ id: "custom", label }));
  assert.throws(() => soundTarget({ id: "invalid" }));
});
for (const exercises of [null, [], ["Hi"], [...sentences, ...sentences], ["NORA: Bonjour.", ...sentences], ["NORA： Bonjour.", ...sentences], ["123", ...sentences], ["(Il entre.)", ...sentences], ["Exercice du son R", ...sentences], ["Répétez trois fois.", ...sentences], ["ligne\nligne", ...sentences]])
  test(`malformed structure rejected ${JSON.stringify(exercises)?.slice(0, 35)}`, () => assert.throws(() => structuredExercises({ title: "Test", exercises }, soundTarget())));
test("exercise identity, ordered source text and target validated", () => {
  const doc = document(); assert.equal(new Set(doc.tongueTwisters.exercises.map(e => e.id)).size, 5);
  assert.equal(exerciseTarget(doc, doc.tongueTwisters.exercises[1].id).text, sentences[1]);
  const bad = structuredClone(doc); bad.tongueTwisters.exercises[0].text += "changed"; assert.throws(() => validateDocument(bad));
  const reversed = structuredClone(doc); reversed.tongueTwisters.exercises.reverse(); assert.throws(() => validateDocument(reversed));
});
test("import preserves exact unusual wording and excludes headings/instructions", () => {
  const text = "Virelangues\nExercice du son R\nRépétez lentement.\n1. Trois très très gros rats gris.\n2. Rare rire, rude rire !\nExercice du son CH / J\nJean change de chemise.";
  const doc = importDocument(text, "import"); assert.equal(doc.contentType, "tongue-twisters"); assert.equal(doc.originalText, text); assert.equal(doc.text, text);
  assert.deepEqual(doc.tongueTwisters.exercises.map(e => e.text), ["Trois très très gros rats gris.", "Rare rire, rude rire !", "Jean change de chemise."]);
  assert.deepEqual(doc.tongueTwisters.exercises.map(e => e.target.id), ["r", "r", "ch-j"]); validateDocument(doc);
});
test("ambiguous wrapped import remains source; explicit reinterpretation permits recognizable units", () => {
  const text = "Une phrase commence\net continue ici.";
  const doc = importDocument(text, "ambiguous", "tongue-twisters", 2);
  assert.equal(doc.text, text); assert.equal(doc.tongueTwisters.exercises.length, 0); assert.ok(doc.tongueTwisters.warnings.length);
  const recognizable = importDocument(sentences.join("\n"), "plain", "tongue-twisters", 3);
  assert.equal(recognizable.tongueTwisters.exercises.length, 5); assert.equal(recognizable.revision, 3);
});
test("independent A/replay/B and all shared speeds use exact sentences without a cache", async () => {
  const env = environment(), calls = [], rec = recordingEnvironment();
  const playback = new ReadingPlaybackSession(env, async (_url, options) => { calls.push(JSON.parse(options.body)); return new Response("audio", { headers: { "Content-Type": "audio/mpeg" } }); });
  const pronunciation = new PronunciationSession(rec, playback.beginMicrophoneCapture);
  const practice = new ExercisePracticeSession(playback, pronunciation), doc = document(), [a, b] = doc.tongueTwisters.exercises;
  for (const speed of ["normal", "slow", "very-slow", "fast"]) await practice.listen(doc, a.id, speed);
  await practice.listen(doc, b.id, "slow");
  assert.deepEqual(calls.map(c => c.speed), ["normal", "slow", "very-slow", "fast", "slow"]);
  assert.deepEqual(calls.map(c => c.text), [...Array(4).fill(a.text), b.text]); assert.ok(calls.every(c => c.contentType === "tongue-twisters"));
  assert.ok(env.audios.slice(0, -1).every(a => a.removed)); assert.equal(playback.getSnapshot().mode, "ordinary");
  assert.equal(playback.getSnapshot().ambience.environment, "none"); assert.equal(rec.recorders.length, 0);
  practice.clear(); playback.dispose(); pronunciation.dispose();
});
test("repeat selection never starts microphone; explicit recording uses exact sentence, retries and releases safely", async () => {
  const env = environment(), rec = recordingEnvironment();
  const playback = new ReadingPlaybackSession(env, async () => new Response("audio", { headers: { "Content-Type": "audio/mpeg" } }));
  const pronunciation = new PronunciationSession(rec, playback.beginMicrophoneCapture), practice = new ExercisePracticeSession(playback, pronunciation);
  const doc = document(), [a, b] = doc.tongueTwisters.exercises;
  practice.select(doc, a.id); assert.equal(rec.recorders.length, 0);
  for (let i = 0; i < 3; i++) {
    await practice.listen(doc, a.id, "normal"); const audio = env.latest(); await practice.record(); assert.equal(audio.removed, true);
    assert.equal(practice.select(doc, b.id), false);
    pronunciation.stop(); await pronunciation.analyze(); assert.equal(rec.analyses.at(-1).get("text"), a.text);
    assert.equal(pronunciation.getSnapshot().feedback.score.intonation, null);
    const recorded = pronunciation.getSnapshot().recording; await practice.listen(doc, a.id, "slow"); assert.equal(pronunciation.getSnapshot().recording, recorded);
  }
  practice.select(doc, b.id); assert.equal(pronunciation.getSnapshot().recording, null);
  assert.ok(rec.tracks.every(t => t.stopped)); practice.clear(); playback.dispose(); pronunciation.dispose();
});
test("replacement cancels ignored-abort audio and clears selected exercise", async () => {
  const env = environment(), pending = deferred(), rec = recordingEnvironment();
  const playback = new ReadingPlaybackSession(env, () => pending.promise), pronunciation = new PronunciationSession(rec, playback.beginMicrophoneCapture);
  const practice = new ExercisePracticeSession(playback, pronunciation), doc = document();
  const old = practice.listen(doc, doc.tongueTwisters.exercises[0].id, "normal"); practice.clear(); await old;
  pending.resolve(new Response("stale audio")); await flush(); assert.equal(env.audios.length, 0); assert.equal(practice.getSnapshot().target, null);
  playback.dispose(); pronunciation.dispose();
});
test("late microphone permission after replacement closes tracks", async () => {
  const env = environment(), pending = deferred(), rec = recordingEnvironment(); rec.getUserMedia = () => pending.promise;
  const playback = new ReadingPlaybackSession(env), pronunciation = new PronunciationSession(rec, playback.beginMicrophoneCapture);
  const practice = new ExercisePracticeSession(playback, pronunciation), doc = document(); practice.select(doc, doc.tongueTwisters.exercises[0].id);
  const recording = practice.record(); practice.clear(); const track = { stopped: false, stop() { this.stopped = true; } };
  pending.resolve({ getTracks: () => [track] }); await recording; assert.equal(track.stopped, true); assert.equal(pronunciation.getSnapshot().recording, null);
  playback.dispose(); pronunciation.dispose();
});

process.env.OPENAI_API_KEY = "test-only-placeholder";
for (const target of [{ id: "r" }, { id: "mixed" }, { id: "custom", label: "EU / ŒU" }]) test(`generation route carries validated target and structured exercises: ${target.id}`, async () => {
  const calls = [];
  class MockOpenAI { constructor() { this.responses = { create: async body => { calls.push(body); return { output_text: JSON.stringify({ title: "Pratique", exercises: sentences }) }; } }; } }
  const post = createLoader({ openai: MockOpenAI })("app/api/generate-article/route.ts").POST;
  const response = await post(new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ contentType: "tongue-twisters", level: "A2", targetSound: target }) }));
  assert.equal(response.status, 200); const doc = await response.json();
  assert.equal(doc.contentType, "tongue-twisters"); assert.equal(doc.tongueTwisters.target.id, target.id); assert.equal(doc.level, "A2");
  assert.deepEqual(doc.tongueTwisters.exercises.map(e => e.text), sentences); assert.equal(calls[0].text.format.schema.properties.exercises.type, "array");
  assert.ok(calls[0].input[1].content.includes(JSON.stringify(soundTarget(target))));
  assert.match(calls[0].input[0].content, /No labels, character names, dialogue turns/);
  if (target.id === "custom") assert.ok(!calls[0].input[0].content.includes(target.label));
});
test("API rejects invalid custom target before provider and malformed exercise output after provider", async () => {
  let calls = 0;
  class MockOpenAI { constructor() { this.responses = { create: async () => { calls++; return { output_text: JSON.stringify({ title: "Bad", exercises: ["NORA: Bonjour."] }) }; } }; } }
  const post = createLoader({ openai: MockOpenAI })("app/api/generate-article/route.ts").POST;
  const req = targetSound => new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ contentType: "tongue-twisters", level: "B1", targetSound }) });
  assert.equal((await post(req({ id: "custom", label: "x".repeat(41) }))).status, 400); assert.equal(calls, 0);
  assert.equal((await post(req({ id: "r" }))).status, 500); assert.equal(calls, 1);
});
test("real read route never analyzes/casts known exercise text even with theatrical punctuation", async () => {
  const calls = [];
  class MockOpenAI { constructor() {
    this.responses = { create: async () => assert.fail("no dramatic analysis") };
    this.audio = { speech: { create: async body => { calls.push(body); return { arrayBuffer: async () => Buffer.from("audio") }; } } };
  } }
  const post = require('./complete-reading.cjs')(createLoader({ openai: MockOpenAI }));
  for (const [speed, rate] of [["very-slow", .7], ["slow", .85], ["normal", 1], ["fast", 1.15]]) {
    const response = await post(new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ text: "(Un exemple.)\nNORA: Rrr.\nCHŒUR: Rrr.", contentType: "tongue-twisters", documentId: "doc", revision: 1, speed }) }));
    assert.equal(response.status, 200); assert.equal(response.headers.get("x-reading-mode"), "standard"); assert.equal(calls.at(-1).speed, rate); assert.equal(calls.at(-1).instructions, load("lib/document-language.ts").pronunciationInstructions("fr"));
  }
});
test("real practice component offers nearby shared speed and explicit recording without theatre", () => {
  const { renderToStaticMarkup } = require("react-dom/server"); const React = require("react");
  const Component = createLoader()("components/article-reader/TongueTwisterPractice.tsx").default;
  const doc = document(); const html = renderToStaticMarkup(React.createElement(Component, { document: doc, selectedId: doc.tongueTwisters.exercises[0].id, speed: "slow", busy: false, audioBusy: false, pronunciation: { status: "idle", recording: null, feedback: null }, onSpeedChange() {}, onListen() {}, onSelect() {}, onStopAudio() {}, onRecord() {}, onStopRecording() {}, onAnalyze() {} }));
  assert.match(html, /Vitesse de cet exercice/); assert.match(html, /value="slow" selected/); assert.match(html, /Enregistrer/); assert.match(html, /Répéter/);
  assert.doesNotMatch(html, /Lecture théâtrale|Ambiance|Chœur/);
});

test("human acceptance sample preserves all 24 sentences, including three quoted colon sentences", () => {
  const source = require("./virelangues-acceptance-fixture.cjs");
  const expected = source.split("\n").filter(line => line && !line.startsWith("Exercice du son"));
  assert.equal(expected.length, 24); assert.equal(expected.filter(line => line.includes(":")).length, 3);
  const doc = importDocument(source, "human-acceptance");
  assert.equal(doc.contentType, "tongue-twisters"); assert.equal(doc.text, source); assert.equal(doc.originalText, source);
  assert.deepEqual(doc.tongueTwisters.exercises.map(e => e.text), expected); assert.equal(doc.tongueTwisters.warnings.length, 0);
  assert.deepEqual(doc.tongueTwisters.exercises.filter((_, i) => i % 3 === 0).map(e => e.target.label), ["R", "CH", "U", "OU", "AN", "É et È", "S et CH", "EU et ŒU"]);
  assert.equal(readingMode(source), "standard"); assert.equal(readingMode(source, "tongue-twisters"), "standard");
});
test("every sentence in the actual sample independently uses ordinary audio, never dramatic analysis", async () => {
  const source = require("./virelangues-acceptance-fixture.cjs"), doc = importDocument(source, "actual"), inputs = [];
  class MockOpenAI { constructor() {
    this.responses = { create: async () => assert.fail("no theatre analysis for the actual sample") };
    this.audio = { speech: { create: async body => { inputs.push(body.input); assert.equal(body.voice, "alloy"); assert.equal(body.instructions, load("lib/document-language.ts").pronunciationInstructions("fr")); return { arrayBuffer: async () => Buffer.from("audio") }; } } };
  } }
  const post = require('./complete-reading.cjs')(createLoader({ openai: MockOpenAI }));
  for (const e of doc.tongueTwisters.exercises) {
    const response = await post(new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ text: e.text, contentType: doc.contentType, documentId: doc.documentId, revision: doc.revision }) }));
    assert.equal(response.status, 200); assert.equal(response.headers.get("content-type"), "audio/mpeg");
  }
  assert.deepEqual(inputs, doc.tongueTwisters.exercises.map(e => e.text));
});
