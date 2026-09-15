const { load } = require("./playback-fixtures.cjs");
const { parseTheatreItems } = load("lib/theatre.ts");
const source = (count) => Array.from({ length: count }, (_, i) =>
  i % 7 === 0 ? `(Direction ${i + 1}.)` : `PERSONNE ${i % 3}: Réplique ${i + 1}.`
).join("\n");
function analysisFor(items) {
  return {
    version: 1,
    scene: { mood: "tense", situation: "A reunion before departure.", relationships: "Two friends disagree.", arc: "Tension gives way to warmth." },
    items: items.map((item, i) => ({ id: item.id, tone: i % 2 ? "warm" : "tense", pacing: i % 2 ? "flowing" : "measured", intensity: "restrained" })),
  };
}
const audio = (text) => Buffer.from(text).toString("base64");
module.exports = { load, source, parseTheatreItems, analysisFor, audio };
