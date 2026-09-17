const test = require("node:test");
const assert = require("node:assert/strict");
const createLoader = require("./load-typescript.cjs");

// This test file runs in its own node:test process. Replace, never inspect, any
// inherited credential. Every route import substitutes OpenAI with a mock.
process.env.OPENAI_API_KEY = "test-only-placeholder";

function routeWith(speech) {
  class MockOpenAI {
    constructor() { this.audio = { speech: { create: speech } }; }
  }
  return createLoader({ openai: MockOpenAI })("app/api/read-passage/route.ts").POST;
}

function request(text, speed, contentType = "theatre") {
  return new Request("http://localhost/api/read-passage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, contentType, ...(speed === undefined ? {} : { speed }) }),
  });
}

const source = (count) => Array.from({ length: count }, (_, i) =>
  i % 7 === 0 ? `(Direction ${i + 1}.)` : `PERSONNE ${i % 3}: Réplique ${i + 1}.`
).join("\n");

for (const count of [39, 40, 41, 60, 100]) {
  test(`POST returns all ${count} ordered theatre items including stage directions`, async () => {
    let active = 0;
    let peak = 0;
    const calls = [];
    const post = routeWith(async (body) => {
      calls.push(body);
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, calls.length % 4));
      active--;
      return { arrayBuffer: async () => Buffer.from(body.input) };
    });
    const response = await post(request(source(count), "normal"));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /application\/json/);
    const data = await response.json();
    assert.equal(peak, 3);
    assert.equal(active, 0);
    assert.equal(calls.length, count);
    assert.equal(data.clips.length, count);
    assert.deepEqual(data.integrity, {
      version: 1,
      parsedItemCount: count,
      expectedItemIds: Array.from({ length: count }, (_, i) => `line-${i + 1}`),
      generatedClipCount: count,
    });
    data.clips.forEach((clip, i) => {
      assert.equal(clip.id, `line-${i + 1}`);
      assert.equal(clip.index, i);
      assert.deepEqual(clip.sourceLines, [i + 1]);
      assert.equal(clip.text, i % 7 === 0 ? `(Direction ${i + 1}.)` : `Réplique ${i + 1}.`);
      assert.equal(Buffer.from(clip.audioBase64, "base64").toString(), clip.text);
    });
    assert.ok(calls.every((call) => call.model === "gpt-4o-mini-tts"));
  });
}

test("POST failure identifies both rejected TTS and failed body reads without partial success", async () => {
  const calls = [];
  const post = routeWith(async (body) => {
    calls.push(body.input);
    if (body.input === "Réplique 2.") throw new Error("sensitive upstream diagnostic");
    if (body.input === "Réplique 41.") return { arrayBuffer: async () => { throw new Error("sensitive body read diagnostic"); } };
    return { arrayBuffer: async () => Buffer.from(body.input) };
  });
  const response = await post(request(source(60)));
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.mode, undefined);
  assert.equal(body.clips, undefined);
  assert.deepEqual(body.error, {
    code: "THEATRE_GENERATION_FAILED",
    message: "Theatre audio generation failed for one or more items.",
    failedItems: [
      { id: "line-2", index: 1, sourceLines: [2] },
      { id: "line-41", index: 40, sourceLines: [41] },
    ],
    parsedItemCount: 60,
    expectedClipCount: 60,
    generatedClipCount: 58,
  });
  assert.equal(calls.length, 60);
  assert.ok(!JSON.stringify(body).includes("sensitive"));
});

test("empty theatre audio fails rather than becoming a successful clip", async () => {
  const post = routeWith(async () => ({ arrayBuffer: async () => Buffer.alloc(0) }));
  const response = await post(request("Nora: Bonjour.\nSamir: Salut."));
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.error.generatedClipCount, 0);
  assert.deepEqual(body.error.failedItems.map((item) => item.id), ["line-1", "line-2"]);
});

for (const [mode, text] of [
  ["standard", "Voici un texte ordinaire. Il conserve sa lecture habituelle."],
  ["poetry", "Un vers\nDeux vers\nTrois vers\n\nQuatre vers\nCinq vers\nSix vers"],
]) {
  for (const [speed, expected] of [["very-slow", 0.7], ["slow", 0.85], ["normal", 1], ["fast", 1.15], [undefined, 1]]) {
    test(`${mode} ${speed ?? "default"}: existing single-audio contract and speed are preserved`, async () => {
      const calls = [];
      const bytes = Buffer.from([0xff, 0xfb, 0x01, 0x02]);
      const post = routeWith(async (body) => { calls.push(body); return { arrayBuffer: async () => bytes }; });
      const response = await post(request(text, speed, mode === "standard" ? "news" : "poetry"));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "audio/mpeg");
      assert.equal(response.headers.get("x-reading-mode"), mode);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
      assert.deepEqual(calls, [{ model: "gpt-4o-mini-tts", voice: "alloy", input: text, speed: expected }]);
    });
  }
}

test("missing text retains the existing 400 response without TTS", async () => {
  const post = routeWith(async () => { assert.fail("must not call speech"); });
  const response = await post(request(""));
  assert.equal(response.status, 400);
  assert.equal(await response.text(), "Texte ou type invalide.");
});
