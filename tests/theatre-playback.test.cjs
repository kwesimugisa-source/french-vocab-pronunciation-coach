const test = require("node:test");
const assert = require("node:assert/strict");
const { source, scene, setup, deferred, flush } = require("./playback-fixtures.cjs");

test("practice model pause/resume preserves the same audio and position without advancing", () => {
  const { env, controller } = setup();
  controller.enterPractice("line-2"); controller.replay();
  const audio = env.latest(); audio.progress(2.5);
  controller.pause();
  assert.equal(controller.getSnapshot().modelPaused, true);
  assert.equal(env.timers.size, 0);
  controller.resume();
  assert.equal(env.latest(), audio);
  assert.equal(audio.currentTime, 2.5);
  assert.equal(audio.playCalls, 2);
  audio.end();
  assert.equal(controller.getSnapshot().status, "practising");
  assert.equal(controller.getSnapshot().currentIndex, 0);
  assert.equal(controller.getSnapshot().completions.length, 0);
  controller.replay(); controller.pause(); controller.suspendPracticeAudio();
  assert.equal(controller.getSnapshot().modelPaused, false);
  controller.dispose();
});

test("queued watchdog callbacks are obsolete after progress, pause, and replacement", () => {
  const { env, controller } = setup();
  const beforeProgress = [...env.timers.values()][0];
  env.latest().progress(1);
  beforeProgress();
  assert.equal(controller.getSnapshot().status, "playing");
  const beforePause = [...env.timers.values()][0];
  controller.pause();
  beforePause();
  assert.equal(controller.getSnapshot().status, "paused");
  controller.resume();
  const beforeReplacement = [...env.timers.values()][0];
  const sessionId = controller.beginLoading();
  controller.acceptScene(sessionId, scene(), source);
  beforeReplacement();
  assert.equal(controller.getSnapshot().status, "playing");
  assert.equal(controller.getSnapshot().currentIndex, 0);
  controller.dispose();
});

test("100-item automatic playback completes every ID exactly once, in order, without interaction", () => {
  const text = Array.from({ length: 100 }, (_, i) => i % 8 === 0 ? `(Direction ${i}.)` : `NORA: Réplique ${i}.`).join("\n");
  const { env, controller, data } = setup(text);
  const heard = [];
  for (let i = 0; i < 100; i++) {
    assert.equal(controller.getSnapshot().status, "playing");
    assert.equal(controller.getSnapshot().currentIndex, i);
    heard.push(controller.getSnapshot().currentItemId);
    const callback = env.latest().onended;
    env.latest().end();
    callback(new Event("ended")); // duplicate queued event must not advance twice
  }
  assert.deepEqual(heard, data.integrity.expectedItemIds);
  assert.deepEqual(controller.getSnapshot().completions, heard.map((itemId) => ({ itemId, via: "audio" })));
  assert.equal(controller.getSnapshot().status, "completed");
  assert.equal(controller.getSnapshot().automaticAdvancement, false);
  assert.equal(env.audios.length, 100);
  assert.deepEqual(env.revoked, env.created.map(({ url }) => url));
  assert.ok(env.audios.every((audio) => audio.removed && audio.loadCalls === 1));
  assert.equal(env.timers.size, 0);
});

test("pause mid-line retains the same Audio and position; resume advances only after completion", () => {
  const { env, controller } = setup();
  const audio = env.latest();
  audio.progress(4.25);
  controller.pause();
  assert.equal(controller.getSnapshot().status, "paused");
  assert.equal(controller.getSnapshot().currentIndex, 0);
  assert.equal(controller.getSnapshot().completions.length, 0);
  assert.equal(env.timers.size, 0);
  assert.equal(audio.currentTime, 4.25);
  controller.resume();
  assert.equal(env.latest(), audio);
  assert.equal(audio.currentTime, 4.25);
  assert.equal(audio.playCalls, 2);
  assert.equal(controller.getSnapshot().status, "playing");
  audio.end();
  assert.equal(controller.getSnapshot().currentIndex, 1);
  controller.dispose();
});

