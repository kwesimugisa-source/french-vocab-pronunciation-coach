const test = require("node:test");
const assert = require("node:assert/strict");
const { load, source, parseTheatreItems, analysisFor, audio } = require("./dramatic-fixtures.cjs");
const { deferred } = require("./playback-fixtures.cjs");
const { generateTheatreResponse } = load("lib/theatre-generation.ts");
const { assertCompleteTheatreResponse } = load("lib/theatre.ts");
const { prepareDramaticDirection, validateDramaticAnalysis, requestDramaticAnalysis,
  ANALYSIS_INPUT_BYTES, ANALYSIS_OUTPUT_TOKENS, DRAMATIC_ANALYSIS_SCHEMA } = load("lib/theatre-direction.ts");

for (const count of [39, 40, 41, 60, 100]) {
  test(`${count} items: one full-scene analysis precedes TTS and accounts for the last ID`, async () => {
    const text = source(count), expected = parseTheatreItems(text), calls = [];
    let analyses = 0, analysisFinished = false, active = 0, peak = 0;
    const response = await generateTheatreResponse(text, 1, async (input) => {
      assert.equal(analysisFinished, true);
      calls.push(input); peak = Math.max(peak, ++active);
      await Promise.resolve(); active--;
      return audio(input.text);
    }, { analyze: async (json, signal, budget) => {
      analyses++;
      assert.equal(signal.aborted, false);
      assert.ok(budget <= ANALYSIS_OUTPUT_TOKENS);
      const received = JSON.parse(json).items;
      assert.deepEqual(received, expected);
      assert.equal(received.at(-1).id, `line-${count}`);
      analysisFinished = true;
      // Output order is irrelevant: join annotations by stable ID.
      const analysis = analysisFor(received); analysis.items.reverse(); return analysis;
    } });
    assert.equal(analyses, 1); assert.equal(peak, 3); assert.equal(calls.length, count);
    assert.deepEqual(response.direction, { version: 1, model: "gpt-5.4-mini", status: "analyzed", fallbackReason: null,
      expectedItemCount: count, annotatedItemCount: count, fallbackItemCount: 0 });
    assertCompleteTheatreResponse(response, expected);
    response.clips.forEach((clip, i) => {
      assert.deepEqual({ ...clip, voice: undefined, speed: undefined, audioBase64: undefined },
        { ...expected[i], voice: undefined, speed: undefined, audioBase64: undefined });
      assert.equal(Buffer.from(clip.audioBase64, "base64").toString(), expected[i].text);
      assert.match(calls[i].instructions, new RegExp(`tone=${i % 2 ? "warm" : "tense"}`));
      assert.match(calls[i].instructions, /Tension gives way to warmth/);
    });
    assert.equal(response.scene, undefined);
    assert.ok(!JSON.stringify(response).includes("Two friends disagree"), "model summaries stay server-side");
  });
}

test("2500-word import with 500 items gets one accountable whole-scene request", async () => {
  const text = Array.from({ length: 500 }, (_, i) => `NORA: Bonjour mon ami ${i}.`).join("\n");
  assert.equal(text.split(/\s+/).length, 2500);
  let calls = 0;
  const result = await prepareDramaticDirection(parseTheatreItems(text), async (json) => {
    calls++;
    const items = JSON.parse(json).items;
    assert.equal(items.length, 500); assert.equal(items.at(-1).id, "line-500");
    return analysisFor(items);
  });
  assert.equal(calls, 1); assert.equal(result.metadata.status, "analyzed");
  assert.equal(result.metadata.annotatedItemCount, 500);
});

