const test = require("node:test");
const assert = require("node:assert/strict");
const createLoader = require("./load-typescript.cjs");
const { environment, deferred, flush } = require("./playback-fixtures.cjs");
const load = createLoader();
const { sourcePresentation, PRESENTATION_VOICES } = load("lib/voice-casting.ts");
const { parseTheatreItems } = load("lib/theatre.ts");
const { createTheatreCasting } = load("lib/theatre-casting.ts");
const { generateTheatreResponse } = load("lib/theatre-generation.ts");
const { conversationTurns, conversationReference, structuredConversation, assertConversationResponse } = load("lib/conversation.ts");
const { generateConversation } = load("lib/conversation-generation.ts");
const { ReadingPlaybackSession } = load("lib/reading-playback.ts");
const { importDocument } = load("lib/smart-import.ts");
const { generatedDocument } = load("lib/content-document.ts");
const text = "Marie : Bonjour, comment allez-vous ?\nDavid : Très bien, merci. Et vous ?\nMarie : Je vais très bien.";
const audio = async input => Buffer.from(input.text).toString("base64");
const identity = { documentId: "conversation", revision: 1, contentType: "conversation" };
const mixed = "(Jean, une femme, entre.)\n(Sophie, un homme, attend.)\n(Alex, une femme, arrive.)\n(Camille, un homme, sourit.)\nJean: Bonjour.\nSophie: Salut.\nAlex: Oui.\nCamille: Non.\nJean: Encore.\nLE CHŒUR: Ensemble.";

test("explicit source evidence overrides name associations; mixed cast reserves narrator and all chorus components", () => {
  const cast = createTheatreCasting(parseTheatreItems(mixed));
  const members = cast.members.filter(m => m.role === "character");
  assert.equal(new Set(members.map(m => m.voice)).size, 4);
  for (const member of members) {
    const presentation = ["JEAN", "ALEX"].includes(member.speaker) ? "female-presenting" : "male-presenting";
    assert.equal(member.presentation, presentation); assert.ok(member.evidence.length);
    assert.ok(PRESENTATION_VOICES[presentation].includes(member.voice));
    assert.ok(![cast.narrator.voice, ...cast.chorus.voices].includes(member.voice));
  }
});
for (const name of ["Marie", "Sophie", "Jean", "David"]) test(`name ${name} alone never establishes presentation`, () => {
  assert.equal(sourcePresentation(name, []).presentation, "unspecified");
  assert.equal(createTheatreCasting(parseTheatreItems(`${name}: Bonjour.`)).members[0].presentation, "unspecified");
});
for (const descriptions of [["(Jean n’est pas une femme.)"], ["(Jean, une femme, peut-être.)"], ["(Jean, une femme, entre.)", "(Jean, un homme, entre.)"], ["(Jean est médecin.)"], ["(Jean sourit. Elle attend.)"]])
  test(`uncertain evidence abstains: ${descriptions.join(" ")}`, () => assert.equal(sourcePresentation("Jean", descriptions).presentation, "unspecified"));