test("pause at an ended boundary resumes with one advancement, not a restarted item", () => {
  const { env, controller } = setup();
  controller.pause();
  env.latest().end();
  assert.equal(controller.getSnapshot().currentIndex, 0);
  controller.resume();
  controller.resume();
  assert.equal(controller.getSnapshot().currentIndex, 1);
  assert.equal(controller.getSnapshot().completions.length, 1);
  controller.dispose();
});

test("unlimited replay including replay-while-replaying invalidates obsolete attempts", () => {
  const { env, controller } = setup();
  env.latest().end();
  const original = env.latest();
  original.progress(2);
  for (let i = 0; i < 25; i++) {
    const old = env.latest();
    const staleEnd = old.onended;
    controller.replay();
    assert.equal(old.removed, true);
    assert.equal(env.latest().currentTime, 0);
    assert.equal(controller.getSnapshot().status, "replaying");
    assert.equal(controller.getSnapshot().currentItemId, "line-2");
    staleEnd(new Event("ended"));
    assert.equal(controller.getSnapshot().currentIndex, 1);
  }
  controller.pause();
  controller.resume();
  assert.equal(controller.getSnapshot().status, "replaying");
  env.latest().end();
  assert.equal(controller.getSnapshot().currentIndex, 2);
  assert.deepEqual(controller.getSnapshot().completions.map((entry) => entry.itemId), ["line-1", "line-2"]);
  controller.dispose();
});

test("current dialogue practice holds exact identity/text; model replay cannot advance; finish advances once", () => {
  const { env, controller, sessionId } = setup();
  assert.equal(controller.enterPractice("line-1"), false, "stage direction is not practiceable");
  assert.equal(controller.enterPractice("line-6"), false, "chorus is not practiceable in this checkpoint");
  env.latest().end();
  assert.equal(controller.enterPractice("line-2"), true);
  assert.deepEqual(controller.getSnapshot().practiceTarget, {
    sessionId, itemId: "line-2", index: 1, speaker: "NORA", text: "Bonjour.",
  });
  assert.equal(controller.getSnapshot().automaticAdvancement, false);
  for (let i = 0; i < 5; i++) {
    controller.replay();
    env.latest().end();
    assert.equal(controller.getSnapshot().status, "practising");
    assert.equal(controller.getSnapshot().currentIndex, 1);
  }
  controller.replay();
  const stale = env.latest().onended;
  controller.suspendPracticeAudio();
  stale(new Event("ended"));
  assert.equal(controller.getSnapshot().modelPlaying, false);
  controller.finishPractice();
  controller.finishPractice();
  assert.equal(controller.getSnapshot().currentIndex, 2);
  assert.equal(controller.getSnapshot().practiceTarget, null);
  assert.deepEqual(controller.getSnapshot().completions, [{ itemId: "line-1", via: "audio" }, { itemId: "line-2", via: "practice" }]);
  controller.dispose();
});

for (const targetId of ["line-2", "line-5"]) {
  for (const paused of [false, true]) {
    test(`non-current practice (${targetId}, paused=${paused}) returns to saved cursor and position`, () => {
      const { env, controller } = setup();
      env.latest().end(); env.latest().end(); // current: SAMIR, index 2
      env.latest().progress(3.75);
      if (paused) controller.pause();
      const ledger = controller.getSnapshot().completions;
      assert.equal(controller.enterPractice(targetId), true);
      assert.equal(controller.enterPractice("line-3"), false, "finish current practice before changing targets");
      controller.replay(); env.latest().end();
      controller.finishPractice();
      assert.equal(controller.getSnapshot().currentItemId, "line-3");
      assert.equal(env.latest().currentTime, 3.75);
      assert.deepEqual(controller.getSnapshot().completions, ledger);
      assert.equal(controller.getSnapshot().status, paused ? "paused" : "playing");
      assert.equal(env.latest().playCalls, paused ? 0 : 1);
      controller.dispose();
    });
  }
}

