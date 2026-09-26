// Development-only visual fixture. Creates public/cp46-preview.html for inspection;
// remove that generated HTML before release. No provider or microphone calls.
const fs = require("node:fs"), React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
const load = require("./load-typescript.cjs")(), h = React.createElement;
const component = name => load("components/" + name + ".tsx").default;
const { generatedDocument } = load("lib/content-document.ts"), { practiceUnits } = load("lib/practice-units.ts");
const doc = generatedDocument({ title: "Pratique — aperçu local", text: "M. Dupont attend. Il regarde les étoiles.\n\nLa nuit est calme." }, "news", "B1", "preview");
const units = practiceUnits(doc);
const html = h("main", { className: "mx-auto max-w-6xl p-4 space-y-6" },
  h("p", null, "Aperçu local — états simulés, aucun appel fournisseur"),
  h(component("article-reader/PracticeControls"), { active: true, units, selected: units[1], audioBusy: false, recordingBusy: false }),
  h(component("article-reader/ReadingControls"), { isRecording: false, hasRecording: true, retryLabel: true, targetLabel: "Pratique — unité 2" }),
  h(component("article-reader/ArticleTextPanel"), { article: doc, practiceUnits: units, selectedUnitId: units[1].id, selectedWord: null }),
  h("div", { className: "grid gap-6 lg:grid-cols-2" },
    h(component("pronunciation/PronunciationSummary"), { summary: { overall: "La plupart des mots sont présents.", clarity: "Comparaison de transcription uniquement.", rhythm: "Fluidité et intonation non mesurées.", priority: "Réécoutez cette phrase puis recommencez." } }),
    h(component("pronunciation/WeakPointsPanel"), { weakPoints: [{ word: "étoiles", note: "Mot possiblement omis dans la transcription.", severity: "medium" }] })),
  h(component("article-reader/ReadingControls"), { isRecording: true, hasRecording: false, isBusy: true, targetLabel: "Pratique — unité 2" })
);
(async () => {
  const page = await (await fetch("http://127.0.0.1:3000")).text();
  const styles = [...page.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map(m => m[0]).join("");
  fs.writeFileSync("public/cp46-preview.html", '<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' + styles + '<title>CP4.6 visual review</title><body>' + renderToStaticMarkup(html) + '</body></html>');
})();