test("generated and imported theatre casting, replay and all four speeds retain identities", async () => {
  const generated = generatedDocument({ title: "Scène", text: mixed }, "theatre", "B1", "generated");
  const imported = importDocument(mixed, "imported");
  const expected = createTheatreCasting(parseTheatreItems(mixed));
  for (const doc of [generated, imported]) for (const speed of [0.7, 0.85, 1, 1.15]) {
    const response = await generateTheatreResponse(doc.text, speed, audio);
    assert.deepEqual(response.casting, expected);
    const jean = response.clips.filter(c => c.speaker === "JEAN"); assert.equal(jean[0].voice, jean[1].voice);
    const env = environment(), session = new ReadingPlaybackSession(env, async () => Response.json(response));
    await session.start(doc.text, "normal", doc);
    for (let i = 0; i < 4; i++) env.latest().end();
    const voice = session.theatre.getSnapshot().queue[4].voice;
    session.theatre.replay(); assert.equal(session.theatre.getSnapshot().queue[4].voice, voice);
    session.dispose();
  }
});
test("conversation preserves labels and exact punctuation while deriving label-free reference", () => {
  const turns = conversationTurns(text);
  assert.deepEqual(turns.map(t => t.speakerLabel), ["Marie", "David", "Marie"]);
  assert.deepEqual(turns.map(t => t.spokenText), ["Bonjour, comment allez-vous ?", "Très bien, merci. Et vous ?", "Je vais très bien."]);
  assert.equal(conversationReference(text), turns.map(t => t.spokenText).join("\n"));
  assert.equal(importDocument(text, "doc").contentType, "conversation");
  assert.equal(importDocument(text, "doc").originalText, text);
});
test("accents/apostrophes, 3+ speakers and internal colons preserve wording and identity", async () => {
  const source = "Éloïse : Voici mon choix : oui.\nL’AMI : D’accord.\nZoé : Merci.\nl'ami : Bien.";
  const result = await generateConversation(source, 1, audio);
  assert.equal(result.clips[0].spokenText, "Voici mon choix : oui.");
  assert.equal(new Set(result.clips.map(c => c.voice)).size, 3);
  assert.equal(result.clips[1].voice, result.clips[3].voice);
});
for (const source of ["Marie :\nDavid : Salut.", "Marie : Bonjour.\nUne ligne sans étiquette.", "Marie : Bonjour.\n: Salut."])
  test(`malformed labelled input fails without loss: ${source}`, () => assert.throws(() => conversationTurns(source)));
test("plain legacy Conversation remains one intact spoken passage", () => {
  assert.equal(conversationReference("Bonjour à tous."), "Bonjour à tous.");
});
test("structured generation constructs visible labels without mutating dialogue", () => {
  const result = structuredConversation({ title: "Discussion", turns: [{ speakerLabel: "Marie", spokenText: "Mon avis : oui." }, { speakerLabel: "David", spokenText: "Merci." }] });
  assert.equal(result.text, "Marie : Mon avis : oui.\nDavid : Merci.");
});
for (const value of [null, { title: "X", turns: [] }, { title: "X", text }, { title: "X", turns: [{speakerLabel:"A", spokenText:"Hi"}, {speakerLabel:"B", spokenText:""}] }, { title: "X", turns: [{speakerLabel:"A", spokenText:"Hi"}, {speakerLabel:"B", spokenText:"Hi\nC: Bonjour"}] }])
  test(`invalid generated turns rejected: ${JSON.stringify(value)}`, () => assert.throws(() => structuredConversation(value)));
