const test = require("node:test");
const assert = require("node:assert/strict");
const { source, scene, deferred, flush, environment, load } = require("./playback-fixtures.cjs");
const { ReadingPlaybackSession } = load("lib/reading-playback.ts");

test("rapid Play actions share one generation; replay uses cached audio without another request", async () => {
  const env = environment(), response = deferred();
  const calls = [];
  const session = new ReadingPlaybackSession(env, (...args) => { calls.push(args); return response.promise; });
  const first = session.start(source, "slow");
  assert.equal(session.getSnapshot().theatre.status, "loading");
  assert.equal(session.getSnapshot().busy, true);
  await Promise.all([session.start(source, "slow"), session.start(source, "slow")]);
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0][1].body), { text: source, speed: "slow", language: "fr" });
  response.resolve(Response.json(scene())); await first;
  session.theatre.replay(); session.theatre.replay();
  assert.equal(calls.length, 1);
  assert.equal(session.getSnapshot().mode, "theatre");
  assert.equal(env.audios.filter((audio) => !audio.removed).length, 1);
  session.dispose();
});

test("Stop during generation settles start immediately; stale response cannot replace a newer scene", async () => {
  const env = environment(), responses = [deferred(), deferred()];
  const signals = [];
  const session = new ReadingPlaybackSession(env, (_url, options) => {
    signals.push(options.signal); return responses[signals.length - 1].promise;
  });
  const old = session.start(source, "normal");
  session.stop(); await old;
  assert.equal(signals[0].aborted, true);
  const replacementSource = "NORA: Nouveau.\nSAMIR: Bonjour.";
  const replacement = session.start(replacementSource, "fast");
  responses[1].resolve(Response.json(scene(replacementSource))); await replacement;
  const newSessionId = session.getSnapshot().theatre.sessionId;
  responses[0].resolve(Response.json(scene())); await flush();
  assert.equal(session.getSnapshot().theatre.sessionId, newSessionId);
  assert.equal(session.getSnapshot().theatre.queue[0].text, "Nouveau.");
  assert.equal(env.audios.length, 1);
  session.dispose();
});

test("stale JSON body resolution and generation rejection are ignored after unmount", async () => {
  const env = environment(), body = deferred();
  const session = new ReadingPlaybackSession(env, async () => ({
    ok: true, headers: new Headers({ "Content-Type": "application/json" }), json: () => body.promise,
  }));
  const started = session.start(source, "normal"); await flush();
  session.dispose(); await started;
  body.resolve(scene()); await flush();
  assert.equal(env.audios.length, 0);
  assert.equal(session.getSnapshot().mode, null);

  const failed = deferred();
  const other = new ReadingPlaybackSession(environment(), () => failed.promise);
  const pending = other.start(source, "normal"); other.dispose(); await pending;
  failed.reject(new Error("obsolete connection error")); await flush();
  assert.equal(other.getSnapshot().error, null);
});

test("integrity failure never starts audio; identified clip failure remains in the controller", async () => {
  const damaged = scene(); damaged.clips.pop();
  const env = environment();
  const invalid = new ReadingPlaybackSession(env, async () => Response.json(damaged));
  await invalid.start(source, "normal");
  assert.equal(env.audios.length, 0);
  assert.equal(invalid.getSnapshot().theatre.status, "error");
  assert.equal(invalid.getSnapshot().busy, false);
  invalid.dispose();
  const valid = new ReadingPlaybackSession(env, async () => Response.json(scene()));
  await valid.start(source, "normal"); env.latest().fail();
  assert.equal(valid.getSnapshot().theatre.error.itemId, "line-1");
  assert.equal(valid.getSnapshot().theatre.currentIndex, 0);
  valid.dispose();
});

for (const [mode, text] of [
  ["standard", "Un passage ordinaire sans dialogue."],
  ["poetry", "Un vers\nDeux vers\nTrois vers\n\nQuatre vers\nCinq vers\nSix vers"],
]) {
  for (const speed of ["very-slow", "slow", "normal", "fast"]) {
    test(`${mode} ${speed}: French-anchored request, one blob/Audio, automatic completion and stop cleanup`, async () => {
      const env = environment(), requests = [];
      const bytes = new Uint8Array([0xff, 0xfb, 1, 2]);
      const session = new ReadingPlaybackSession(env, async (url, options) => {
        requests.push({ url, body: JSON.parse(options.body) });
        return new Response(bytes, { headers: { "Content-Type": "audio/mpeg", "X-Reading-Mode": mode } });
      });
      await session.start(text, speed);
      assert.deepEqual(requests, [{ url: "/api/read-passage", body: { text, speed, language: "fr" } }]);
      assert.equal(session.getSnapshot().mode, "ordinary");
      assert.equal(env.audios.length, 1);
      assert.deepEqual(new Uint8Array(await env.created[0].blob.arrayBuffer()), bytes);
      assert.equal(env.latest().playCalls, 1);
      env.latest().end();
      assert.equal(session.getSnapshot().busy, false);
      await session.start(text, speed);
      session.stop();
      assert.deepEqual(env.revoked, env.created.map(({ url }) => url));
      assert.equal(session.getSnapshot().mode, null);
      session.dispose();
    });
  }
}

test("ordinary error and rejected play release resources; stale callbacks cannot stop replacement", async () => {
  const env = environment();
  const session = new ReadingPlaybackSession(env, async () => new Response("audio"));
  await session.start("ordinary", "normal");
  const old = env.latest().onended;
  session.stop();
  await session.start("new ordinary", "normal"); old(new Event("ended"));
  assert.equal(session.getSnapshot().busy, true);
  env.latest().fail();
  assert.equal(session.getSnapshot().busy, false);
  const failure = deferred(); env.nextPlay = failure.promise;
  await session.start("ordinary", "normal");
  failure.reject(new Error("blocked")); await flush();
  assert.equal(session.getSnapshot().busy, false);
  assert.ok(session.getSnapshot().error);
  assert.deepEqual(env.revoked, env.created.map(({ url }) => url));
  session.dispose();
});
