const test = require("node:test");
const assert = require("node:assert/strict");
const { load, environment, flush } = require("./playback-fixtures.cjs");
const { source } = require("./chorus-import-fixture.cjs");
const { parseTheatreItems } = load("lib/theatre.ts");
const { theatreRole } = load("lib/theatre-casting.ts");
const { createTheatreCasting } = load("lib/theatre-casting.ts");
const { generateTheatreResponse } = load("lib/theatre-generation.ts");
const { assertCompleteTheatreResponse } = load("lib/theatre.ts");
const { TheatrePlaybackController, canPractise } = load("lib/theatre-playback.ts");
const { speakerIdentity, isChorusSpeaker } = load("lib/theatre-speakers.ts");
test("imported standalone LE CHŒUR labels retain two logical chorus items", () => {
  const items = parseTheatreItems(source);
  assert.equal(items.filter(item => theatreRole(item) === "chorus").length, 2);
});

for (const alias of ["CHŒUR", "LE CHŒUR", "CHOEUR", "LE CHOEUR", "CHORUS", "LE CHORUS"]) {
  test(`${alias}: case, typography, whitespace and colon variants share one identity`, async () => {
    for (const name of [alias, alias.toLowerCase(), alias.toLowerCase().replace(/^./, c => c.toUpperCase()),
      alias.replace(/ /g, "\t \u00a0\u202f")]) {
      for (const separator of [":", " \u00a0: ", "\u202f：\t"]) {
        const text = `${name}${separator}\n\n\nExact Œ, l’été\u00a0!\nSuite\u202f?`;
        const items = parseTheatreItems(text);
        assert.equal(items.length, 1);
        assert.deepEqual(items[0], { id: "line-4", index: 0, type: "dialogue", speaker: "CHŒUR",
          text: "Exact Œ, l’été\u00a0! Suite\u202f?", sourceLines: [4, 5] });
        assert.equal(canPractise(items[0]), false);
        assert.equal(speakerIdentity(name), "CHŒUR");
        const data = await generateTheatreResponse(text, 1, async ({ text }) => Buffer.from(text).toString("base64"));
        assert.equal(data.clips[0].chorus.components.length, 3);
        assertCompleteTheatreResponse(data, items);
      }
    }
  });
}

test("real imported excerpts retain exact words and ordered physical source lines", () => {
  const items = parseTheatreItems(source);
  const chorus = items.filter(i => theatreRole(i) === "chorus");
  assert.deepEqual(chorus.map(i => [i.id, i.sourceLines, i.text]), [
    ["line-12", [12], source.split("\n")[11]],
    ["line-21", [21, 22], source.split("\n").slice(20).join(" ")],
  ]);
  assert.deepEqual(parseTheatreItems(source), items);
  assert.deepEqual(items.filter(i => theatreRole(i) === "character").map(i => i.speaker),
    ["L'AGENT", "LE JOUEUR", "L'AGENT", "LE JOUEUR"]);
  const cast = createTheatreCasting(items);
  assert.deepEqual(createTheatreCasting([...items].reverse()), cast);
  assert.deepEqual(cast.members.filter(i => i.role === "character").map(i => [i.speaker, i.voice]),
    [["L'AGENT", "alloy"], ["LE JOUEUR", "ash"]]);
});

test("exact alias matching excludes ambiguous groups and substring names across every consumer", async () => {
  for (const name of ["TOUS", "TOUTES", "LES VOIX", "ENSEMBLE", "CHOEURVILLE", "LE CHŒURISTE", "CHORUS MASTER", "MON CHOEUR"]) {
    assert.equal(isChorusSpeaker(name), false);
    const text = `${name}: Bonjour.`;
    const data = await generateTheatreResponse(text, 1, async () => "YQ==");
    assert.equal(theatreRole(data.clips[0]), "character");
    assert.equal(canPractise(data.clips[0]), true);
    assert.equal(data.clips[0].chorus, undefined);
    data.clips[0].chorus = { components: ["alloy", "echo", "ash"].map(voice => ({ voice, audioBase64: "YQ==" })) };
    assert.throws(() => assertCompleteTheatreResponse(data, parseTheatreItems(text)));
  }
  assert.equal(speakerIdentity("e\u0301loïse"), speakerIdentity("ÉLOÏSE"));
  assert.equal(speakerIdentity("ｌｅ　ｃｈｏｅｕｒ"), "CHŒUR");
});

test("standalone labels override previous dialogue; stage interludes preserve pending speaker", () => {
  const items = parseTheatreItems("NORA: Avant.\nLE CHŒUR :\n\n(Silence.)\n\nEnsemble.\nSuite.");
  assert.deepEqual(items.map(i => [i.speaker, i.text]), [["NORA", "Avant."], ["NARRATOR", "(Silence.)"], ["CHŒUR", "Ensemble. Suite."]]);
});

test("ambiguous standalone pagination is preserved separately; labelled numeric dialogue is never removed", () => {
  assert.deepEqual(parseTheatreItems(source).find(i => i.text === "2"),
    { id: "line-14", index: 4, type: "stage", speaker: "NARRATOR", text: "2", sourceLines: [14] });
  assert.equal(parseTheatreItems("NORA:\n\n2\n\nSAMIR: 27")[0].text, "2");
  assert.equal(parseTheatreItems("NORA: 2")[0].type, "dialogue");
  assert.equal(parseTheatreItems("NORA: Il y a\n2\nraisons.")[0].text, "Il y a 2 raisons.");
});

test("real import reaches both grouped choruses, completes once, and cached replay never synthesizes", async () => {
  const calls = [];
  const data = await generateTheatreResponse(source, 1, async input => { calls.push(input); return "YQ=="; });
  assert.equal(data.clips.length, 7);
  assert.equal(calls.length, 11);
  for (const clip of data.clips.filter(i => i.chorus)) {
    assert.equal(calls.filter(c => c.text === clip.text).length, 3);
    assert.deepEqual(clip.chorus.components.map(c => c.voice), ["echo", "fable", "onyx"]);
  }
  const env = environment(), controller = new TheatrePlaybackController(env);
  controller.acceptScene(controller.beginLoading(), data, source);
  let chorusCount = 0;
  for (const clip of data.clips) {
    assert.equal(controller.getSnapshot().currentItemId, clip.id);
    if (!clip.chorus) { assert.equal(env.latest().playCalls, 1); env.latest().end(); continue; }
    chorusCount++;
    await flush();
    const old = env.audios.slice(-3), stale = old.map(a => a.onended);
    controller.pause(); assert.ok(old.every(a => a.pauseCalls));
    controller.resume(); await flush();
    for (let i = 0; i < 5; i++) { controller.replay(); await flush(); }
    stale.forEach(callback => callback?.(new Event("ended")));
    assert.equal(controller.getSnapshot().currentItemId, clip.id);
    const group = env.audios.slice(-3), end = group[2].onended;
    assert.ok(group.every(a => a.playCalls === 1));
    group[0].end(); group[1].end();
    assert.equal(controller.getSnapshot().currentItemId, clip.id);
    group[2].end(); const after = controller.getSnapshot(); end?.(new Event("ended"));
    assert.deepEqual(controller.getSnapshot(), after);
  }
  assert.equal(chorusCount, 2); assert.equal(calls.length, 11);
  assert.equal(controller.getSnapshot().status, "completed");
  controller.dispose(); assert.equal(env.revoked.length, env.created.length);
});