test("generation is bounded, ordered despite concurrency, distinct and stable across speeds/replays", async () => {
  let expected;
  for (const speed of [0.7, 0.85, 1, 1.15, 1]) {
    let active = 0, peak = 0;
    const result = await generateConversation(text, speed, async input => {
      peak = Math.max(peak, ++active);
      await new Promise(resolve => setTimeout(resolve, input.text.startsWith("Bonjour") ? 10 : 1));
      active--; assert.equal(input.speed, speed); assert.doesNotMatch(input.text, /^(Marie|David)\s*:/); return audio(input);
    });
    assert.equal(peak, 3); assert.deepEqual(result.clips.map(c => c.order), [0,1,2]);
    assert.equal(result.clips[0].voice, result.clips[2].voice); assert.notEqual(result.clips[0].voice, result.clips[1].voice);
    const voices = result.clips.map(c => c.voice); if (expected) assert.deepEqual(voices, expected); expected = voices;
  }
});
test("failed or empty TTS never returns a partial conversation", async () => {
  for (const fail of [async () => { throw new Error("upstream secret"); }, async () => ""]) {
    await assert.rejects(generateConversation(text, 1, input => input.text.startsWith("Très") ? fail() : audio(input)), /tours 2/);
  }
});
test("oversized turns fail before any provider request", async () => {
  let calls = 0;
  await assert.rejects(generateConversation(`A: Bonjour.\nB: ${"x".repeat(4097)}`, 1, async () => {calls++; return "YQ==";}), /4096/);
  assert.equal(calls, 0);
});
test("client verifies order, text, voice, speed and complete count", async () => {
  const response = await generateConversation(text, 1, audio);
  for (const mutate of [v => v.clips.pop(), v => v.clips.reverse(), v => v.clips[0].spokenText += "extra", v => v.clips[0].voice = "cedar", v => v.clips[0].speed = 0.7, v => v.clips[0].audioBase64 = "%%%", v => v.mode = "theatre"]) {
    const bad = structuredClone(response); mutate(bad); assert.throws(() => assertConversationResponse(bad, text, 1));
  }
});
async function setup(source = text, env = environment()) {
  const response = await generateConversation(source, 1, audio);
  const session = new ReadingPlaybackSession(env, async () => Response.json(response));
  session.theatre.beginLoading = () => { throw new Error("Conversation must not enter theatre controller"); };
  await session.start(source, "normal", identity);
  return { env, session, response };
}
test("conversation plays exactly once in order with no overlap, theatre or ambience", async () => {
  const { env, session } = await setup();
  assert.equal(session.getSnapshot().mode, "conversation"); assert.equal(session.getSnapshot().ambience.environment, "none");
  assert.equal(session.theatre.getSnapshot().status, "idle");
  for (let i = 0; i < 3; i++) {
    assert.equal(env.audios.length, i + 1); const previous = env.latest(), duplicate = previous.onended;
    assert.equal(await env.created[i].blob.text(), conversationTurns(text)[i].spokenText);
    previous.end(); duplicate(new Event("ended"));
    assert.equal(previous.removed, true);
  }
  assert.deepEqual(session.conversation.getSnapshot().playedIds, ["turn-1", "turn-2", "turn-3"]);
  assert.equal(session.getSnapshot().busy, false); assert.equal(env.revoked.length, 3); session.dispose();
});
for (const failure of ["load", "play", "stall"]) test(`conversation ${failure} error terminates visibly without skipping`, async () => {
  const env = environment(); if (failure === "play") env.nextPlay = Promise.reject(new Error("blocked"));
  const { session } = await setup(text, env);
  if (failure === "load") env.latest().fail(); if (failure === "stall") env.expire(); await flush();
  assert.match(session.getSnapshot().error, /tour 1/); assert.equal(env.audios.length, 1); assert.equal(session.getSnapshot().busy, false); session.dispose();
});
test("stale ended/error/play rejection cannot advance or break a replacement", async () => {
  const pending = deferred(), env = environment(); env.nextPlay = pending.promise;
  const { session } = await setup(text, env);
  const oldEnd = env.latest().onended, oldError = env.latest().onerror;
  session.stop(); await session.start(text, "normal", { ...identity, documentId: "replacement" });
  oldEnd(new Event("ended")); oldError(new Event("error")); pending.reject(new Error("late")); await flush();
  assert.equal(env.audios.length, 2); assert.equal(session.getSnapshot().error, null); session.dispose();
});
test("stale async response is ignored after replacement", async () => {
  const pending = deferred(), env = environment(); let calls = 0;
  const response = await generateConversation(text, 1, audio);
  const session = new ReadingPlaybackSession(env, () => ++calls === 1 ? pending.promise : Promise.resolve(Response.json(response)));
  const old = session.start(text, "normal", identity); session.stop(); await old;
  await session.start(text, "normal", { ...identity, revision: 2 });
  pending.resolve(Response.json(response)); await flush(); assert.equal(env.audios.length, 1); session.dispose();
});
test("capture stops conversation and stale callbacks; release cannot restart it", async () => {
  const { env, session } = await setup(); const end = env.latest().onended;
  const release = session.beginMicrophoneCapture(); end(new Event("ended")); release();
  assert.equal(env.audios.length, 1); assert.equal(session.getSnapshot().busy, false); session.dispose();
});
test("capture while generation is pending rejects late response", async () => {
  const pending = deferred(), env = environment(), response = await generateConversation(text, 1, audio);
  const session = new ReadingPlaybackSession(env, () => pending.promise);
  const starting = session.start(text, "normal", identity), release = session.beginMicrophoneCapture();
  await starting; release(); pending.resolve(Response.json(response)); await flush(); assert.equal(env.audios.length, 0); session.dispose();
});

