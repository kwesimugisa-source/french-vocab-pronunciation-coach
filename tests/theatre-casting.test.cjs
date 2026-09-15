const test = require("node:test");
const assert = require("node:assert/strict");
const { load, parseTheatreItems, analysisFor, audio } = require("./dramatic-fixtures.cjs");
const { createTheatreCasting, theatreRole, THEATRE_VOICES } = load("lib/theatre-casting.ts");
const { generateTheatreResponse } = load("lib/theatre-generation.ts");

test("casting is deterministic across item order, with distinct supported character/narrator/chorus voices", () => {
  const items = parseTheatreItems("(Entrée.)\nNora: Oui.\nSamir: Non.\nnora: Encore.\nCHŒUR: Ensemble !\nNARRATOR: Un personnage.");
  const cast = createTheatreCasting(items);
  assert.deepEqual(cast, createTheatreCasting([...items].reverse()));
  assert.equal(cast.narrator.voice, "cedar");
  assert.equal(cast.chorus.voice, "echo");
  const characters = cast.members.filter((member) => member.role === "character");
  assert.equal(characters.length, 3);
  assert.equal(new Set(characters.map((member) => member.voice)).size, 3);
  assert.ok(characters.every((member) => !["cedar", "echo"].includes(member.voice)));
  assert.ok(cast.members.every((member) => THEATRE_VOICES.includes(member.voice)));
  assert.equal(cast.members.filter((member) => member.speaker === "NARRATOR").length, 2, "role distinguishes a character named NARRATOR from stage narration");
});

test("conservative existing normalization keeps ambiguous names distinct", () => {
  const items = parseTheatreItems("L’AMI: Un.\nl'ami: Deux.\nNORA: Trois.\nNORA JEUNE: Quatre.\nNORA (JEUNE): Cinq.");
  const cast = createTheatreCasting(items);
  assert.deepEqual(cast.members.map((m) => m.speaker), ["L'AMI", "NORA", "NORA (JEUNE)", "NORA JEUNE"]);
});

test("all 11 available character voices are used before deterministic reuse; narrator never leaks", () => {
  const items = parseTheatreItems(Array.from({ length: 25 }, (_, i) => `ROLE ${i}: Bonjour.`).join("\n"));
  const cast = createTheatreCasting(items);
  assert.equal(new Set(cast.members.map((m) => m.voice)).size, 11);
  assert.equal(cast.reusedCharacterVoices, true);
  assert.ok(cast.members.every((m) => m.voice !== "cedar" && m.voice !== "echo"));
  assert.deepEqual(cast, createTheatreCasting(items));
});

test("narrator is explicitly configurable to a supported reserved voice", () => {
  const items = parseTheatreItems("(Entrée.)\nNORA: Oui.\nSAMIR: Non.");
  const cast = createTheatreCasting(items, "onyx");
  assert.equal(cast.narrator.voice, "onyx");
  assert.ok(cast.members.filter((m) => m.role === "character").every((m) => m.voice !== "onyx"));
  assert.throws(() => createTheatreCasting(items, "deep narrator"));
  assert.throws(() => createTheatreCasting(items, "echo"));
});

test("out-of-order concurrent TTS cannot change casting, item guidance or output order", async () => {
  const text = "(Entrée.)\nNORA: Un.\nSAMIR: Deux.\nNORA: Trois.\n(Elle attend.)\nCHOEUR: Quatre.";
  let active = 0, peak = 0;
  const expected = parseTheatreItems(text), finished = [];
  const result = await generateTheatreResponse(text, 1, async (input) => {
    peak = Math.max(peak, ++active);
    await new Promise((resolve) => setTimeout(resolve, input.text === "(Entrée.)" ? 20 : 1));
    active--; finished.push(input.text); return audio(input.text);
  }, { analyze: async () => analysisFor(expected) });
  assert.equal(peak, 3);
  assert.notDeepEqual(finished, expected.map((item) => item.text));
  assert.deepEqual(result.clips.map((clip) => clip.text), expected.map((item) => item.text));
  assert.equal(result.clips[1].voice, result.clips[3].voice);
  assert.equal(result.clips[0].voice, result.clips[4].voice);
  result.clips.forEach((clip) => {
    const member = result.casting.members.find((m) => m.speaker === clip.speaker && m.role === theatreRole(clip));
    assert.equal(clip.voice, member.voice);
  });
});
