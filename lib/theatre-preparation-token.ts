/** Purpose-separated, authenticated transport; no server storage or public endpoint. */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { validatePreparation, assertContinuation, protocolError } from "./theatre-preparation-protocol";
import type { Preparation, ContinuationScope } from "./theatre-preparation-protocol";
import { composeTheatrePlan, createCanonicalPreparation } from "./theatre-two-pass";
import { stableProtocol } from "./theatre-preparation-protocol";
import type { CanonicalPreparation } from "./theatre-two-pass";

export const PREPARATION_TOKEN_TTL = 2 * 60 * 60_000;
export const PREPARATION_TOKEN_BYTES = 1_000_000;
export const PREPARATION_TOKEN_CHARS = 450_000;
type Purpose = "preparation-v1" | "ready-v3";
const domain = (purpose: Purpose) => `theatre-two-pass:${purpose}`;
const key = (purpose: Purpose, secret: string) => createHash("sha256").update(`${domain(purpose)}\0${secret}`).digest();
type Envelope = { version: 1 | 3; purpose: Purpose; issued: number; expires: number; preparation: Preparation; speed: number | null; language: "fr" };
function sourceOnly(p: CanonicalPreparation) {
  const { items: _items, casting: _casting, sourceDigest: _sourceDigest, canonicalDigest: _canonicalDigest, ...source } = p;
  return source;
}
function seal(envelope: Envelope, secret: string): string {
  // Store source once; reconstruct canonical items/casting deterministically on open.
  const encoded = Buffer.from(JSON.stringify({ ...envelope, preparation: { ...envelope.preparation, canonical: sourceOnly(envelope.preparation.canonical) } }));
  if (encoded.length > PREPARATION_TOKEN_BYTES) throw new Error("PREPARATION_TOO_LARGE");
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(envelope.purpose, secret), iv);
  cipher.setAAD(Buffer.from(domain(envelope.purpose)));
  const encrypted = Buffer.concat([cipher.update(deflateRawSync(encoded)), cipher.final()]);
  const token = `${envelope.purpose}.${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url")}`;
  if (token.length > PREPARATION_TOKEN_CHARS) throw new Error("PREPARATION_TOO_LARGE");
  return token;
}
function open(token: unknown, secret: string, purpose: Purpose, now: number): Envelope {
  try {
    if (typeof token !== "string" || token.length > PREPARATION_TOKEN_CHARS || !token.startsWith(`${purpose}.`)) protocolError();
    const encoded = token.slice(purpose.length + 1);
    if (encoded.length < 40 || !/^[A-Za-z0-9_-]+$/.test(encoded)) protocolError();
    const bytes = Buffer.from(encoded, "base64url"), decipher = createDecipheriv("aes-256-gcm", key(purpose, secret), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(domain(purpose))); decipher.setAuthTag(bytes.subarray(12, 28));
    const json = inflateRawSync(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]), { maxOutputLength: PREPARATION_TOKEN_BYTES });
    const e = JSON.parse(json.toString()) as Envelope;
    if (Object.keys(e).sort().join() !== ["version", "purpose", "issued", "expires", "preparation", "speed", "language"].sort().join() ||
      e.purpose !== purpose || e.version !== (purpose === "ready-v3" ? 3 : 1) || e.language !== "fr" ||
      !Number.isSafeInteger(e.issued) || !Number.isSafeInteger(e.expires) || e.issued < 0 || e.issued > now || e.expires <= now || e.expires - e.issued !== PREPARATION_TOKEN_TTL) protocolError();
    const p = e.preparation.canonical;
    const rebuilt = createCanonicalPreparation(p.text, { productionId: p.productionId, documentId: p.documentId, documentRevision: p.documentRevision,
      ...(p.characters.length ? { characters: p.characters } : {}), ...(p.narratorVoice ? { narratorVoice: p.narratorVoice } : {}), performanceStyle: p.performanceStyle });
    if (!rebuilt.ok || stableProtocol(sourceOnly(rebuilt.value)) !== stableProtocol(p)) protocolError();
    e.preparation = validatePreparation({ ...e.preparation, canonical: rebuilt.value });
    return e;
  } catch { return protocolError(); }
}
export function sealPreparation(s: Preparation, secret: string, now = Date.now()): string {
  validatePreparation(s);
  if (s.state === "READY" || s.state === "CANCELLED") protocolError();
  return seal({ version: 1, purpose: "preparation-v1", issued: now, expires: now + PREPARATION_TOKEN_TTL, preparation: s, speed: null, language: "fr" }, secret);
}
export function openPreparation(token: unknown, secret: string, expected: ContinuationScope, now = Date.now()): Preparation {
  const e = open(token, secret, "preparation-v1", now);
  if (e.speed !== null) protocolError();
  assertContinuation(e.preparation, expected);
  return e.preparation;
}
export function sealTwoPassScene(s: Preparation, speed: number, secret: string, now = Date.now()): string {
  validatePreparation(s);
  if (s.state !== "READY" || !Number.isFinite(speed) || speed < .25 || speed > 4) protocolError();
  return seal({ version: 3, purpose: "ready-v3", issued: now, expires: now + PREPARATION_TOKEN_TTL, preparation: s, speed, language: "fr" }, secret);
}
/** Recompose from authenticated artifacts. Never trust a serialized pre-composed plan. */
export function openTwoPassScene(token: unknown, secret: string, now = Date.now()) {
  const e = open(token, secret, "ready-v3", now), s = e.preparation;
  if (s.state !== "READY" || typeof e.speed !== "number" || !Number.isFinite(e.speed) || e.speed < .25 || e.speed > 4) protocolError();
  const plan = composeTheatrePlan(s.canonical, s.production!, s.authority!, s.performance!);
  if (!plan.ok) protocolError();
  return { version: 3 as const, expires: e.expires, plan: plan.value, speed: e.speed, language: e.language };
}