for (const [description, presentation] of [["(Jean, une jeune femme, entre.)", "female-presenting"], ["(Sophie est un homme.)", "male-presenting"], ["(Jean, la sœur de Camille, attend.)", "female-presenting"]])
  test(`explicit descriptor supported: ${description}`, () => {
    assert.equal(sourcePresentation(description.includes("Sophie") ? "Sophie" : "Jean", [description]).presentation, presentation);
  });
test("generated duplicate speaker label inside spokenText is rejected", () => {
  assert.throws(() => structuredConversation({ title: "Test", turns: [{ speakerLabel: "Marie", spokenText: "Marie : Bonjour." }, { speakerLabel: "David", spokenText: "Salut." }] }));
});
test("full API Conversation flow: generated/imported, all speeds, no analysis or casting model", async () => {
  process.env.OPENAI_API_KEY = "test-only-placeholder";
  const requests = [], speech = [];
  const modelOutput = { title: "Discussion", turns: conversationTurns(text).map(({speakerLabel, spokenText}) => ({speakerLabel, spokenText})) };
  class MockOpenAI {
    constructor() {
      this.responses = { create: async body => { requests.push(body); assert.equal(body.text.format.name, "learning_passage"); return { output_text: JSON.stringify(modelOutput) }; } };
      this.audio = { speech: { create: async body => { speech.push(body); return { arrayBuffer: async () => Buffer.from(body.input) }; } } };
    }
  }
  const routeLoad = createLoader({ openai: MockOpenAI }), read = routeLoad("app/api/read-passage/route.ts").POST;
  const generate = routeLoad("app/api/generate-article/route.ts").POST;
  const req = body => new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
  const generatedResponse = await generate(req({contentType:"conversation", level:"B1"})); assert.equal(generatedResponse.status, 200);
  const generated = await generatedResponse.json(); assert.equal(generated.contentType, "conversation");
  for (const doc of [generated, importDocument(text, "import")]) for (const [speed, numeric] of [["very-slow",0.7],["slow",0.85],["normal",1],["fast",1.15]]) {
    const env = environment(), startCalls = speech.length;
    const session = new ReadingPlaybackSession(env, (_url, options) => read(new Request("http://localhost/api", options)));
    await session.start(doc.text, speed, doc);
    assert.equal(session.getSnapshot().error, null); assert.equal(session.getSnapshot().mode, "conversation");
    assert.deepEqual(speech.slice(startCalls).map(s => s.input), conversationTurns(text).map(t => t.spokenText));
    assert.ok(speech.slice(startCalls).every(s => s.speed === numeric));
    for (let i=0; i<3; i++) env.latest().end();
    assert.deepEqual(session.conversation.getSnapshot().playedIds, ["turn-1","turn-2","turn-3"]);
    assert.equal(session.theatre.getSnapshot().queue.length, 0); session.dispose();
  }
  assert.equal(requests.length, 1, "only the initial content-generation model request");
  const before = speech.length;
  assert.equal((await read(req({text:"A: Bonjour.\nB:",contentType:"conversation"}))).status, 400);
  assert.equal((await read(req({text:`A: ${"x".repeat(4097)}`,contentType:"conversation"}))).status, 413);
  assert.equal(speech.length, before);
});
for (const words of [10, 25]) test(`Conversation ${words*60} words: repeated exact-once playback and order`, async () => {
  const source = Array.from({length:60}, (_,i) => `${i%2 ? "CLIENT" : "AGENT"} : ${"bonjour ".repeat(words-1)}${i}.`).join("\n");
  for (let run=0; run<3; run++) {
    const {env, session} = await setup(source);
    for(let i=0;i<60;i++) { assert.equal(env.audios.length,i+1); env.latest().end(); }
    assert.deepEqual(session.conversation.getSnapshot().playedIds, conversationTurns(source).map(t=>t.id));
    assert.equal(session.getSnapshot().busy,false); session.dispose();
  }
});