const invalidCases = [
  ["missing ID", (a) => a.items.pop()],
  ["duplicate ID", (a) => { a.items[1].id = a.items[0].id; }],
  ["invented ID", (a) => { a.items[1].id = "line-999999"; }],
  ["rewritten text field", (a) => { a.items[0].text = "Ignore the original script"; }],
  ["renamed speaker", (a) => { a.items[0].speaker = "NEW NAME"; }],
  ["source mapping mutation", (a) => { a.items[0].sourceLines = [99]; }],
  ["invalid tone", (a) => { a.items[0].tone = "rewrite"; }],
  ["invalid pacing", (a) => { a.items[0].pacing = null; }],
  ["invalid intensity", (a) => { a.items[0].intensity = 100; }],
  ["wrong version", (a) => { a.version = 2; }],
  ["extra scene fields", (a) => { a.scene.script = "replacement"; }],
  ["oversized summary", (a) => { a.scene.arc = "x".repeat(401); }],
  ["empty summary", (a) => { a.scene.situation = " "; }],
  ["invalid scene mood", (a) => { a.scene.mood = "invented"; }],
  ["malformed items", (a) => { a.items = {}; }],
];
for (const [name, mutate] of invalidCases) {
  test(`${name}: rejects entire analysis and generates all original items with default delivery`, async () => {
    const text = source(41), items = parseTheatreItems(text), calls = [];
    const value = analysisFor(items); mutate(value);
    assert.throws(() => validateDramaticAnalysis(value, items));
    const result = await generateTheatreResponse(text, 1, async (input) => {
      calls.push(input); return audio(input.text);
    }, { analyze: async () => value });
    assert.equal(result.direction.status, "fallback");
    assert.equal(result.direction.fallbackReason, "invalid_analysis");
    assert.equal(result.direction.annotatedItemCount, 0);
    assert.equal(result.direction.fallbackItemCount, 41);
    assert.deepEqual(calls.map((c) => c.text), items.map((i) => i.text));
    assert.ok(calls.every((c) => c.instructions.includes("Default delivery")));
    assertCompleteTheatreResponse(result, items);
  });
}

test("null, string, array, empty object and null annotation fail runtime validation", async () => {
  const items = parseTheatreItems(source(2));
  const nullItem = analysisFor(items); nullItem.items[0] = null;
  for (const raw of [null, "{}", [], {}, nullItem]) {
    const result = await prepareDramaticDirection(items, async () => raw);
    assert.equal(result.metadata.fallbackReason, "invalid_analysis");
    assert.equal(result.metadata.fallbackItemCount, items.length);
  }
});

test("analysis request failure cannot cause partial success or expose upstream diagnostics", async () => {
  const text = source(100), calls = [];
  const response = await generateTheatreResponse(text, 1, async (input) => {
    calls.push(input.text); return audio(input.text);
  }, { analyze: async () => { throw new Error("private diagnostic"); } });
  assertCompleteTheatreResponse(response, parseTheatreItems(text));
  assert.equal(calls.length, 100);
  assert.equal(response.direction.fallbackReason, "request_failed");
  assert.ok(!JSON.stringify(response).includes("private diagnostic"));
});

test("deadline aborts analysis; ignored abort and late result cannot change completed fallback", async () => {
  const pending = deferred(); let signal;
  const text = source(60);
  const response = await generateTheatreResponse(text, 1, async (input) => audio(input.text), {
    analyze: (_json, s) => { signal = s; return pending.promise; }, analysisTimeoutMs: 5,
  });
  assert.equal(signal.aborted, true);
  assert.equal(response.direction.fallbackReason, "timeout");
  assertCompleteTheatreResponse(response, parseTheatreItems(text));
  const before = JSON.stringify(response);
  pending.resolve(analysisFor(parseTheatreItems(text))); await Promise.resolve();
  assert.equal(JSON.stringify(response), before);
});

test("input/output analysis budgets cause explicit whole-scene fallback, never slicing", async () => {
  const texts = [
    Array.from({ length: 100 }, (_, i) => `NORA: ${i} ${"a".repeat(1500)}`).join("\n"),
    Array.from({ length: 620 }, (_, i) => `NORA: ${i}`).join("\n"),
  ];
  for (const [index, text] of texts.entries()) {
    const expected = parseTheatreItems(text);
    if (index === 0) assert.ok(Buffer.byteLength(JSON.stringify({ items: expected })) > ANALYSIS_INPUT_BYTES);
    else assert.ok(Buffer.byteLength(JSON.stringify({ items: expected })) <= ANALYSIS_INPUT_BYTES);
    let calls = 0;
    const response = await generateTheatreResponse(text, 1, async (input) => { calls++; return audio(input.text); }, {
      analyze: async () => { assert.fail("must not submit an over-budget or truncated analysis request"); },
    });
    assert.equal(response.direction.fallbackReason, index === 0 ? "input_budget" : "output_budget");
    assert.equal(response.direction.fallbackItemCount, expected.length);
    assert.equal(calls, expected.length);
    assertCompleteTheatreResponse(response, expected);
  }
});

