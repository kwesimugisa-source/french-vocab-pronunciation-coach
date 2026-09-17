const test = require("node:test");
const assert = require("node:assert/strict");
const createLoader = require("./load-typescript.cjs");
const { webEnvironment, settle } = require("./chorus-sync-fixtures.cjs");

const blocks = [
  ["OUI, IL PENSE, IL PENSE TOUT LE TEMPS, IL FERAIT UN EXCELLENT PENSEUR."],
  ["LES FOURMIS TRAVAILLENT, ELLES NE BAVARDENT PAS, LA RESPLENDISSANTE",
    "ESPÈCE MARCHE À SA LIBERTÉ, ELLE NE RENONCE PAS À SON DESTIN."],
  ["LA RAISON N’A PAS DE RAISON, IL A RAISON."],
  ["NOUS SOMMES LES EMPLOYEURS DES EMPLOYÉS SANS RAISON."],
];
const variants = [
  ["production bare OE heading", "LE CHOEUR", "\n"],
  ["production bare ligature heading", "LE CHŒUR", "\n"],
  ["bare heading with NBSP", "LE\u00a0CHŒUR", "\n"],
  ["bare heading with narrow NBSP", "LE\u202fCHŒUR", "\n"],
  ["ordinary spaces", "LE CHŒUR :", "\n"],
  ["NBSP", "LE\u00a0CHŒUR\u00a0:", "\n"],
  ["narrow NBSP", "LE\u202fCHŒUR\u202f:", "\n"],
  ["fullwidth colon and tabs", "LE\tCHŒUR\t：", "\n"],
  ["Windows line endings", "LE CHŒUR :", "\r\n"],
];

test("bare chorus headings use exact shared aliases and survive blank lines and stage directions", () => {
  const { parseTheatreItems } = createLoader()("lib/theatre.ts");
  for (const alias of ["CHŒUR", "LE CHŒUR", "CHOEUR", "LE CHOEUR", "CHORUS", "LE CHORUS"]) {
    const items = parseTheatreItems(`L’AGENT: Avant.\n${alias}\n\n(Un silence.)\n\nEnsemble.\nL’AGENT: Après.`);
    assert.deepEqual(items.map(i => [i.speaker, i.text]), [["L'AGENT", "Avant."],
      ["NARRATOR", "(Un silence.)"], ["CHŒUR", "Ensemble."], ["L'AGENT", "Après."]]);
  }
  const items = parseTheatreItems("L’AGENT: Avant.\nLE CHŒUR ARRIVE\nCHŒUR DE VOIX\nTOUS\nAprès.");
  assert.equal(items.length, 1);
  assert.equal(items[0].speaker, "L'AGENT");
  assert.match(items[0].text, /LE CHŒUR ARRIVE CHŒUR DE VOIX TOUS Après/);
});

for (const [blockIndex, block] of blocks.entries()) for (const [name, label, newline] of variants) {
  test(`import route to synchronized controller: chorus ${blockIndex + 1}, ${name}`, async () => {
    const env = webEnvironment(), speech = [];
    class MockOpenAI {
      constructor() {
        this.responses = { create: async () => { throw new Error("No paid analysis in regression test"); } };
        this.audio = { speech: { create: async body => {
          speech.push(body);
          return { arrayBuffer: async () => Buffer.from("synthetic audio") };
        } } };
      }
    }
    const load = createLoader({ openai: MockOpenAI });
    const { POST } = load("app/api/read-passage/route.ts");
    const { ReadingPlaybackSession } = load("lib/reading-playback.ts");
    const source = ["L’AGENT :", "Bonjour, voici le dossier.", "", label, "", ...block,
      "", "L’AGENT :", "Merci, suivant."].join(newline);
    // The import UI trims only outer whitespace, then sends article.text unchanged.
    const imported = source.trim();
    let manifestChecked = false, manifestError;
    const priorKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-only-placeholder";
    const session = new ReadingPlaybackSession(env, async (_url, options) => {
      assert.equal(JSON.parse(options.body).text, imported);
      const response = await POST(new Request("http://localhost/api/read-passage", options));
      assert.equal(response.status, 200);
      const data = await response.clone().json();
      try {
      // Independent expected manifest, checked BEFORE the client accepts or plays it.
      assert.equal(env.audios.length, 0); assert.equal(env.nodes.length, 0);
      assert.deepEqual(data.clips.map(c => [c.speaker, c.text, c.sourceLines]), [
        ["L'AGENT", "Bonjour, voici le dossier.", [2]],
        ["CHŒUR", block.join(" "), block.map((_, i) => 6 + i)],
        ["L'AGENT", "Merci, suivant.", [block.length + 8]],
      ]);
      assert.deepEqual(data.clips.map(c => c.id), ["line-2", "line-6", `line-${block.length + 8}`]);
      assert.equal(data.clips[1].chorus.components.length, 3);
      assert.deepEqual(data.clips[1].chorus.components.map(c => c.voice), ["echo", "fable", "onyx"]);
      assert.equal(data.clips[0].chorus, undefined); assert.equal(data.clips[2].chorus, undefined);
      assert.equal(speech.filter(s => s.input === block.join(" ")).length, 3);
      manifestChecked = true;
      } catch (error) { manifestError = error; throw error; }
      return response;
    });
    try {
      await session.start(imported, "normal"); await settle();
      if (manifestError) throw manifestError;
      assert.equal(manifestChecked, true);
      assert.equal(session.getSnapshot().mode, "theatre");
      env.latest().end(); await settle();
      assert.equal(session.theatre.getSnapshot().currentItemId, "line-6");
      assert.equal(env.nodes.length, 3); assert.equal(env.contexts.length, 1);
      env.nodes.forEach(n => n.end()); await settle();
      assert.equal(session.theatre.getSnapshot().currentItemId, `line-${block.length + 8}`);
      env.latest().end();
      assert.equal(session.theatre.getSnapshot().status, "completed");
      assert.equal(session.theatre.getSnapshot().completions.length, 3);
    } finally {
      session.dispose();
      if (priorKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = priorKey;
    }
  });
}