test("practice on the final item completes the scene; completed-scene replay/practice never restarts it", () => {
  const { env, controller } = setup("NORA: Première.\nSAMIR: Dernière.");
  env.latest().end();
  controller.enterPractice("line-2"); controller.finishPractice();
  assert.equal(controller.getSnapshot().status, "completed");
  controller.replay(); env.latest().end();
  assert.equal(controller.getSnapshot().status, "completed");
  controller.enterPractice("line-1"); controller.replay(); env.latest().end(); controller.finishPractice();
  assert.equal(controller.getSnapshot().status, "completed");
  assert.equal(controller.getSnapshot().completions.length, 2);
  controller.dispose();
});

for (const action of ["playing", "paused", "replaying", "practising"]) {
  test(`Stop during ${action} invalidates callbacks and releases all resources`, () => {
    const { env, controller } = setup();
    if (action === "paused") controller.pause();
    if (action === "replaying") controller.replay();
    if (action === "practising") { controller.enterPractice("line-2"); controller.replay(); }
    const old = env.latest();
    const staleEnd = old.onended, staleError = old.onerror, staleProgress = old.ontimeupdate;
    controller.stop();
    const sessionId = controller.getSnapshot().sessionId;
    staleEnd(new Event("ended")); staleError(new Event("error")); staleProgress(new Event("timeupdate"));
    assert.equal(controller.getSnapshot().status, "idle");
    assert.equal(controller.getSnapshot().sessionId, sessionId);
    assert.equal(controller.getSnapshot().queue.length, 0);
    assert.equal(env.timers.size, 0);
    assert.deepEqual(env.revoked, env.created.map(({ url }) => url));
  });
}

test("replacement and unmount ignore stale playback sessions even when source IDs repeat", () => {
  const { env, controller, sessionId } = setup();
  const stale = env.latest().onended;
  const replacement = controller.beginLoading();
  assert.equal(controller.acceptScene(sessionId, scene(), source), false);
  controller.acceptScene(replacement, scene(), source);
  stale(new Event("ended"));
  assert.equal(controller.getSnapshot().currentIndex, 0);
  const end = env.latest().onended;
  controller.dispose(); end(new Event("ended"));
  assert.equal(controller.getSnapshot().status, "idle");
  assert.deepEqual(env.revoked, env.created.map(({ url }) => url));
});

test("audio error reports current item, preserves cursor, and retry uses cached audio", () => {
  const { env, controller } = setup();
  env.latest().end(); env.latest().fail();
  assert.equal(controller.getSnapshot().status, "error");
  assert.equal(controller.getSnapshot().error.itemId, "line-2");
  assert.equal(controller.getSnapshot().currentIndex, 1);
  assert.equal(controller.getSnapshot().completions.length, 1);
  controller.replay(); env.latest().end();
  assert.equal(controller.getSnapshot().currentIndex, 2);
  controller.dispose();
});

test("rejected play fails the current attempt; a rejection from a paused/obsolete play is ignored", async () => {
  const { env, controller } = setup();
  const failure = deferred();
  env.nextPlay = failure.promise;
  controller.replay(); failure.reject(new Error("autoplay blocked")); await flush();
  assert.equal(controller.getSnapshot().error.itemId, "line-1");
  const obsolete = deferred();
  env.nextPlay = obsolete.promise; controller.replay(); controller.pause();
  obsolete.reject(new Error("pause interrupted play")); await flush();
  assert.equal(controller.getSnapshot().status, "paused");
  assert.equal(controller.getSnapshot().error, null);
  controller.dispose();
});

test("lack of media progress errors without skipping; real progress refreshes watchdog, pause clears it", () => {
  const { env, controller } = setup();
  const oldTimer = [...env.timers.keys()][0];
  env.latest().progress(1);
  assert.equal(env.timers.has(oldTimer), false);
  assert.equal(env.timers.size, 1);
  env.expire();
  assert.equal(controller.getSnapshot().status, "error");
  assert.equal(controller.getSnapshot().error.itemId, "line-1");
  assert.equal(controller.getSnapshot().completions.length, 0);
  controller.replay(); controller.pause();
  assert.equal(env.timers.size, 0);
  controller.dispose();
});