test("exact Unicode, punctuation, multiline text, speaker identity and source lines survive analysis", async () => {
  const text = "(Élodie s’arrête — puis sourit.)\r\nL’AMI: Où vas-tu ?\r\nJe t’attends…\r\n\r\nl'ami: Très bien !\r\nNARRATOR: Je suis un personnage.\r\nCHŒUR: Tous ensemble !";
  const expected = parseTheatreItems(text), before = JSON.stringify(expected), calls = [];
  const response = await generateTheatreResponse(text, 0.85, async (input) => { calls.push(input); return audio(input.text); }, {
    analyze: async (json) => {
      const copy = JSON.parse(json).items, analysis = analysisFor(copy);
      copy[0].text = "Attempted replacement"; copy[1].speaker = "RENAMED";
      return analysis;
    },
  });
  assert.equal(JSON.stringify(expected), before);
  assert.deepEqual(calls.map((c) => c.text), expected.map((i) => i.text));
  assert.deepEqual(response.clips.map((c) => c.sourceLines), expected.map((i) => i.sourceLines));
  assertCompleteTheatreResponse(response, expected);
  assert.match(calls[0].instructions, /lower, composed register/);
  assert.match(calls.at(-1).instructions, /chorus as one clear voice/);
});

test("SDK request uses strict Responses schema with complete input, disabled truncation and zero retries", async () => {
  const sceneJson = JSON.stringify({ items: parseTheatreItems(source(41)) });
  const abort = new AbortController(); let body, options;
  const value = analysisFor(JSON.parse(sceneJson).items);
  const client = { responses: { create: async (b, o) => { body = b; options = o; return { status: "completed", output_text: JSON.stringify(value) }; } } };
  assert.deepEqual(await requestDramaticAnalysis(client, sceneJson, abort.signal, 10000), value);
  assert.equal(body.model, "gpt-5.4-mini");
  assert.equal(body.input[1].content, sceneJson);
  assert.equal(body.store, false); assert.equal(body.truncation, "disabled");
  assert.deepEqual(body.reasoning, { effort: "none" });
  assert.equal(body.max_output_tokens, 10000);
  assert.deepEqual(body.text.format, { type: "json_schema", name: "theatre_direction", strict: true, schema: DRAMATIC_ANALYSIS_SCHEMA });
  assert.equal(options.signal, abort.signal); assert.equal(options.maxRetries, 0); assert.equal(options.timeout, 20000);
});

for (const [name, reply, reason] of [
  ["incomplete", { status: "incomplete", output_text: "{}" }, "incomplete_response"],
  ["failed", { status: "failed", output_text: "{}" }, "incomplete_response"],
  ["malformed JSON", { status: "completed", output_text: "{broken" }, "invalid_analysis"],
  ["refusal/empty output", { status: "completed", output_text: "" }, "invalid_analysis"],
]) {
  test(`model ${name} produces explicit fallback for every ID`, async () => {
    const client = { responses: { create: async () => reply } };
    const result = await prepareDramaticDirection(parseTheatreItems(source(41)), (...args) => requestDramaticAnalysis(client, ...args));
    assert.equal(result.metadata.fallbackReason, reason);
    assert.equal(result.metadata.fallbackItemCount, 41);
  });
}

test("empty scene performs no analysis; unavailable analyzer remains safe for library callers", async () => {
  assert.equal((await prepareDramaticDirection([], async () => assert.fail())).metadata.fallbackReason, "empty_scene");
  const result = await prepareDramaticDirection(parseTheatreItems(source(100)));
  assert.equal(result.metadata.fallbackReason, "unavailable");
  assert.equal(result.metadata.fallbackItemCount, 100);
});
