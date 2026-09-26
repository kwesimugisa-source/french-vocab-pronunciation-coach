const test = require("node:test"), assert = require("node:assert/strict");
const createLoader = require("./load-typescript.cjs");
const { environment, deferred, flush } = require("./playback-fixtures.cjs");
const load = createLoader();
const { practiceUnits, practiceTarget, supportsUniversalPractice } = load("lib/practice-units.ts");
const { generatedDocument } = load("lib/content-document.ts");
const { importDocument } = load("lib/smart-import.ts");
const { PracticeSession } = load("lib/practice-session.ts");
const { ReadingPlaybackSession } = load("lib/reading-playback.ts");
const { PronunciationSession } = load("lib/pronunciation-session.ts");
const doc = (text, type = "news", id = "doc") => generatedDocument({ title: "Test", text }, type, "B1", id);
function recorderEnv(fetch = async () => Response.json({ weakPoints: [] })) {
  const tracks = [], forms = [];
  return {
    tracks, forms, fetch: (url, opts) => { forms.push(opts.body); return fetch(url, opts); },
    getUserMedia: async () => { const t = { stopped: false, stop() { this.stopped = true; } }; tracks.push(t); return { getTracks: () => [t] }; },
    createRecorder: () => ({ state: "inactive", start() { this.state = "recording"; }, stop() {
      this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["recording"]) }); this.onstop?.();
    } }),
  };
}
function setup(fetch = async () => new Response("audio"), rec = recorderEnv()) {
  const env = environment(), playback = new ReadingPlaybackSession(env, fetch), pronunciation = new PronunciationSession(rec, playback.beginMicrophoneCapture);
  const practice = new PracticeSession(playback, pronunciation);
  return { env, playback, pronunciation, practice, rec, close() { practice.clear(); playback.dispose(); pronunciation.dispose(); } };
}
for (const type of ["news", "opinion", "creative", "academic", "everyday-life", "unknown"]) {
  test(type + ": conservative units preserve canonical text/ranges and document metadata", () => {
    const text = "M. Dupont paie 3.14 euros. Mme Martin sourit !\n\nDr Durand attend... encore un instant. Puis il part.";
    const d = type === "unknown" ? importDocument(text, "import", type) : doc(text, type);
    const before = JSON.stringify(d), units = practiceUnits(d);
    assert.deepEqual(units.map(u => u.text), ["M. Dupont paie 3.14 euros.", "Mme Martin sourit !", "Dr Durand attend... encore un instant.", "Puis il part."]);
    for (const u of units) assert.equal(d.text.slice(u.start, u.end), u.text);
    assert.equal(JSON.stringify(d), before); assert.equal(d.language, "fr");
    assert.deepEqual(practiceUnits(d), units);
  });
}
test("initials, dotted abbreviations, quotation punctuation, decimals and paragraph boundaries", () => {
  const text = 'J. Martin consulte le Dr Dupont. Il lit p. 12. « Bonjour ! » Puis il attend.\n\nUne ligne sans point';
  assert.deepEqual(practiceUnits(doc(text)).map(u => u.text), ["J. Martin consulte le Dr Dupont.", "Il lit p. 12.", "« Bonjour ! »", "Puis il attend.", "Une ligne sans point"]);
});
test("Poetry line/stanza whitespace remains exactly reconstructible without sentence flattening", () => {
  const d = doc("  Un soir. Une étoile !\nLe vent…\n\n  Le jour revient.\n", "poetry");
  const units = practiceUnits(d);
  assert.deepEqual(units.map(u => u.text), ["Un soir. Une étoile !", "Le vent…", "Le jour revient."]);
  let result = "", cursor = 0;
  for (const unit of units) { result += d.text.slice(cursor, unit.start) + unit.text; cursor = unit.end; }
  result += d.text.slice(cursor); assert.equal(result, d.text);
});
test("Conversation uses canonical spoken turns, repeated names, colon dialogue and visible labels", () => {
  const d = doc("NORA : NORA ?\nSAMIR : Il dit : oui.\nNORA : NORA ?", "conversation");
  const units = practiceUnits(d);
  assert.deepEqual(units.map(u => [u.id, u.speaker, u.text]), [["turn-1", "NORA", "NORA ?"], ["turn-2", "SAMIR", "Il dit : oui."], ["turn-3", "NORA", "NORA ?"]]);
  for (const u of units) { assert.equal(d.text.slice(u.start, u.end), u.text); assert.equal(practiceTarget(d, u).text, u.text); }
});
test("Theatre and Virelangues retain specialized authoritative practice paths", () => {
  for (const type of ["theatre", "tongue-twisters"]) { assert.equal(supportsUniversalPractice(type), false); assert.deepEqual(practiceUnits(doc("CLARA : Oui.", type)), []); }
});
test("every prose unit independently listens and records exact reference, metadata and speed", async () => {
  const requests = [], s = setup(async (_url, opts) => { requests.push(JSON.parse(opts.body)); return new Response("audio"); });
  const d = doc("Alexis. Il attend. Puis il sourit.");
  s.practice.enter(d); const units = s.practice.getSnapshot().units;
  for (const unit of units) for (const speed of ["very-slow", "slow", "normal", "fast"]) {
    s.practice.select(unit.id); await s.practice.listen(speed);
    assert.deepEqual(requests.at(-1), { text: unit.text, speed, language: "fr", documentId: d.documentId, revision: 1, contentType: "news" });
    await s.practice.record(); assert.equal(s.playback.getSnapshot().busy, false);
    assert.deepEqual(s.pronunciation.getSnapshot().target, practiceTarget(d, unit));
    s.pronunciation.stop(); await s.pronunciation.analyze();
    assert.equal(s.rec.forms.at(-1).get("text"), unit.text); assert.equal(s.rec.forms.at(-1).get("itemId"), unit.id);
  }
  assert.ok(s.rec.tracks.every(t => t.stopped)); assert.equal(d.language, "fr"); s.close();
});
test("A audio resolving after selection B cannot attach; only B starts playback", async () => {
  const pending = [deferred(), deferred()], opts = []; let i = 0;
  const s = setup((_url, o) => { opts.push(o); return pending[i++].promise; });
  s.practice.enter(doc("Première phrase. Deuxième phrase."));
  const [a,b] = s.practice.getSnapshot().units;
  const old = s.practice.listen("normal"); s.practice.select(b.id);
  assert.equal(opts[0].signal.aborted, true); await old;
  const current = s.practice.listen("normal");
  pending[0].resolve(new Response("old")); await flush(); assert.equal(s.env.audios.length, 0);
  pending[1].resolve(new Response("new")); await current;
  assert.equal(await s.env.created[0].blob.text(), "new"); assert.equal(s.practice.getSnapshot().selected.id, b.id);
  s.close();
});
for (const change of ["unit", "document", "mode"]) test(change + " change invalidates recording, pending analysis and feedback", async () => {
  const pending = deferred(), rec = recorderEnv(() => pending.promise), s = setup(undefined, rec);
  const original = doc("Première phrase. Deuxième phrase.");
  s.practice.enter(original); await s.practice.record(); s.pronunciation.stop();
  const analysis = s.pronunciation.analyze();
  if (change === "unit") s.practice.select(s.practice.getSnapshot().units[1].id);
  if (change === "document") s.practice.enter({ ...doc("Un nouveau texte.", "poetry", "new"), revision: 2 });
  if (change === "mode") s.practice.clear();
  pending.resolve(Response.json({ summary: { overall: "STALE" }, weakPoints: [] })); await analysis;
  assert.equal(s.pronunciation.getSnapshot().feedback, null); assert.equal(s.pronunciation.getSnapshot().recording, null);
  if (change === "document") { assert.equal(s.practice.getSnapshot().units.length, 1); await s.practice.record(); assert.equal(s.pronunciation.getSnapshot().target.documentId, "new"); }
  if (change === "mode") { assert.equal(s.practice.getSnapshot().active, false); assert.deepEqual(s.practice.getSnapshot().units, []); }
  s.close();
});
test("selection closes an active recorder and late microphone permission cannot attach", async () => {
  const permission = deferred(), rec = recorderEnv(), s = setup(undefined, rec);
  s.practice.enter(doc("Un essai. Autre essai.")); await s.practice.record();
  s.practice.select(s.practice.getSnapshot().units[1].id);
  assert.ok(rec.tracks.every(t => t.stopped)); assert.equal(s.pronunciation.getSnapshot().status, "idle");
  rec.getUserMedia = () => permission.promise; const recording = s.practice.record(); s.practice.clear();
  const track = { stopped: false, stop() { this.stopped = true; } }; permission.resolve({ getTracks: () => [track] }); await recording;
  assert.equal(track.stopped, true); assert.equal(s.pronunciation.getSnapshot().recording, null); s.close();
});
test("Full Reading after Practice preserves complete document identity/text and ordinary audio", async () => {
  const bodies = [], s = setup(async (_url, o) => { bodies.push(JSON.parse(o.body)); return new Response("audio"); });
  const d = doc("Un essai. Un autre essai.", "poetry");
  const before = JSON.stringify(d); s.practice.enter(d); await s.practice.listen("slow"); s.practice.clear();
  await s.playback.start(d.text, "fast", d);
  assert.equal(bodies.at(-1).text, d.text); assert.equal(bodies.at(-1).contentType, "poetry"); assert.equal(bodies.at(-1).language, "fr");
  assert.equal(JSON.stringify(d), before); assert.equal(s.playback.getSnapshot().mode, "ordinary"); s.close();
});
function route(fail = false) {
  const calls = [];
  class MockOpenAI { constructor() { this.audio = { speech: { create: async body => {
    calls.push(body); if (fail) throw Error("PRIVATE PROVIDER DETAIL"); return { arrayBuffer: async () => Buffer.from(body.input) };
  } } }; this.responses = { create: () => assert.fail("no theatre analysis") }; } }
  const post = createLoader({ openai: MockOpenAI })("app/api/read-passage/route.ts").POST;
  return { calls, post: body => post(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) })) };
}
process.env.OPENAI_API_KEY = "test-only-placeholder";
test("Conversation selected turn matches full-dialogue casting and French provider instructions at all speeds", async () => {
  const { conversationTurns, conversationVoices } = load("lib/conversation.ts");
  const d = doc("NORA : Bonjour.\nSAMIR : Oui.\nNORA : Marc...", "conversation"), voices = conversationVoices(conversationTurns(d.text));
  const units = practiceUnits(d), r = route();
  for (const [speed, factor] of [["very-slow", .7], ["slow", .85], ["normal", 1], ["fast", 1.15]]) for (const unit of units) {
    const response = await r.post({ ...d, speed, conversationTurnId: unit.id });
    assert.equal(response.status, 200); assert.equal(await response.text(), unit.text);
    const call = r.calls.at(-1); assert.equal(call.voice, voices.get(unit.speaker)); assert.equal(call.speed, factor);
    assert.equal(call.input, unit.text); assert.match(call.instructions, /Document language: French/);
  }
});
test("Conversation practice client requests whole context but plays only selected dialogue; recording excludes label", async () => {
  const r = route(), requests = [], s = setup((_url, opts) => { const b = JSON.parse(opts.body); requests.push(b); return r.post(b); });
  const d = doc("NORA : Bonjour.\nSAMIR : Marc...", "conversation"); s.practice.enter(d);
  const unit = s.practice.getSnapshot().units[1]; s.practice.select(unit.id); await s.practice.listen("slow");
  assert.equal(requests[0].text, d.text); assert.equal(requests[0].conversationTurnId, "turn-2");
  assert.equal(await s.env.created[0].blob.text(), unit.text); assert.equal(s.env.audios.length, 1);
  await s.practice.record(); s.pronunciation.stop(); await s.pronunciation.analyze();
  assert.equal(s.rec.forms[0].get("text"), "Marc..."); assert.equal(s.rec.forms[0].get("speaker"), "SAMIR"); s.close();
});
test("invalid Conversation turn metadata is rejected and provider failures expose only a safe error", async () => {
  const r = route();
  for (const body of [{ text: "Bonjour.", contentType: "news", conversationTurnId: "turn-1" }, { text: "NORA: Oui.", contentType: "conversation", conversationTurnId: "turn-9" }, { text: "NORA: Oui.", contentType: "conversation", conversationTurnId: {} }]) assert.equal((await r.post(body)).status, 400);
  assert.equal(r.calls.length, 0);
  const failing = await route(true).post({ text: "NORA: Oui.", contentType: "conversation", conversationTurnId: "turn-1" });
  assert.equal(failing.status, 500); assert.doesNotMatch(await failing.text(), /PRIVATE/);
});
test("practice UI exposes mode/selection semantics, exact poem and existing vocabulary buttons without nested buttons", () => {
  const React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
  const Controls = load("components/article-reader/PracticeControls.tsx").default;
  const Panel = load("components/article-reader/ArticleTextPanel.tsx").default;
  const d = doc("Un soir.\nUne étoile.\n\nLe matin.", "poetry"), units = practiceUnits(d);
  const html = renderToStaticMarkup(React.createElement(Panel, { article: d, practiceUnits: units, selectedUnitId: units[1].id, onSelectUnit() {}, onWordClick() {}, selectedWord: null }));
  assert.match(html, /whitespace-pre-wrap/); assert.match(html, /aria-label="Pratiquer l’unité 2" aria-pressed="true"/);
  assert.doesNotMatch(html, /<button[^>]*>(?:(?!<\/button>)[\s\S])*<button/);
  const controls = renderToStaticMarkup(React.createElement(Controls, { active: true, units, selected: units[1], audioBusy: false, recordingBusy: false }));
  assert.match(controls, /Lecture complète/); assert.match(controls, /Pratique/); assert.match(controls, /Unité 2 sur 3/); assert.match(controls, /flex-wrap/); assert.match(controls, /min-h-11/);
});
for (const type of ["news", "opinion", "creative", "academic", "everyday-life", "poetry", "unknown"]) test(type + ": independent practice unit reaches actual provider with French authority and exact text", async () => {
  const r = route(), s = setup((_url, opts) => r.post(JSON.parse(opts.body)));
  const d = importDocument("Alexis.\n\nRestaurant.", "imported-language", type);
  s.practice.enter(d);
  for (const unit of s.practice.getSnapshot().units) for (const [speed, factor] of [["very-slow", .7], ["slow", .85], ["normal", 1], ["fast", 1.15]]) {
    s.practice.select(unit.id); await s.practice.listen(speed);
    const call = r.calls.at(-1); assert.equal(call.input, unit.text); assert.equal(call.speed, factor);
    assert.match(call.instructions, /Document language: French/); assert.equal(call.voice, "alloy");
    assert.equal(s.practice.getSnapshot().selected.id, unit.id);
  }
  s.close();
});
for (const change of ["document revision", "Full Reading"]) test(change + " invalidates pending audio before it can play", async () => {
  const pending = deferred(), s = setup(() => pending.promise), d = doc("Un essai. Deux essais.");
  s.practice.enter(d); const old = s.practice.listen("normal");
  if (change === "document revision") s.practice.enter({ ...d, revision: 2, text: "Un texte révisé." }); else s.practice.clear();
  pending.resolve(new Response("stale")); await old; await flush();
  assert.equal(s.env.audios.length, 0); assert.equal(s.playback.getSnapshot().busy, false);
  if (change === "document revision") { await s.practice.record(); assert.equal(s.pronunciation.getSnapshot().target.revision, 2); }
  s.close();
});
test("late analysis JSON cannot overwrite a newly recorded unit and retry keeps exact reference", async () => {
  const json = deferred(), rec = recorderEnv(async () => ({ ok: true, json: () => json.promise })), s = setup(undefined, rec);
  s.practice.enter(doc("Premier essai. Autre essai."));
  await s.practice.record(); s.pronunciation.stop(); const old = s.pronunciation.analyze(); await flush();
  s.practice.select(s.practice.getSnapshot().units[1].id); await s.practice.record(); s.pronunciation.stop();
  json.resolve({ weakPoints: [{ word: "STALE" }] }); await old;
  assert.equal(s.pronunciation.getSnapshot().feedback, null); assert.equal(s.pronunciation.getSnapshot().recording.target.text, "Autre essai.");
  await s.practice.record(); assert.equal(s.pronunciation.getSnapshot().target.text, "Autre essai."); s.close();
});
test("practice selection preserves vocabulary offsets and every canonical word including dialogue labels", () => {
  const React = require("react"), direct = createLoader({ react: { ...React, useMemo: fn => fn() } })("components/article-reader/ArticleTextPanel.tsx").default;
  for (const type of ["news", "poetry", "conversation"]) {
    const d = doc(type === "conversation" ? "NORA : Encore, encore !\nSAMIR : Oui." : "Encore, encore !\n\nOui.", type);
    const words = [], selected = [], units = practiceUnits(d);
    const tree = direct({ article: d, practiceUnits: units, selectedUnitId: units[0].id, onSelectUnit: id => selected.push(id), onWordClick: (word, offset) => words.push({word,offset}), selectedWord: null });
    function walk(n) { if (Array.isArray(n)) return n.forEach(walk); if (!n || typeof n !== "object") return; if (n.type === "button") n.props.onClick(); walk(n.props?.children); } walk(tree);
    assert.deepEqual(selected, units.map(u => u.id)); assert.equal(words.length, d.text.match(/\S+/gu).length);
    for (const w of words) assert.equal(d.text.slice(w.offset, w.offset + w.word.length), w.word);
  }
});
test("Practice operations preserve content-free diagnostics", async () => {
  const { betaJournal, resetBetaDiagnostics } = load("lib/beta-events.ts"); resetBetaDiagnostics();
  const s = setup(); s.practice.enter(doc("PRIVATE_LEARNER_SENTENCE."));
  await s.practice.listen("normal"); await s.practice.record(); s.pronunciation.stop(); await s.pronunciation.analyze();
  assert.doesNotMatch(JSON.stringify(betaJournal.inspect()), /PRIVATE_LEARNER_SENTENCE|recording|transcript/); s.close();
});
