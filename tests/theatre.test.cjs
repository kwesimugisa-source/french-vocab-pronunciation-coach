const test = require("node:test");
const assert = require("node:assert/strict");
const createLoader = require("./load-typescript.cjs");
const load = createLoader();
const { parseTheatreItems, assertCompleteTheatreResponse } = load("lib/theatre.ts");
const { generateTheatreResponse, TheatreGenerationError, THEATRE_TTS_CONCURRENCY } = load("lib/theatre-generation.ts");

const audio = (text) => Buffer.from(text).toString("base64");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fixture = (count, words = 3) => Array.from({ length: count }, (_, i) =>
  `PERSONNE ${i % 4}: Réplique ${i + 1} ${Array(words).fill("bonjour").join(" ")}`
).join("\n");
const wordCount = (text) => text.split(/\s+/).length;

test("parser retains ordered stage items, normalized speakers and multi-line répliques", () => {
  const source = "(Le rideau se lève.)\r\n Nora : Bonjour.\r\nJe suis ici.\r\n\r\n(Nora sourit.)\r\nSAMIR： Salut !\r\nnora: Revenons demain.\r\nCHŒUR: Ensemble !";
  const items = parseTheatreItems(source);
  assert.deepEqual(items, [
    { id: "line-1", index: 0, type: "stage", speaker: "NARRATOR", text: "(Le rideau se lève.)", sourceLines: [1] },
    { id: "line-2", index: 1, type: "dialogue", speaker: "NORA", text: "Bonjour. Je suis ici.", sourceLines: [2, 3] },
    { id: "line-5", index: 2, type: "stage", speaker: "NARRATOR", text: "(Nora sourit.)", sourceLines: [5] },
    { id: "line-6", index: 3, type: "dialogue", speaker: "SAMIR", text: "Salut !", sourceLines: [6] },
    { id: "line-7", index: 4, type: "dialogue", speaker: "NORA", text: "Revenons demain.", sourceLines: [7] },
    { id: "line-8", index: 5, type: "dialogue", speaker: "CHŒUR", text: "Ensemble !", sourceLines: [8] },
  ]);
  assert.deepEqual(parseTheatreItems(source), items, "identities are stable across repeated parses");
  assert.equal(items.filter((item) => item.type === "dialogue")[0].text, "Bonjour. Je suis ici.");
});

test("existing blank/empty-label/unlabelled and inline-direction grammar is preserved", () => {
  const items = parseTheatreItems("\nIntroduction\nNORA:\nL’AMI: Oui (sourit).\n\nEncore.\nl'ami: Oui (sourit).");
  assert.deepEqual(items.map(({ id, type, speaker, text, sourceLines }) => ({ id, type, speaker, text, sourceLines })), [
    { id: "line-2", type: "stage", speaker: "NARRATOR", text: "Introduction", sourceLines: [2] },
    { id: "line-4", type: "dialogue", speaker: "L'AMI", text: "Oui (sourit). Encore.", sourceLines: [4, 6] },
    { id: "line-7", type: "dialogue", speaker: "L'AMI", text: "Oui (sourit).", sourceLines: [7] },
  ]);
});

for (const count of [39, 40, 41, 60, 100]) {
  test(`${count} segments: each source item generates and returns exactly once`, async () => {
    const text = fixture(count);
    const calls = [];
    const response = await generateTheatreResponse(text, 1, async ({ text }) => {
      calls.push(text);
      return audio(text);
    });
    const expectedIds = Array.from({ length: count }, (_, i) => `line-${i + 1}`);
    assert.equal(calls.length, count);
    assert.equal(new Set(calls).size, count);
    assert.equal(response.integrity.parsedItemCount, count);
    assert.equal(response.integrity.generatedClipCount, count);
    assert.deepEqual(response.integrity.expectedItemIds, expectedIds);
    assert.deepEqual(response.clips.map((clip) => clip.id), expectedIds);
    assert.equal(new Set(response.clips.map((clip) => clip.id)).size, count);
    response.clips.forEach((clip, i) => {
      assert.equal(clip.index, i);
      assert.equal(clip.text, `Réplique ${i + 1} bonjour bonjour bonjour`);
      assert.equal(Buffer.from(clip.audioBase64, "base64").toString(), clip.text);
    });
    assertCompleteTheatreResponse(response, parseTheatreItems(text));
  });
}

test("word count and segment count are independent", async () => {
  for (const [count, words] of [[30, 45], [60, 1]]) {
    const text = fixture(count, words);
    assert.equal(wordCount(text) > 1000, count === 30);
    const response = await generateTheatreResponse(text, 1, async ({ text }) => audio(text));
    assert.equal(response.clips.length, count);
    assertCompleteTheatreResponse(response, parseTheatreItems(text));
  }
});

