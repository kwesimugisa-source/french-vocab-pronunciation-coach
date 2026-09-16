const test = require("node:test");
const assert = require("node:assert/strict");
const createLoader = require("./load-typescript.cjs");
const { source, parseTheatreItems, analysisFor } = require("./dramatic-fixtures.cjs");
const { environment, load, flush } = require("./playback-fixtures.cjs");
const { ReadingPlaybackSession } = load("lib/reading-playback.ts");
process.env.OPENAI_API_KEY = "test-only-placeholder";

function routeWith(analysisReply) {
  const analysisCalls = [], speechCalls = [];
  let analysesCompleted = 0;
  class MockOpenAI {
    constructor() {
      this.responses = { create: async (body, options) => {
        analysisCalls.push({ body, options });
        try {
          return analysisReply ? await analysisReply(body) : {
            status: "completed", output_text: JSON.stringify(analysisFor(JSON.parse(body.input[1].content).items)),
          };
        } finally { analysesCompleted++; }
      } };
      this.audio = { speech: { create: async (body) => {
        speechCalls.push({ body, analysesCompleted });
        return { arrayBuffer: async () => Buffer.from(body.input) };
      } } };
    }
  }
  return { post: createLoader({ openai: MockOpenAI })("app/api/read-passage/route.ts").POST, analysisCalls, speechCalls };
}
const request = (text, speed = "normal") => new Request("http://localhost/api/read-passage", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, speed }),
});

test("route sends supported instructions separately from exact text, with correct cast, IDs and speed", async () => {
  const text = "(La porte s’ouvre.)\nNORA: Bonjour…\nNous sommes ici.\nSAMIR: Enfin !\nCHŒUR: Ensemble !";
  const expected = parseTheatreItems(text), { post, analysisCalls, speechCalls } = routeWith();
  const response = await post(request(text, "fast"));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(analysisCalls.length, 1);
  assert.deepEqual(JSON.parse(analysisCalls[0].body.input[1].content).items, expected);
  assert.equal(data.direction.status, "analyzed");
  assert.deepEqual(data.integrity.expectedItemIds, ["line-1", "line-2", "line-4", "line-5"]);
  assert.deepEqual(speechCalls.map(({ body }) => body.input), expected.flatMap((item) =>
    item.speaker === "CHŒUR" ? [item.text, item.text, item.text] : [item.text]));
  assert.ok(speechCalls.every((call) => call.analysesCompleted === 1));
  for (const [sourceIndex, { body }] of speechCalls.entries()) {
    const i = Math.min(sourceIndex, 3);
    assert.deepEqual(Object.keys(body).sort(), ["input", "instructions", "model", "speed", "voice"]);
    assert.equal(body.model, "gpt-4o-mini-tts");
    assert.equal(body.voice, i === 3 ? data.clips[i].chorus.components[sourceIndex - 3].voice : data.clips[i].voice);
    assert.equal(body.speed, i === 0 ? Math.max(0.65, 1.15 - 0.15) : 1.15);
    assert.match(body.instructions, new RegExp(`tone=${i % 2 ? "warm" : "tense"}`));
    assert.equal(Buffer.from(data.clips[i].audioBase64, "base64").toString(), expected[i].text);
  }
  assert.match(speechCalls[0].body.instructions, /Narrate the stage direction/);
  assert.equal(speechCalls[0].body.voice, "cedar");
  assert.match(speechCalls[1].body.instructions, /Perform this character/);
  assert.match(speechCalls[3].body.instructions, /chorus as one clear voice/);
  assert.equal(speechCalls[3].body.voice, "echo");
});

for (const [name, reply] of [
  ["failed", async () => { throw new Error("private model error"); }],
  ["malformed", async () => ({ status: "completed", output_text: "invalid" })],
  ["omitted late item", async (body) => {
    const analysis = analysisFor(JSON.parse(body.input[1].content).items); analysis.items.pop();
    return { status: "completed", output_text: JSON.stringify(analysis) };
  }],
]) {
  test(`route ${name} analysis still synthesizes all 100 items with safe direction`, async () => {
    const { post, speechCalls, analysisCalls } = routeWith(reply);
    const response = await post(request(source(100)));
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(analysisCalls.length, 1); assert.equal(speechCalls.length, 100);
    assert.equal(data.clips.length, 100); assert.equal(data.clips.at(-1).id, "line-100");
    assert.equal(data.direction.status, "fallback");
    assert.equal(data.direction.fallbackItemCount, 100);
    assert.ok(speechCalls.every(({ body }) => body.instructions.includes("Default delivery")));
    assert.ok(!JSON.stringify(data).includes("private model error"));
  });
}

test("directed response works with unchanged playback, cached replay, practice, completion and cleanup", async () => {
  const { post, analysisCalls, speechCalls } = routeWith();
  const env = environment(); let requests = 0;
  const session = new ReadingPlaybackSession(env, (_url, options) => {
    requests++; return post(new Request("http://localhost/api/read-passage", options));
  });
  const text = "(Le rideau se lève.)\nNORA: Bonjour.\nSAMIR: Salut.\nCHŒUR: Ensemble !";
  await session.start(text, "normal");
  env.latest().end(); // current NORA
  env.latest().progress(3.25); session.theatre.pause();
  const original = env.latest(); session.theatre.resume();
  assert.equal(env.latest(), original); assert.equal(original.currentTime, 3.25);
  session.theatre.pause();
  session.theatre.enterPractice("line-3"); session.theatre.replay(); env.latest().end();
  session.theatre.finishPractice();
  assert.equal(session.getSnapshot().theatre.status, "paused");
  assert.equal(env.latest().currentTime, 3.25); assert.equal(env.latest().playCalls, 0);
  session.theatre.enterPractice("line-2");
  for (let i = 0; i < 10; i++) { session.theatre.replay(); env.latest().end(); }
  assert.equal(session.getSnapshot().theatre.practiceTarget.text, "Bonjour.");
  session.theatre.finishPractice();
  assert.equal(session.getSnapshot().theatre.currentItemId, "line-3");
  const stale = env.latest().onended;
  session.theatre.replay(); stale(new Event("ended"));
  assert.equal(session.getSnapshot().theatre.currentItemId, "line-3");
  env.latest().end(); // chorus
  assert.equal(session.theatre.enterPractice("line-4"), false);
  await flush();
  env.audios.slice(-3).forEach((audio) => audio.end());
  assert.equal(session.getSnapshot().theatre.status, "completed");
  assert.equal(session.getSnapshot().theatre.completions.length, 4);
  assert.equal(requests, 1); assert.equal(analysisCalls.length, 1); assert.equal(speechCalls.length, 6);
  session.dispose();
  assert.equal(env.timers.size, 0);
  assert.deepEqual(env.revoked, env.created.map(({ url }) => url));
});

test("ordinary reading and poetry never invoke dramatic analysis or add instructions", async () => {
  const { post, analysisCalls, speechCalls } = routeWith(async () => assert.fail("no scene analysis"));
  for (const text of ["Un texte ordinaire.", "Un\nDeux\nTrois\n\nQuatre\nCinq\nSix"]) {
    const response = await post(request(text, "slow"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "audio/mpeg");
  }
  assert.equal(analysisCalls.length, 0);
  assert.ok(speechCalls.every(({ body }) => body.instructions === undefined && body.speed === 0.85 && body.voice === "alloy"));
});
