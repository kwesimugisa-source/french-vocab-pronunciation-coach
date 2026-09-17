import { isChorusSpeaker, speakerIdentity } from "./theatre-speakers";
import { ContentDocument, Detection, EffectiveType, MAX_TEXT_LENGTH, Normalization, validateDocument } from "./content-document";

const act = /^(?:ACTE|SC[ÈE]NE|PARTIE|CHAPITRE)\s+[\dIVX]+\b/iu;
const metadata = /^(?:date|lieu|source|titre|auteur|définition|objectif|exemple|remarque|résumé|introduction|conclusion|exercice|son)\b/iu;
function heading(line: string): string | null {
  const s = line.trim().normalize("NFKC").replace(/\s+/gu, " ");
  if (!s || act.test(s) || metadata.test(s)) return null;
  const label = s.match(/^([^:：]{1,40})[:：]/u)?.[1];
  if (label && /^[\p{L}][\p{L}\p{M} ’'\-]{0,39}$/u.test(label.trim())) return label.trim();
  if (/^[\p{Lu}][\p{Lu}\p{M} ’'\-]{1,39}$/u.test(s)) return s;
  return null;
}
function nontrivialPractical(text: string) { return /\b(?:ajoutez|mélangez|branchez|appuyez|étape)\b/iu.test(text); }
export function detectContent(text: string): Detection & { contentType: EffectiveType } {
  const lines = text.split(/\r\n|\r|\n/).map(l => l.trim());
  const labels = lines.map(heading).filter((x): x is string => !!x);
  const turns = lines.filter(l => heading(l) && /[:：]/u.test(l)).length;
  const stage = lines.some(l => /^\(.+\)$/u.test(l));
  const dramatic = lines.some(l => /^(ACTE|SC[ÈE]NE)\s+[\dIVX]+/iu.test(l));
  const chorus = labels.some(isChorusSpeaker);
  const distinct = new Set(labels.map(speakerIdentity)).size;
  const result = (type: EffectiveType, confidence: Detection["confidence"], evidence: string[], candidates = [type]) => ({ contentType: type, confidence, candidates, evidence });
  if (labels.length >= 2 && (dramatic || chorus || (stage && distinct >= 2)))
    return result("theatre", "high", ["Répliques et structure dramatique", ...(stage ? ["Didascalies entre parenthèses"] : []), ...(chorus ? ["Chœur"] : [])]);
  if (/\b(virelangue|exercice du son|répétez.*(?:son|fois))s?\b/iu.test(text) || /les chaussettes de l.archiduchesse|un chasseur sachant chasser/iu.test(text))
    return result("tongue-twisters", "high", ["Exercice phonétique explicite"]);
  if (turns >= 2 && distinct >= 2 && lines.filter(Boolean).every(l => !!heading(l)))
    return result("conversation", "high", ["Tours de parole étiquetés sans structure dramatique"]);
  if (/^(?:poème|poésie)\b/imu.test(text) && lines.filter(Boolean).length >= 3)
    return result("poetry", "high", ["Poème explicitement identifié"]);
  const signals: [EffectiveType, RegExp, string][] = [
    ["news", /\b(selon|a annoncé|a déclaré|reportage|actualité)\b/iu, "Attribution ou compte rendu"],
    ["opinion", /à mon avis|je pense que|selon moi|en conclusion/iu, "Expression d’un point de vue"],
    ["creative", /il était une fois|soudain|ce jour-là/iu, "Indices narratifs"],
    ["academic", /définition|hypothèse|méthodologie|bibliographie/iu, "Structure explicative"],
    ["everyday-life", /liste de courses|recette|mode d.emploi|cher ami|chère amie/iu, "Situation pratique"],
  ];
  const matches = signals.filter(([, re]) => re.test(text));
  const explicitTitles: Partial<Record<EffectiveType, RegExp>> = {
    news: /^(?:actualités|article d.actualité|reportage)\s*[:—-]?/iu,
    opinion: /^(?:opinion|tribune|texte d.opinion)\s*[:—-]?/iu,
    creative: /^(?:récit|conte|nouvelle)\s*[:—-]?/iu,
    academic: /^(?:cours|texte académique|article scientifique)\s*[:—-]?/iu,
    "everyday-life": /^(?:recette|mode d.emploi|liste de courses)\s*[:—-]?/iu,
  };
  const explicit = matches.filter(([type]) => explicitTitles[type]?.test(lines.find(Boolean) ?? ""));
  if (matches.length === 1 && explicit.length === 1 && (explicit[0][0] !== "everyday-life" || nontrivialPractical(text)))
    return result(explicit[0][0], "high", ["Genre explicitement identifié", explicit[0][2]]);
  if (matches.length) return result("unknown", "medium", matches.map(x => x[2]), matches.map(x => x[0]));
  const nonempty = lines.filter(Boolean);
  if (!turns && nonempty.length >= 3 && lines.includes("") && nonempty.every(l => l.length < 70) && !nonempty.some(l => /^\d+[.)]/u.test(l)))
    return result("unknown", "medium", ["Vers possibles ; genre non confirmé"], ["poetry", "unknown"]);
  return result("unknown", "low", ["Genre insuffisamment établi"], ["unknown"]);
}

export function importDocument(originalText: string, documentId: string, override?: EffectiveType, revision = 1): ContentDocument {
  if (typeof originalText !== "string" || originalText.length > MAX_TEXT_LENGTH || originalText.trim().split(/\s+/u).length > 2500 ||
    (originalText.match(/\p{L}/gu)?.length ?? 0) < 3) throw new Error("Collez un texte lisible (maximum 2 500 mots et 60 000 caractères).");
  const detection = detectContent(originalText);
  const type = override ?? detection.contentType;
  const actions: Normalization[] = [];
  const warnings: string[] = [];
  let rows = originalText.split(/\r\n|\r|\n/).map((text, i) => ({ text, originals: [i + 1] }));
  if (originalText.includes("\r")) actions.push({ kind: "newlines", originalLines: rows.map((_, i) => i + 1), detail: "Fins de ligne uniformisées" });
  // Repeated boundary markers are evidence of pagination, never bare numbers alone.
  const marker = (s: string) => s.trim().match(/^(?:Page\s+(\d{1,3})|[-—]\s*(\d{1,3})\s*[-—]|(\d{1,3}))$/iu);
  const boundaries = rows.map((r, i) => ({ i, m: marker(r.text) })).filter(({ i, m }) => m && i > 0 && i < rows.length - 1 && !rows[i - 1].text.trim() && !rows[i + 1].text.trim());
  const number = (m: RegExpMatchArray) => Number(m[1] ?? m[2] ?? m[3]);
  const remove = new Set<number>();
  for (let b = 0; b < boundaries.length; b++) {
    const { i, m } = boundaries[b];
    let before = i - 1; while (before >= 0 && !rows[before].text.trim()) before--;
    const previous = rows[before]?.text.trim() ?? "";
    const numericAnswer = /[?？]\s*$/u.test(previous) || (!!heading(previous) && !/[:：].+\S/u.test(previous));
    const sequential = (b > 0 && number(m!) === number(boundaries[b - 1].m!) + 1) || (b + 1 < boundaries.length && number(boundaries[b + 1].m!) === number(m!) + 1);
    if (!numericAnswer && (m![1] || m![2] || (sequential && /[.!)]\s*$/u.test(previous)))) {
      remove.add(i); actions.push({ kind: "pagination", originalLines: [i + 1], detail: "Marqueur de page isolé retiré" });
    } else warnings.push(`Ligne ${i + 1} : nombre isolé conservé (pagination incertaine).`);
  }
  rows = rows.filter((_, i) => !remove.has(i));
  if (type === "theatre") {
    const identities = new Map<string, number>();
    rows.forEach(r => { const h = heading(r.text); if (h) identities.set(speakerIdentity(h), (identities.get(speakerIdentity(h)) ?? 0) + 1); });
    let inDialogue = false;
    let awaitingSpeech = false;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.text.trim()) continue;
      if (/^\s*\(/u.test(row.text)) { if (!awaitingSpeech) inDialogue = false; continue; }
      const h = awaitingSpeech ? null : heading(row.text);
      awaitingSpeech = false;
      const nextSpoken = rows.slice(i + 1).find(r => r.text.trim() && !/^\s*\(/u.test(r.text));
      const bareConfirmed = !!nextSpoken && !heading(nextSpoken.text) && !act.test(nextSpoken.text.trim());
      if (h && (isChorusSpeaker(h) || (detection.contentType === "theatre" && (/[:：]/u.test(row.text) || bareConfirmed)) || (identities.get(speakerIdentity(h)) ?? 0) >= 2)) {
        const colon = row.text.search(/[:：]/u);
        const canonical = `${speakerIdentity(h)}:${colon >= 0 ? row.text.slice(colon + 1) : ""}`;
        if (canonical !== row.text) actions.push({ kind: "heading", originalLines: row.originals, detail: "En-tête de personnage normalisé" });
        row.text = canonical; inDialogue = true; awaitingSpeech = colon < 0 || !row.text.slice(row.text.indexOf(":") + 1).trim();
      }
      if (/^\s*\(/u.test(row.text) || act.test(row.text.trim())) { inDialogue = false; continue; }
      const next = rows[i + 1];
      if (inDialogue && /(?:^|\s)(?:non|demi|anti|ex)-$/u.test(row.text) && next && /^\p{Ll}+/u.test(next.text) && !heading(next.text)) {
        row.text += next.text; row.originals = [...row.originals, ...next.originals];
        actions.push({ kind: "wrap", originalLines: [...row.originals], detail: "Mot composé reconstitué dans une réplique (trait d’union conservé)" });
        rows.splice(i + 1, 1); i--;
      }
    }
  }
  const doc: ContentDocument = { title: "Texte importé", source: "Utilisateur", text: rows.map(r => r.text).join("\n"),
    originalText, documentId, revision, origin: "imported", contentType: type, typeSource: override ? "learner-override" : type === "unknown" ? "unknown" : "detected",
    detection, normalization: actions, warnings, sourceMap: rows.map((r, i) => ({ canonicalLine: i + 1, originalLines: r.originals })) };
  validateDocument(doc); return doc;
}