test("30 seeded randomized completion runs preserve order and respect three workers", async () => {
  assert.equal(THEATRE_TTS_CONCURRENCY, 3);
  for (let run = 1; run <= 30; run++) {
    let state = run;
    let active = 0;
    let peak = 0;
    let started = 0;
    const finished = [];
    const source = fixture(60);
    const response = await generateTheatreResponse(source, 1, async ({ text }) => {
      const position = started++;
      active++;
      peak = Math.max(peak, active);
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      // Ensure one inversion as well as reproducibly randomized later completions.
      await delay(position === 0 ? 12 : state % 4);
      finished.push(position);
      active--;
      return audio(text);
    });
    assert.equal(peak, 3);
    assert.equal(active, 0);
    assert.equal(started, 60);
    assert.notDeepEqual(finished, Array.from({ length: 60 }, (_, i) => i));
    assertCompleteTheatreResponse(response, parseTheatreItems(source));
  }
});

test("stage directions use dedicated narrator, characters stay consistent, and all speeds are preserved", async () => {
  const text = "(La porte s'ouvre.)\nNora: Oui.\nSamir: Non.\n(Nora attend.)\nnora: Encore.\nCHŒUR: Ensemble !";
  for (const speed of [0.7, 0.85, 1, 1.15]) {
    const response = await generateTheatreResponse(text, speed, async ({ text }) => audio(text));
    assert.deepEqual(response.clips.map((clip) => clip.voice), ["cedar", "alloy", "ash", "cedar", "alloy", "echo"]);
    response.clips.forEach((clip) => assert.equal(clip.speed,
      clip.type === "stage" ? Math.max(0.65, speed - 0.15) : Math.max(0.95, speed)));
    assertCompleteTheatreResponse(response, parseTheatreItems(text));
  }
});

test("failed and empty audio items stay identifiable; remaining expected items are attempted", async () => {
  let calls = 0;
  await assert.rejects(generateTheatreResponse(fixture(60), 1, async ({ text }) => {
    calls++;
    if (text.startsWith("Réplique 2 ")) { await delay(4); throw new Error("private upstream body"); }
    if (text.startsWith("Réplique 41 ")) return "";
    return audio(text);
  }), (error) => {
    assert.ok(error instanceof TheatreGenerationError);
    assert.deepEqual(error.failedItems, [
      { id: "line-2", index: 1, sourceLines: [2] },
      { id: "line-41", index: 40, sourceLines: [41] },
    ]);
    assert.equal(error.parsedItemCount, 60);
    assert.equal(error.generatedClipCount, 58);
    assert.ok(!JSON.stringify(error).includes("private upstream body"));
    return true;
  });
  assert.equal(calls, 60);
});

test("client contract validation rejects missing, duplicated, reordered and tampered clips", async () => {
  const text = fixture(41);
  const expected = parseTheatreItems(text);
  const valid = await generateTheatreResponse(text, 1, async ({ text }) => audio(text));
  const mutations = [
    (d) => d.clips.pop(),
    (d) => { d.clips[1] = d.clips[0]; },
    (d) => { [d.clips[0], d.clips[1]] = [d.clips[1], d.clips[0]]; },
    (d) => { d.clips[0].index = 10; },
    (d) => { d.clips[0].text = "Different practice target"; },
    (d) => { d.clips[0].sourceLines = [999]; },
    (d) => { d.clips[0].audioBase64 = ""; },
    (d) => { d.integrity.generatedClipCount--; },
    (d) => { d.integrity.expectedItemIds[1] = d.integrity.expectedItemIds[0]; },
    (d) => { delete d.integrity; },
    (d) => { d.clips.pop(); d.integrity.expectedItemIds.pop(); d.integrity.parsedItemCount--; d.integrity.generatedClipCount--; },
  ];
  for (const mutate of mutations) {
    const damaged = structuredClone(valid);
    mutate(damaged);
    assert.throws(() => assertCompleteTheatreResponse(damaged, expected));
  }
  assertCompleteTheatreResponse(valid, expected);
});

test("empty and one-item scenes do not exceed available work", async () => {
  let calls = 0;
  const synthesize = async ({ text }) => { calls++; return audio(text); };
  const empty = await generateTheatreResponse("\n", 1, synthesize);
  assertCompleteTheatreResponse(empty, []);
  assert.equal(calls, 0);
  const single = await generateTheatreResponse("NORA: Bonjour.", 1, synthesize);
  assert.equal(single.clips.length, 1);
  assert.equal(calls, 1);
});
