const test = require("node:test");
const assert = require("node:assert/strict");
const { load, environment, scene, deferred, flush } = require("./playback-fixtures.cjs");
const { TheatrePlaybackController } = load("lib/theatre-playback.ts");
const { ReadingPlaybackSession } = load("lib/reading-playback.ts");
const { PronunciationSession } = load("lib/pronunciation-session.ts");
const { ChorusAudio } = load("lib/chorus-audio.ts");
const { AmbiencePlayback } = load("lib/ambience-playback.ts");
const { validateAmbience, localAmbienceProvider } = load("lib/theatre-ambience.ts");
const { parseTheatreItems, assertCompleteTheatreResponse } = load("lib/theatre.ts");
const { generateTheatreResponse, TheatreGenerationError } = load("lib/theatre-generation.ts");
const { validateDramaticAnalysis } = load("lib/theatre-direction.ts");
const { analysisFor } = require("./dramatic-fixtures.cjs");
const chorusText = "CHŒUR: Ensemble, chantons notre espoir !\nNORA: Bonjour.\nSAMIR: Salut.";
const rainText = "(La pluie tombe sur le toit.)\nNORA: Bonjour.\nCHŒUR: Ensemble !\nSAMIR: Salut.";
const parts = () => ["echo", "fable", "onyx"].map((voice) => ({ voice, audioBase64: Buffer.from("Ensemble !").toString("base64") }));
function chorusScene(text = chorusText) {
  const data = scene(text);
  data.clips.forEach((clip) => {
    if (clip.speaker === "CHŒUR") {
      clip.chorus = { components: parts().map((part) => ({ ...part, audioBase64: Buffer.from(clip.text).toString("base64") })) };
      clip.voice = clip.chorus.components[0].voice;
      clip.audioBase64 = clip.chorus.components[0].audioBase64;
    }
  });
  if (text === rainText) data.ambience = { environment: "rain", evidenceItemId: "line-1", evidenceQuote: "La pluie tombe" };
  return data;
}
async function chorusSetup() {
  const env = environment(), controller = new TheatrePlaybackController(env);
  controller.acceptScene(controller.beginLoading(), chorusScene(), chorusText);
  await flush();
  return { env, controller, voices: env.audios.slice() };
}

test("three independent chorus voices preserve exact input, one ID, cast and global concurrency", async () => {
  let active = 0, peak = 0; const calls = [];
  const result = await generateTheatreResponse(chorusText, 1, async (input) => {
    calls.push(input); peak = Math.max(peak, ++active); await Promise.resolve(); active--;
    return Buffer.from(input.text).toString("base64");
  });
  assert.equal(peak, 3); assert.equal(calls.length, 5);
  assert.equal(result.clips.length, 3); assert.equal(result.integrity.generatedClipCount, 3);
  assert.deepEqual(calls.slice(0, 3).map((c) => c.voice), ["echo", "fable", "onyx"]);
  assert.ok(calls.slice(0, 3).every((c) => c.text === parseTheatreItems(chorusText)[0].text));
  assert.equal(result.clips[0].id, "line-1"); assert.equal(result.clips[0].chorus.components.length, 3);
  assertCompleteTheatreResponse(result, parseTheatreItems(chorusText));
});

test("one or multiple failed chorus components fail that logical item once, with no success-shaped scene", async () => {
  for (const failures of [["fable"], ["echo", "onyx"]]) {
    let calls = 0;
    await assert.rejects(generateTheatreResponse(chorusText, 1, async ({ text, voice }) => {
      calls++; if (text.includes("Ensemble") && failures.includes(voice)) throw new Error("private failure");
      return Buffer.from(text).toString("base64");
    }), (error) => {
      assert.ok(error instanceof TheatreGenerationError);
      assert.deepEqual(error.failedItems, [{ id: "line-1", index: 0, sourceLines: [1] }]);
      assert.equal(error.generatedClipCount, 2); assert.equal(error.clips, undefined); return true;
    });
    assert.equal(calls, 5);
  }
});

