const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load-typescript.cjs")();
const { CONTENT_TYPES, generatedDocument, validateDocument, validateIdentity, TTS_INPUT_LIMIT } = load("lib/content-document.ts");
const { importDocument, detectContent } = load("lib/smart-import.ts");
const { generationPrompt } = load("lib/generation-contracts.ts");
const { parseTheatreItems } = load("lib/theatre.ts");
const { VocabularySession, sentenceAt, textBlocks } = load("lib/vocabulary-session.ts");
const { deferred } = require("./playback-fixtures.cjs");
const article = { title: "Texte", text: "Bonjour le monde.", source: "IA" };
for (const type of CONTENT_TYPES) test(`document and scoped generation contract: ${type}`, () => {
  const doc = generatedDocument(article, type, "A1", `doc-${type}`);
  assert.equal(doc.contentType, type); assert.equal(doc.level, "A1");
  assert.equal(doc.typeSource, "generated"); assert.equal(doc.origin, "generated"); validateDocument(doc);
  const prompt = generationPrompt(type, "A1"); assert.match(prompt, new RegExp(`Content type: ${type}`)); assert.match(prompt, /A1/);
  if (type !== "theatre") assert.doesNotMatch(prompt, /dramatic conflict|stage directions|2–4 characters|chorus/i);
});
for (const bad of [null, {}, { title: "Hi" }, { title: "Hi", text: 4 }, { title: [], text: "Hi" }, { title: "", text: "Hi" }, { title: "Hi", text: " " }])
  test(`malformed generated article rejected: ${JSON.stringify(bad)}`, () => assert.throws(() => generatedDocument(bad, "news", "A1", "doc")));
test("runtime metadata and mapping are validated", () => {
  const doc = generatedDocument(article, "news", "A1", "doc");
  for (const patch of [{ contentType: "bogus" }, { revision: 0 }, { origin: "other" }, { typeSource: "other" }, { originalText: 1 }, { sourceMap: [] }, { sourceMap: [{ canonicalLine: 1, originalLines: [999] }] }, { detection: {} }])
    assert.throws(() => validateDocument({ ...doc, ...patch }));
  assert.throws(() => validateIdentity({ documentId: "doc", revision: "1", contentType: "news" }));
});
const conversation = "Marie : Bonjour ! Comment allez-vous ?\nDavid : Très bien, merci. Et vous ?";
test("obvious imported conversation is not theatre", () => {
  const doc = importDocument(conversation, "conversation");
  assert.equal(doc.contentType, "conversation"); assert.equal(doc.text, conversation); assert.equal(doc.level, undefined);
});
for (const [type, text] of [
  ["news", "Selon le journal, la mairie a annoncé un projet.\nDate: lundi\nLieu: Paris"],
  ["opinion", "À mon avis, ce choix est utile. Je pense que nous devons agir."],
  ["creative", "Il était une fois une maison. Soudain un bruit retentit."],
  ["academic", "Définition: notion fondamentale\nHypothèse: proposition à vérifier"],
  ["everyday-life", "Liste de courses\nPain\nLait"],
]) test(`conservative semantic candidate: ${type}`, () => {
  const doc = importDocument(text, type); assert.equal(doc.contentType, "unknown");
  assert.ok(doc.detection.candidates.includes(type)); assert.equal(doc.text, text);
});
for (const text of ["Poème\nLe vent passe\nLa nuit danse", "Les chaussettes de l’archiduchesse sont-elles sèches ?", "Exercice du son R\nTrois très gros rats\n\nExercice du son CH\nUn chasseur sachant chasser."])
  test(`short learning material and line breaks preserved: ${text.slice(0, 22)}`, () => {
    const doc = importDocument(text, "short"); assert.equal(doc.text, text);
    assert.equal(doc.contentType, text.startsWith("Poème") ? "poetry" : "tongue-twisters");
  });
