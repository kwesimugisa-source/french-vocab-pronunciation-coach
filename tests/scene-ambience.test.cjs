const test = require("node:test");
const assert = require("node:assert/strict");
const { load, environment, flush } = require("./playback-fixtures.cjs");
const { analysisFor } = require("./dramatic-fixtures.cjs");
const { source } = require("./chorus-import-fixture.cjs");
const { parseTheatreItems } = load("lib/theatre.ts");
const { generateTheatreResponse } = load("lib/theatre-generation.ts");
const { validateAmbience, AMBIENCE_CATALOGUE, localAmbienceProvider, hasLocalAmbienceProvider, ambienceDescription } = load("lib/theatre-ambience.ts");
const { validateDramaticAnalysis, prepareDramaticDirection } = load("lib/theatre-direction.ts");
const { ReadingPlaybackSession } = load("lib/reading-playback.ts");
const { AmbiencePlayback } = load("lib/ambience-playback.ts");
const items = parseTheatreItems(source);
const office = () => ({ environment: "office", confidence: "high", basis: "contextual",
  evidence: [items[0], items[1], items[2]].map(i => ({ itemId: i.id, quote: i.text })),
  rationale: "A numbered client submits employment registration documents under administrative questioning.", contradictory: false });

test("whole-scene Le Joueur office inference accepts corroborated exact evidence without a literal office keyword", async () => {
  let analyses = 0;
  const data = await generateTheatreResponse(source, 1, async () => "YQ==", { analyze: async json => {
    analyses++; assert.deepEqual(JSON.parse(json).items, items);
    return { ...analysisFor(items), ambience: office() };
  } });
  assert.equal(analyses, 1); assert.deepEqual(data.ambience, office());
  assert.equal(data.direction.status, "analyzed");
  assert.equal(data.clips.filter(i => i.chorus).length, 2);
});

test("catalogue accepts evidence-backed explicit environments independently of provider availability", () => {
  assert.equal(Object.keys(AMBIENCE_CATALOGUE).length, 26);
  for (const environment of Object.keys(AMBIENCE_CATALOGUE).filter(k => k !== "none")) {
    const text = `(${AMBIENCE_CATALOGUE[environment]}.)`;
    const scene = parseTheatreItems(text);
    const recommendation = { environment, confidence: "high", basis: "explicit",
      evidence: [{ itemId: scene[0].id, quote: text }], rationale: "The stage direction establishes the setting.", contradictory: false };
    assert.deepEqual(validateAmbience(recommendation, scene), recommendation);
  }
});

test("ambiguous, low-confidence, contradictory and malformed ambience fail independently of drama", () => {
  const mutations = [
    x => { x.confidence = "uncertain"; }, x => { x.environment = "none"; },
    x => { x.environment = "spaceship"; }, x => { x.contradictory = true; },
    x => { x.evidence = x.evidence.slice(0, 1); }, x => { x.evidence = []; },
    x => { x.evidence[0].quote = "Not in the scene"; }, x => { x.evidence[0].itemId = "line-999"; },
    x => { x.evidence[1] = x.evidence[0]; }, x => { x.evidence[0].extra = true; },
    x => { x.basis = "explicit"; }, x => { x.basis = "guess"; },
    x => { x.rationale = ""; }, x => { x.extra = true; }, x => { delete x.contradictory; },
  ];
  for (const mutate of mutations) {
    const value = office(); mutate(value);
    assert.equal(validateAmbience(value, items).environment, "none");
    const result = validateDramaticAnalysis({ ...analysisFor(items), ambience: value }, items);
    assert.equal(result.ambience.environment, "none"); assert.deepEqual(result.items, analysisFor(items).items);
  }
});

test("genuinely ambiguous conversation remains silent after whole-scene analysis", async () => {
  const text = "NORA: Bonjour.\nSAMIR: Comment vas-tu ?";
  const scene = parseTheatreItems(text);
  const data = await generateTheatreResponse(text, 1, async () => "YQ==", { analyze: async () => ({ ...analysisFor(scene),
    ambience: { environment: "none", confidence: "uncertain", basis: "contextual", evidence: [],
      rationale: "A greeting establishes no location.", contradictory: false } }) });
  assert.equal(data.ambience.environment, "none"); assert.equal(data.direction.status, "analyzed");
});

test("analysis timeout/failure keeps complete generation and silent ambience fallback", async () => {
  for (const analyze of [async () => { throw new Error("unavailable"); }, () => new Promise(() => {})]) {
    const direction = await prepareDramaticDirection(items, analyze, 2);
    assert.equal(direction.analysis, null); assert.equal(direction.metadata.status, "fallback");
    const data = await generateTheatreResponse(source, 1, async () => "YQ==", { analyze, analysisTimeoutMs: 2 });
    assert.equal(data.ambience.environment, "none"); assert.equal(data.clips.length, items.length);
    assert.equal(data.clips.filter(i => i.chorus).length, 2);
  }
});