test("chorus contract rejects missing, duplicate, empty, inconsistent and misplaced components", () => {
  for (const mutate of [
    (d) => d.clips[0].chorus.components.pop(),
    (d) => { d.clips[0].chorus.components[1].voice = "echo"; },
    (d) => { d.clips[0].chorus.components[2].audioBase64 = ""; },
    (d) => { d.clips[0].audioBase64 = "other"; },
    (d) => { d.clips[1].chorus = d.clips[0].chorus; },
  ]) {
    const data = chorusScene(); mutate(data);
    assert.throws(() => assertCompleteTheatreResponse(data, parseTheatreItems(chorusText)));
  }
});

test("all chorus sources must be ready before any starts; startup calls overlap", async () => {
  const env = environment(), create = env.createAudio;
  env.createAudio = (url) => { const audio = create(url); audio.readyState = 0; return audio; };
  const group = new ChorusAudio(parts(), env), playing = group.play();
  env.audios[0].oncanplay(); env.audios[1].oncanplay(); await flush();
  assert.ok(env.audios.every((a) => a.playCalls === 0));
  env.audios[2].oncanplay(); await playing;
  assert.ok(env.audios.every((a) => a.playCalls === 1));
  assert.ok(env.audios.every((a) => a.volume === 1 / 3));
  group.removeAttribute("src");
  assert.deepEqual(env.revoked, env.created.map(({ url }) => url));
});

test("an early-ended source cannot advance; last source advances exactly once", async () => {
  const { env, controller, voices } = await chorusSetup();
  const callbacks = voices.map((a) => a.onended);
  voices[0].end(); voices[1].end();
  assert.equal(controller.getSnapshot().currentIndex, 0);
  voices[2].end(); callbacks.forEach((callback) => callback(new Event("ended")));
  assert.equal(controller.getSnapshot().currentIndex, 1);
  assert.equal(controller.getSnapshot().completions.length, 1);
  assert.equal(controller.enterPractice("line-1"), false);
  controller.dispose(); assert.deepEqual(env.revoked, env.created.map(({ url }) => url));
});

test("Pause/Resume retain all positions, do not restart completed voices, and replay restarts whole group", async () => {
  const { env, controller, voices } = await chorusSetup();
  voices.forEach((a, i) => a.progress(2 + i / 10)); voices[0].end();
  controller.pause(); assert.ok(voices.every((a) => a.pauseCalls === 1));
  controller.resume(); await flush();
  assert.equal(voices[0].playCalls, 1);
  assert.ok(voices.slice(1).every((a) => a.playCalls === 2));
  assert.deepEqual(voices.map((a) => a.currentTime), [2, 2.1, 2.2]);
  controller.replay(); await flush();
  assert.ok(env.audios.slice(-3).every((a) => a.currentTime === 0 && a.playCalls === 1));
  assert.equal(controller.getSnapshot().currentIndex, 0); controller.dispose();
});

test("non-current practice restores a chorus bookmark including already-completed sources, without starting paused audio", async () => {
  const { env, controller, voices } = await chorusSetup();
  voices.forEach((a, i) => a.progress(3 + i / 10)); voices[0].end(); controller.pause();
  controller.enterPractice("line-2"); controller.replay(); env.latest().end(); controller.finishPractice();
  const restored = env.audios.slice(-3);
  assert.equal(controller.getSnapshot().status, "paused");
  assert.deepEqual(restored.map((a) => a.currentTime), [3, 3.1, 3.2]);
  assert.ok(restored.every((a) => a.playCalls === 0));
  controller.resume(); await flush();
  assert.equal(restored[0].playCalls, 0); assert.equal(restored[1].playCalls, 1);
  restored[1].end(); restored[2].end();
  assert.equal(controller.getSnapshot().currentIndex, 1); controller.dispose();
});