test("ambiguous verse and trivial or excessive imports", () => {
  assert.equal(importDocument("Le vent\nLe temps\n\nLa nuit\nLe bruit", "verse").contentType, "unknown");
  for (const text of ["", " ", "2", "...", "oui ".repeat(2501), "a".repeat(60001)]) assert.throws(() => importDocument(text, "bad"));
});
for (const agent of ["L’AGENT", "L'AGENT", "L’AGENT\u00a0:", "L'AGENT\u202f："]) for (const chorus of ["LE CHŒUR", "LE CHOEUR :", "LE\u00a0CHŒUR\u202f：", "LE\tCHŒUR\t："])
  test(`canonical headings preserve dialogue and chorus: ${agent} / ${chorus}`, () => {
    const raw = `(La porte s’ouvre.)\n${agent}\nBonjour monsieur.\n${chorus}\nENSEMBLE !\n${agent}\nIl est en non-\nemploi.\nLa suite.`;
    const doc = importDocument(raw, "scene"); assert.equal(doc.contentType, "theatre"); assert.equal(doc.originalText, raw);
    const items = parseTheatreItems(doc.text);
    assert.deepEqual(items.map(i => [i.speaker, i.text]), [["NARRATOR", "(La porte s’ouvre.)"], ["L'AGENT", "Bonjour monsieur."], ["CHŒUR", "ENSEMBLE !"], ["L'AGENT", "Il est en non-emploi. La suite."]]);
    assert.equal(doc.sourceMap[6].originalLines.join(","), "7,8");
    assert.deepEqual(items.map(i => i.id), ["line-1", "line-3", "line-5", "line-7"]);
    validateDocument(doc);
  });
test("canonical source mapping handles CRLF, title, stage and continuation", () => {
  const raw = "LE JOUEUR\r\nACTE II\r\nL’AGENT\r\n(Un silence.)\r\nBonjour.\r\nL’AGENT\r\nEncore.";
  const doc = importDocument(raw, "crlf");
  assert.ok(doc.text.startsWith("LE JOUEUR\nACTE II\nL'AGENT:"));
  assert.equal(doc.originalText, raw); assert.equal(doc.sourceMap.at(-1).originalLines[0], 7);
  assert.ok(doc.normalization.some(a => a.kind === "newlines"));
});
for (const marker of ["Page 2", "PAGE 2", "- 2 -", "— 2 —"])
  test(`isolated pagination removed reversibly: ${marker}`, () => {
    const raw = `Un paragraphe terminé.\n\n${marker}\n\nUn autre paragraphe.`;
    const doc = importDocument(raw, "page"); assert.ok(!doc.text.includes(marker)); assert.equal(doc.originalText, raw);
    assert.deepEqual(doc.normalization[0].originalLines, [3]);
  });
test("sequential bare page markers removed; unconfirmed number flagged", () => {
  const doc = importDocument("Avant.\n\n2\n\nSuite.\n\n3\n\nFin.", "pages");
  assert.equal(doc.normalization.filter(a => a.kind === "pagination").length, 2);
  const uncertain = importDocument("Avant.\n\n2\n\nFin.", "number"); assert.ok(uncertain.text.includes("2")); assert.equal(uncertain.warnings.length, 1);
});
for (const line of ["PARTIE 2", "ACTE II", "SCÈNE 2", "CHAPITRE 2", "1. Un exercice", "L’AGENT : 2.", "Vous êtes le numéro 2", "2026", "2000 euros"])
  test(`meaningful numeric text protected: ${line}`, () => {
    const raw = `Avant.\n\n${line}\n\nAprès.`;
    assert.equal(importDocument(raw, "number").text, raw);
  });
test("numeric answer protected even with apparent pagination", () => {
  for (const before of ["Combien ?", "L’AGENT :"]) {
    const raw = `${before}\n\n2\n\nSuite.\n\n3\n\nFin.`;
    assert.ok(importDocument(raw, "answer").text.includes("\n2\n"));
  }
});
for (const raw of ["Poème\nnon-\nemploi\nDouce nuit", "Exercice du son R\nnon-\nemploi", "Définition\nnon-\nemploi", "ACTE II\nNORA: Voici.\nSAMIR: non-\n(Nora entre.)\nemploi.", "ACTE II\nNORA: Un vers-\nun autre vers.\nSAMIR: Oui."])
  test(`intentional boundaries protected: ${raw.slice(0, 20)}`, () => assert.ok(importDocument(raw, "wrap").text.includes("-\n")));
