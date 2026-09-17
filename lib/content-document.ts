import { segmentExercises, TongueTwisters, validatePractice } from "./tongue-twisters";
import type { ArticleData } from "./types";

export const CONTENT_TYPES = ["news", "opinion", "creative", "conversation", "academic", "everyday-life", "poetry", "theatre", "tongue-twisters"] as const;
export type ContentType = typeof CONTENT_TYPES[number];
export type EffectiveType = ContentType | "unknown";
export const CONTENT_LABELS: Record<EffectiveType, string> = {
  news: "Actualités", opinion: "Opinion", creative: "Créatif", conversation: "Conversation", academic: "Académique",
  "everyday-life": "Vie quotidienne", poetry: "Poésie", theatre: "Pièce de théâtre", "tongue-twisters": "Virelangues", unknown: "Non déterminé",
};
export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Detection = { confidence: "high" | "medium" | "low"; candidates: EffectiveType[]; evidence: string[] };
export type SourceLine = { canonicalLine: number; originalLines: number[] };
export type Normalization = { kind: "heading" | "pagination" | "wrap" | "newlines"; originalLines: number[]; detail: string };
export type ContentIdentity = { documentId: string; revision: number; contentType: EffectiveType };
export type ContentDocument = ArticleData & ContentIdentity & {
  tongueTwisters?: TongueTwisters;
  origin: "generated" | "imported";
  originalText: string;
  typeSource: "generated" | "detected" | "learner-override" | "unknown";
  detection: Detection;
  normalization: Normalization[];
  warnings: string[];
  sourceMap: SourceLine[];
};
export const MAX_TEXT_LENGTH = 60000;
export const TTS_INPUT_LIMIT = 4096;
export function isContentType(value: unknown): value is ContentType { return CONTENT_TYPES.includes(value as ContentType); }
export function isEffectiveType(value: unknown): value is EffectiveType { return value === "unknown" || isContentType(value); }
export function validateArticle(value: unknown): asserts value is ArticleData {
  const v = value as ArticleData | null;
  if (!v || typeof v !== "object" || typeof v.title !== "string" || !v.title.trim() ||
    typeof v.text !== "string" || !v.text.trim() || v.text.length > MAX_TEXT_LENGTH ||
    (v.source !== undefined && typeof v.source !== "string") || (v.level !== undefined && typeof v.level !== "string"))
    throw new Error("Le texte reçu est incomplet ou invalide.");
}
export function validateIdentity(value: unknown): asserts value is ContentIdentity {
  const v = value as ContentIdentity | null;
  if (!v || typeof v.documentId !== "string" || !v.documentId.trim() || v.documentId.length > 100 ||
    !Number.isSafeInteger(v.revision) || v.revision < 1 || !isEffectiveType(v.contentType)) throw new Error("Identité du document invalide.");
}
export function validateDocument(value: unknown): asserts value is ContentDocument {
  validateArticle(value); validateIdentity(value);
  const v = value as ContentDocument;
  if (!["generated", "imported"].includes(v.origin) || !["generated", "detected", "learner-override", "unknown"].includes(v.typeSource) ||
    typeof v.originalText !== "string" || !v.originalText.trim() || v.originalText.length > MAX_TEXT_LENGTH ||
    !v.detection || !["high", "medium", "low"].includes(v.detection.confidence) ||
    !Array.isArray(v.detection.candidates) || !v.detection.candidates.every(isEffectiveType) ||
    !Array.isArray(v.detection.evidence) || !v.detection.evidence.every(x => typeof x === "string") ||
    !Array.isArray(v.warnings) || !v.warnings.every(x => typeof x === "string") || !Array.isArray(v.normalization) ||
    !Array.isArray(v.sourceMap) || v.sourceMap.length !== v.text.split("\n").length)
    throw new Error("Métadonnées du document invalides.");
  if (v.tongueTwisters !== undefined) {
    if (v.contentType !== "tongue-twisters") throw new Error("Exercices incompatibles avec le type du document.");
    validatePractice(v.tongueTwisters, v.text);
  }
  const count = v.originalText.split(/\r\n|\r|\n/).length;
  const validLines = (lines: number[]) => Array.isArray(lines) && lines.length > 0 && lines.every(n => Number.isInteger(n) && n >= 1 && n <= count);
  if (!v.sourceMap.every((m, i) => m.canonicalLine === i + 1 && validLines(m.originalLines)) ||
    !v.normalization.every(a => ["heading", "pagination", "wrap", "newlines"].includes(a.kind) && typeof a.detail === "string" && validLines(a.originalLines)))
    throw new Error("Correspondance avec le texte original invalide.");
  if (v.origin === "imported" && v.level !== undefined) throw new Error("Niveau importé non vérifié.");
  if ((v.origin === "generated" && (v.typeSource !== "generated" || !isContentType(v.contentType) || !LEVELS.includes(v.level as typeof LEVELS[number]))) ||
    (v.origin === "imported" && v.typeSource === "generated") ||
    (v.typeSource === "unknown" && v.contentType !== "unknown")) throw new Error("Provenance incohérente.");
  const mapped = v.sourceMap.flatMap(m => m.originalLines);
  if (mapped.some((line, i) => i > 0 && line <= mapped[i - 1])) throw new Error("Ordre des lignes source invalide.");
  const accounted = new Set([...mapped, ...v.normalization.filter(a => a.kind === "pagination").flatMap(a => a.originalLines)]);
  if (accounted.size !== count) throw new Error("Ligne source non représentée.");
}
export function sourceMap(text: string): SourceLine[] { return text.split("\n").map((_, i) => ({ canonicalLine: i + 1, originalLines: [i + 1] })); }
export function generatedDocument(article: unknown, contentType: ContentType, level: string, documentId: string): ContentDocument {
  validateArticle(article);
  if (!isContentType(contentType) || !LEVELS.includes(level as typeof LEVELS[number])) throw new Error("Type ou niveau invalide.");
  const doc: ContentDocument = { ...article, level, documentId, revision: 1, contentType, origin: "generated", originalText: article.text,
    typeSource: "generated", detection: { confidence: "high", candidates: [contentType], evidence: ["Type demandé à la génération"] },
    normalization: [], warnings: [], sourceMap: sourceMap(article.text) };
  if (contentType === "tongue-twisters") doc.tongueTwisters = segmentExercises(doc.text);
  validateDocument(doc); return doc;
}