for (const action of ["playing", "paused", "replaying", "practising"]) {
  test(`Stop ${action} releases every chorus source; callbacks cannot change a newer scene`, async () => {
    const { env, controller, voices } = await chorusSetup();
    const stale = voices.map((a) => [a.onended, a.onerror, a.ontimeupdate]);
    if (action === "paused") controller.pause();
    if (action === "replaying") controller.replay();
    if (action === "practising") controller.enterPractice("line-2");
    controller.stop();
    assert.ok(env.audios.every((a) => a.removed));
    assert.deepEqual(env.revoked, env.created.map(({ url }) => url));
    controller.acceptScene(controller.beginLoading(), chorusScene(), chorusText);
    stale.flat().forEach((callback) => callback(new Event("event")));
    assert.equal(controller.getSnapshot().currentIndex, 0);
    assert.equal(controller.getSnapshot().status, "playing"); controller.dispose();
  });
}

test("component media error or rejected play stops the entire group without advancing", async () => {
  for (const rejected of [false, true]) {
    const env = environment(); if (rejected) env.nextPlay = Promise.reject(new Error("blocked"));
    const controller = new TheatrePlaybackController(env);
    controller.acceptScene(controller.beginLoading(), chorusScene(), chorusText); await flush();
    if (!rejected) env.audios[1].fail();
    await flush();
    assert.equal(controller.getSnapshot().status, "error");
    assert.equal(controller.getSnapshot().currentIndex, 0);
    assert.equal(controller.getSnapshot().completions.length, 0);
    assert.ok(env.audios.every((a) => a.removed));
    assert.deepEqual(env.revoked, env.created.map(({ url }) => url)); controller.dispose();
  }
});

test("Stop during readiness releases pending startup and ignores late canplay; stalled startup watchdog releases group", async () => {
  const env = environment(), create = env.createAudio;
  env.createAudio = (url) => { const audio = create(url); audio.readyState = 0; return audio; };
  const controller = new TheatrePlaybackController(env);
  controller.acceptScene(controller.beginLoading(), chorusScene(), chorusText);
  const ready = env.audios.map((a) => a.oncanplay);
  controller.stop(); ready.forEach((callback) => callback()); await flush();
  assert.ok(env.audios.every((a) => a.playCalls === 0));
  controller.acceptScene(controller.beginLoading(), chorusScene(), chorusText);
  env.expire();
  assert.equal(controller.getSnapshot().status, "error");
  assert.ok(env.audios.every((a) => a.removed)); controller.dispose();
});

test("group construction failure releases even partially allocated URLs", () => {
  const env = environment(), create = env.createAudio;
  env.createAudio = (url) => { if (env.audios.length === 1) throw new Error("device"); return create(url); };
  assert.throws(() => new ChorusAudio(parts(), env));
  assert.deepEqual([...env.revoked].sort(), env.created.map(({ url }) => url).sort());
  assert.equal(env.audios[0].removed, true);
});

const recommendation = { environment: "rain", confidence: "high", evidenceItemId: "line-1", evidenceQuote: "La pluie tombe" };
test("ambience requires supported environment, high confidence and exact present stage evidence", () => {
  const items = parseTheatreItems(rainText);
  assert.equal(validateAmbience(recommendation, items).environment, "rain");
  for (const raw of [undefined, null, "rain", {}, { ...recommendation, environment: "birds" },
    { ...recommendation, extra: "unexpected" },
    { ...recommendation, confidence: "uncertain" }, { ...recommendation, evidenceItemId: "line-99" },
    { ...recommendation, evidenceQuote: "Invented rain" }, { ...recommendation, evidenceItemId: "line-2" }]) {
    assert.equal(validateAmbience(raw, items).environment, "none");
  }
  for (const text of ["(Dehors.)", "(Il ne pleut pas.)", "(Demain, la pluie tombe.)", "NORA: La pluie tombe."]) {
    const expected = parseTheatreItems(text);
    assert.equal(validateAmbience({ ...recommendation, evidenceQuote: expected[0].text }, expected).environment, "none");
  }
});

test("invalid ambience is independently disabled without discarding valid dramatic annotations", () => {
  const items = parseTheatreItems(rainText), value = analysisFor(items);
  value.ambience = { environment: "thunderous crowd", arbitrary: "no" };
  const analysis = validateDramaticAnalysis(value, items);
  assert.equal(analysis.ambience.environment, "none");
  assert.deepEqual(analysis.items, value.items); assert.deepEqual(analysis.scene, value.scene);
  value.ambience = recommendation;
  assert.equal(validateDramaticAnalysis(value, items).ambience.environment, "rain");
});