test("reinterpretation retains original and advances revision without changing CEFR", () => {
  const original = importDocument(conversation, "same");
  const theatre = importDocument(original.originalText, original.documentId, "theatre", original.revision + 1);
  assert.equal(theatre.documentId, original.documentId); assert.equal(theatre.revision, 2);
  assert.equal(theatre.typeSource, "learner-override"); assert.equal(theatre.level, undefined); assert.equal(original.contentType, "conversation");
});
test("token offsets select the clicked repeated occurrence", () => {
  const text = "Le chat dort.\n\nUn chat joue !";
  const tokens = textBlocks(text).flat().filter(t => t.word === "chat");
  assert.equal(sentenceAt(text, tokens[0].offset), "Le chat dort."); assert.equal(sentenceAt(text, tokens[1].offset), "Un chat joue !");
});
test("vocabulary rapid-click and replacement races reject stale results even if abort ignored", async () => {
  const session = new VocabularySession(), requests = [deferred(), deferred(), deferred()], bodies = [], signals = [];
  const fetcher = (_url, options) => { bodies.push(JSON.parse(options.body)); signals.push(options.signal); return requests[bodies.length - 1].promise; };
  const doc = generatedDocument({ title: "Test", text: "chat dort. chat joue." }, "creative", "A1", "doc");
  const a = session.analyze(doc, "chat", 0, fetcher); const b = session.analyze(doc, "chat", 11, fetcher);
  assert.equal(signals[0].aborted, true); requests[1].resolve(Response.json({ word: "chat" }));
  assert.equal((await b).sentence, "chat joue."); requests[0].resolve(Response.json({ word: "old" })); assert.equal(await a, null);
  assert.deepEqual([bodies[1].contentType, bodies[1].level, bodies[1].documentId, bodies[1].revision], ["creative", "A1", "doc", 1]);
  const c = session.analyze(doc, "chat", 0, fetcher); session.cancel(); requests[2].resolve(Response.json({ word: "old" })); assert.equal(await c, null);
});

for (const [type, text] of [
  ["news", "Actualités\nLa mairie a annoncé une nouvelle bibliothèque."],
  ["opinion", "Opinion\nÀ mon avis, ce projet est utile."],
  ["creative", "Conte\nIl était une fois une petite maison."],
  ["academic", "Cours\nDéfinition : une hypothèse est une proposition à vérifier."],
  ["everyday-life", "Recette\nAjoutez du lait et mélangez."],
]) test(`explicit genre plus independent evidence supports ${type}`, () => {
  const doc = importDocument(text, "explicit"); assert.equal(doc.contentType, type); assert.equal(doc.typeSource, "detected");
});
test("uppercase chorus speech remains speech and inline compound wraps are reconstructed", () => {
  const doc = importDocument("ACTE II\nNORA: Bonjour.\nLE CHŒUR\nNOUS SOMMES ICI\npour vous aider.\nNORA: Il est en non-\nemploi.", "caps");
  const items = parseTheatreItems(doc.text);
  assert.equal(items.find(i => i.speaker === "CHŒUR").text, "NOUS SOMMES ICI pour vous aider.");
  assert.equal(items.at(-1).text, "Il est en non-emploi.");
});
test("source-map validation rejects reordered and unaccounted source lines", () => {
  const doc = importDocument("Bonjour.\nLa suite.", "map");
  assert.throws(() => validateDocument({ ...doc, sourceMap: [{ canonicalLine: 1, originalLines: [2] }, { canonicalLine: 2, originalLines: [1] }] }));
  assert.throws(() => validateDocument({ ...doc, text: "Bonjour.", sourceMap: [doc.sourceMap[0]] }));
});
test("vocabulary stale failures cannot restore local fallback; current failures retain it", async () => {
  const doc = generatedDocument({ title: "Marché", text: "Le marché ferme." }, "news", "A1", "fallback");
  const session = new VocabularySession(), stale = deferred();
  const pending = session.analyze(doc, "marché", 3, () => stale.promise); session.cancel(); stale.reject(new Error("late")); assert.equal(await pending, null);
  const local = await session.analyze(doc, "marché", 3, async () => { throw new Error("offline"); });
  assert.equal(local.root, "marché"); assert.equal(local.sentence, "Le marché ferme.");
});