test("provider catalogue is honest: office room tone differs from rain and unsupported settings are silent", async () => {
  assert.deepEqual(Object.keys(AMBIENCE_CATALOGUE).filter(hasLocalAmbienceProvider), ["neutral_room", "office", "rain", "station"]);
  const rain = Buffer.from(await localAmbienceProvider("rain").arrayBuffer());
  const room = Buffer.from(await localAmbienceProvider("office").arrayBuffer());
  assert.notDeepEqual(room, rain);
  assert.deepEqual(room, Buffer.from(await localAmbienceProvider("office").arrayBuffer()));
  for (const kind of Object.keys(AMBIENCE_CATALOGUE).filter(k => !hasLocalAmbienceProvider(k))) {
    assert.equal(localAmbienceProvider(kind), null);
    const env = environment(), loop = new AmbiencePlayback(env);
    loop.configure(kind); loop.setLevel("medium"); loop.setActive(true);
    assert.equal(env.audios.length, 0); loop.stop();
    if (kind !== "none") assert.match(ambienceDescription(kind), /aucun son disponible/);
  }
});

test("client never upgrades missing or uncertain confidence in new scene reasoning", async () => {
  const data = await generateTheatreResponse(source, 1, async () => "YQ==", { analyze: async () => ({ ...analysisFor(items), ambience: office() }) });
  for (const confidence of [undefined, "uncertain"]) {
    const damaged = structuredClone(data);
    if (confidence === undefined) delete damaged.ambience.confidence;
    else damaged.ambience.confidence = confidence;
    const env = environment(), session = new ReadingPlaybackSession(env, async () => Response.json(damaged));
    session.setAmbienceLevel("low"); await session.start(source, "normal"); await flush();
    assert.equal(session.getSnapshot().ambience.environment, "none");
    assert.equal(session.theatre.getSnapshot().status, "playing");
    assert.equal(env.audios.some(a => a.loop), false);
    session.dispose(); assert.equal(env.revoked.length, env.created.length);
  }
});

test("office loop coexists with imported chorus, cached replay, capture and paused practice bookmarks", async () => {
  const data = await generateTheatreResponse(source, 1, async () => "YQ==", { analyze: async () => ({ ...analysisFor(items), ambience: office() }) });
  const env = environment(); let requests = 0;
  const session = new ReadingPlaybackSession(env, async () => { requests++; return Response.json(data); });
  await session.start(source, "normal"); await flush();
  assert.equal(session.getSnapshot().ambience.environment, "office");
  assert.equal(env.audios.filter(a => a.loop).length, 0);
  session.setAmbienceLevel("low"); const loop = env.audios.find(a => a.loop);
  assert.equal(loop.volume, 0.08);
  session.setAmbienceLevel("medium"); assert.equal(loop.volume, 0.16);
  for (let i = 0; i < 3; i++) env.audios.findLast(a => !a.loop && !a.removed).end();
  await flush();
  const group = env.audios.filter(a => !a.loop && !a.removed);
  assert.equal(group.length, 3);
  group.forEach((a, i) => a.currentTime = i + 1);
  session.theatre.pause(); session.theatre.enterPractice(items[0].id);
  const release = session.beginMicrophoneCapture();
  assert.equal(loop.volume, 0); assert.ok(loop.pauseCalls);
  release(); assert.equal(loop.volume, 0.16);
  session.theatre.finishPractice(); await flush();
  assert.equal(session.theatre.getSnapshot().status, "paused");
  const restored = env.audios.filter(a => !a.loop && !a.removed);
  assert.deepEqual(restored.map(a => a.currentTime), [1, 2, 3]);
  assert.ok(restored.every(a => a.playCalls === 0));
  const playCount = loop.playCalls;
  for (let i = 0; i < 3; i++) { session.theatre.replay(); await flush(); }
  assert.equal(requests, 1); assert.equal(loop.playCalls, playCount);
  session.setAmbienceLevel("off"); assert.ok(loop.removed);
  session.dispose(); assert.equal(env.created.length, env.revoked.length);
});

for (const action of ["stop", "replacement", "complete", "error", "unmount"]) {
  test(`office ambience ${action} releases all resources and stale callbacks`, async () => {
    const data = await generateTheatreResponse(source, 1, async () => "YQ==", { analyze: async () => ({ ...analysisFor(items), ambience: office() }) });
    const env = environment(), session = new ReadingPlaybackSession(env, async () => Response.json(data));
    await session.start(source, "normal"); session.setAmbienceLevel("low"); await flush();
    const loop = env.audios.find(a => a.loop), stale = loop.onerror;
    if (action === "unmount") session.dispose();
    else if (action === "error") env.audios.find(a => !a.loop).fail();
    else if (action === "complete") {
      for (let i = 0; i < data.clips.length; i++) {
        await flush(); env.audios.filter(a => !a.loop && !a.removed).forEach(a => a.end());
      }
      assert.equal(session.theatre.getSnapshot().status, "completed");
    } else session.stop();
    assert.ok(loop.removed);
    if (action === "replacement") {
      await session.start(source, "normal"); await flush();
      const next = env.audios.findLast(a => a.loop); stale?.(new Event("error")); assert.equal(next.removed, false);
    }
    session.dispose(); assert.equal(env.revoked.length, env.created.length);
  });
}