test("local provider offers only original deterministic rain WAV, with no fetched assets", async () => {
  assert.equal(localAmbienceProvider("none"), null);
  const first = localAmbienceProvider("rain"), second = localAmbienceProvider("rain");
  assert.equal(first.type, "audio/wav");
  assert.deepEqual(Buffer.from(await first.arrayBuffer()), Buffer.from(await second.arrayBuffer()));
  assert.equal(Buffer.from(await first.arrayBuffer()).subarray(0, 4).toString(), "RIFF");
});

async function rainSession() {
  const env = environment(); let requests = 0;
  const session = new ReadingPlaybackSession(env, async () => { requests++; return Response.json(chorusScene(rainText)); });
  await session.start(rainText, "normal");
  return { env, session, requests: () => requests };
}
test("ambience defaults Off, loops independently, persists over advancement, and levels affect only ambience", async () => {
  const { env, session } = await rainSession();
  assert.equal(env.audios.length, 1);
  session.setAmbienceLevel("low"); const ambience = env.latest(), voice = env.audios[0];
  assert.equal(ambience.loop, true); assert.equal(ambience.volume, 0.08);
  voice.end(); assert.equal(ambience.removed, false); assert.equal(ambience.playCalls, 1);
  session.setAmbienceLevel("medium"); assert.equal(ambience.volume, 0.16);
  assert.equal(voice.volume, undefined); assert.equal(ambience.playCalls, 1);
  session.setAmbienceLevel("off"); assert.equal(ambience.removed, true);
  session.dispose(); assert.deepEqual(env.revoked, env.created.map(({ url }) => url));
});

test("repeated chorus replay uses cached voices, does not restart ambience or regenerate TTS", async () => {
  const { env, session, requests } = await rainSession();
  session.setAmbienceLevel("low"); const ambience = env.latest();
  env.audios[0].end(); env.latest().end(); await flush(); // chorus
  for (let i = 0; i < 12; i++) {
    session.theatre.replay(); await flush();
    assert.equal(session.getSnapshot().theatre.currentItemId, "line-3");
    assert.ok(env.audios.slice(-3).every((a) => a.currentTime === 0 && a.playCalls === 1));
  }
  assert.equal(requests(), 1); assert.equal(ambience.playCalls, 1); assert.equal(ambience.removed, false);
  session.dispose(); assert.deepEqual([...env.revoked].sort(), env.created.map(({ url }) => url).sort());
});

for (const ending of ["stop", "replacement", "unmount", "error", "complete"]) {
  test(`${ending} cleans every layer; stale ambience callbacks cannot affect a new scene`, async () => {
    const { env, session } = await rainSession(); session.setAmbienceLevel("low");
    const ambience = env.latest(), stale = ambience.onerror;
    if (ending === "error") env.audios[0].fail();
    else if (ending === "complete") {
      env.audios[0].end(); env.latest().end(); await flush();
      env.audios.slice(-3).forEach((a) => a.end()); env.latest().end();
    } else if (ending === "unmount") session.dispose();
    else session.stop();
    assert.equal(ambience.removed, true);
    if (ending !== "unmount") {
      session.stop(); await session.start(rainText, "normal");
      stale(new Event("error"));
      assert.equal(session.getSnapshot().theatre.status, "playing");
    }
    session.dispose(); assert.deepEqual([...env.revoked].sort(), env.created.map(({ url }) => url).sort());
  });
}

test("ambience media failure, provider failure and rejected play fail silent without changing dialogue", async () => {
  const { env, session } = await rainSession(); session.setAmbienceLevel("low");
  const ambience = env.latest(); ambience.fail();
  assert.equal(ambience.removed, true); assert.equal(session.getSnapshot().theatre.status, "playing");
  env.audios[0].end(); assert.equal(env.audios.filter((a) => a.loop).length, 1, "no retry loop on item changes");
  session.dispose();
  for (const rejected of [false, true]) {
    const other = environment();
    if (rejected) other.nextPlay = Promise.reject(new Error("blocked"));
    const layer = new AmbiencePlayback(other, () => { if (!rejected) throw new Error("provider"); return new Blob(["rain"]); });
    layer.configure("rain"); layer.setLevel("low"); layer.setActive(true); await flush();
    assert.ok(other.audios.every((a) => a.removed)); layer.stop();
  }
});

function recorderEnvironment(onPermission, failPermission = false) {
  const tracks = [], recorders = [];
  return {
    tracks, recorders,
    async getUserMedia() {
      onPermission(); if (failPermission) throw new Error("denied");
      const track = { stopped: false, stop() { this.stopped = true; } }; tracks.push(track);
      return { getTracks: () => [track] };
    },
    createRecorder() {
      const recorder = { state: "inactive", ondataavailable: null, onstop: null, onerror: null,
        start() { this.state = "recording"; },
        stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["voice"]) }); this.onstop?.(); } };
      recorders.push(recorder); return recorder;
    },
    fetch: async () => Response.json({ summary: null, score: null, weakPoints: [] }),
  };
}
for (const ending of ["finish", "cancel", "error", "permission_denied"]) {
  test(`microphone ${ending}: all chorus voices and ambience suspended before permission; only ambience restores`, async () => {
    const { env, session } = await rainSession(); session.setAmbienceLevel("low"); const ambience = env.latest();
    env.audios[0].end(); env.latest().end(); await flush(); const voices = env.audios.slice(-3);
    const recording = recorderEnvironment(() => {
      assert.equal(ambience.volume, 0); assert.ok(ambience.pauseCalls > 0);
      assert.ok(voices.every((a) => a.pauseCalls > 0));
      assert.equal(session.getSnapshot().theatre.status, "paused");
    }, ending === "permission_denied");
    const pronunciation = new PronunciationSession(recording, session.beginMicrophoneCapture);
    await pronunciation.start({ text: "Bonjour." });
    const count = env.audios.length;
    session.theatre.replay(); session.theatre.resume();
    if (ending !== "permission_denied") {
      assert.equal(env.audios.length, count); assert.ok(voices.every((a) => a.playCalls === 1));
      if (ending === "finish") pronunciation.stop();
      if (ending === "cancel") pronunciation.reset();
      if (ending === "error") recording.recorders[0].onerror();
    }
    assert.equal(ambience.volume, 0.08); assert.equal(ambience.playCalls, 2);
    if (ending !== "permission_denied") assert.equal(session.getSnapshot().theatre.status, "paused");
    assert.ok(recording.tracks.every((t) => t.stopped));
    pronunciation.dispose(); session.dispose();
  });
}

test("paused non-current practice retains its bookmark across microphone capture and restores ambience setting", async () => {
  const { env, session } = await rainSession(); session.setAmbienceLevel("medium"); const ambience = env.latest();
  env.audios[0].progress(2.75); session.theatre.pause(); session.theatre.enterPractice("line-2");
  session.theatre.replay(); const model = env.latest();
  const recording = recorderEnvironment(() => { assert.ok(model.pauseCalls > 0); assert.equal(ambience.volume, 0); });
  const pronunciation = new PronunciationSession(recording, session.beginMicrophoneCapture);
  await pronunciation.start(session.getSnapshot().theatre.practiceTarget); pronunciation.stop();
  assert.equal(ambience.volume, 0.16);
  session.theatre.finishPractice(); assert.equal(session.getSnapshot().theatre.status, "paused");
  assert.equal(env.latest().currentTime, 2.75); assert.equal(env.latest().playCalls, 0);
  pronunciation.dispose(); session.dispose();
});

test("capture protects delayed generation and nested release cannot resume speech or override Off", async () => {
  const env = environment(), response = deferred();
  const session = new ReadingPlaybackSession(env, () => response.promise);
  const pending = session.start(rainText, "normal"), release1 = session.beginMicrophoneCapture(), release2 = session.beginMicrophoneCapture();
  session.setAmbienceLevel("low"); response.resolve(Response.json(chorusScene(rainText))); await pending;
  assert.equal(session.getSnapshot().theatre.status, "paused");
  assert.ok(env.audios.every((a) => a.playCalls === 0));
  release1(); release1(); session.theatre.resume();
  assert.ok(env.audios.every((a) => a.playCalls === 0));
  session.setAmbienceLevel("off"); release2();
  assert.ok(env.audios.every((a) => a.playCalls === 0)); session.dispose();
});

test("late microphone permission after cancellation closes tracks; release after Stop cannot restart ambience", async () => {
  const { env, session } = await rainSession(); session.setAmbienceLevel("low"); const permission = deferred();
  const pronunciation = new PronunciationSession({ getUserMedia: () => permission.promise,
    createRecorder() { assert.fail("cancelled recorder"); }, fetch() { assert.fail(); } }, session.beginMicrophoneCapture);
  const pending = pronunciation.start({ text: "Bonjour." }); session.stop(); pronunciation.reset();
  let stopped = false;
  permission.resolve({ getTracks: () => [{ stop() { stopped = true; } }] }); await pending;
  assert.equal(stopped, true); assert.ok(env.audios.every((a) => a.removed));
  assert.equal(session.getSnapshot().theatre.status, "idle"); pronunciation.dispose(); session.dispose();
});

test("ordinary and poetry have no ambience; microphone hook silences their existing audio", async () => {
  for (const text of ["Un passage.", "Un\nDeux\nTrois\n\nQuatre\nCinq\nSix"]) {
    const env = environment(), session = new ReadingPlaybackSession(env, async () => new Response("audio"));
    session.setAmbienceLevel("medium"); await session.start(text, "normal");
    assert.equal(env.audios.length, 1); const ordinary = env.latest();
    const recording = recorderEnvironment(() => assert.ok(ordinary.pauseCalls > 0));
    const pronunciation = new PronunciationSession(recording, session.beginMicrophoneCapture);
    await pronunciation.start({ text }); pronunciation.stop();
    assert.equal(ordinary.playCalls, 1); assert.equal(env.audios.length, 1);
    pronunciation.dispose(); session.dispose();
  }
});

test("final chorus at a paused ended boundary completes once on Resume", async () => {
  const text = "NORA: Bonjour.\nCHŒUR: Ensemble !";
  const env = environment(), controller = new TheatrePlaybackController(env);
  controller.acceptScene(controller.beginLoading(), chorusScene(text), text);
  env.latest().end(); await flush(); const voices = env.audios.slice(-3);
  controller.pause(); voices.forEach((a) => a.end());
  assert.equal(controller.getSnapshot().status, "paused");
  controller.resume(); controller.resume();
  assert.equal(controller.getSnapshot().status, "completed");
  assert.equal(controller.getSnapshot().completions.length, 2);
  assert.deepEqual(env.revoked, env.created.map(({ url }) => url)); controller.dispose();
});

test("obsolete chorus play rejection cannot fail a paused group or a newer replay", async () => {
  const env = environment(), pending = deferred(); env.nextPlay = pending.promise;
  const controller = new TheatrePlaybackController(env);
  controller.acceptScene(controller.beginLoading(), chorusScene(), chorusText); await flush();
  controller.pause(); pending.reject(new Error("old play")); await flush();
  assert.equal(controller.getSnapshot().status, "paused");
  controller.replay(); await flush(); assert.equal(controller.getSnapshot().status, "replaying");
  controller.dispose();
});

test("obsolete ambience play rejection after capture starts cannot disable later restoration", async () => {
  const env = environment(), pending = deferred(); env.nextPlay = pending.promise;
  const layer = new AmbiencePlayback(env); layer.configure("rain"); layer.setLevel("low"); layer.setActive(true);
  const ambience = env.latest(); layer.setMuted(true);
  pending.reject(new Error("paused")); await flush();
  ambience.playResult = null; layer.setMuted(false);
  assert.equal(ambience.removed, false); assert.equal(ambience.volume, 0.08); assert.equal(ambience.playCalls, 2);
  layer.stop();
});
