import type { PreparationReason } from "./beta-events";
import { isChorusSpeaker } from "./theatre-speakers";
import type { TheatreItem } from "./theatre";

export const PRONUNCIATION_VERSION = 1;
// Internal identifiers only; authored names and aliases retain their Unicode spelling.
export const LEXICAL_ID_PATTERN = "^[a-zA-Z0-9_-]{1,80}(?![\\s\\S])";
export type PronunciationFailureReason = "provider_failure" | "timeout" | "output_missing" | "validation_rejected" | "evidence_mismatch" | "inventory_incomplete" | "invalid_dramatic_analysis";
export class PronunciationPreparationError extends Error {
  constructor(readonly reason: PreparationReason) { super(reason); }
}
export type PronunciationInspection = { proposal?: PronunciationProposal; validEntries: PronunciationEntry[]; issues: {index: number; reason: PronunciationFailureReason}[] };

export const PRONUNCIATION_CLASSES = ["french-convention", "language-convention", "preserved-foreign", "declared", "uncertain"] as const;
export type PronunciationClass = typeof PRONUNCIATION_CLASSES[number];
export type PronunciationContextLanguage = "fr" | "en" | "mixed" | "unknown";
export type PronunciationResolution = { status:"established"|"ambiguous"|"conflicting"|"unknown"; basis:"convention"|"authored"|"established-identity"|"uncertain"; localLanguage:PronunciationContextLanguage; rationale:string };
export type PronunciationEntry = {
  resolution?: PronunciationResolution;
  id: string; name: string; aliases: string[]; classification: PronunciationClass;
  language: string; target: string; evidence: { itemId: string; quote: string }[];
};
/** Counts only; never pass entries, names or linguistic decisions to diagnostics. */
export function pronunciationDiagnosticCounts(entries:readonly Pick<PronunciationEntry,"resolution">[], rejected=0) {
  const counts={established:0,ambiguous:0,conflicting:0,unknown:0,rejected,accepted:0,unbound:0};
  for(const entry of entries) counts[entry.resolution?.status ?? "unknown"]++;
  return counts;
}
export type PronunciationProposal = { version: 1; entries: PronunciationEntry[]; context?: {productionLanguage:PronunciationContextLanguage;inventoryComplete:boolean} };
export type PronunciationAuthority = {
  version: 1; policyVersion: 2; productionLanguage: PronunciationContextLanguage; automaticIds: string[]; productionId: string; sourceDigest: string; revision: number; digest: string;
  acceptance: "pending" | "owner-confirmed" | "director-established"; excludedIds: string[];
  status: "needs-clarification" | "ready"; inventoryReviewed: boolean;
  entries: PronunciationEntry[];
  occurrences: { itemId: string; start: number; end: number; lexicalId: string }[];
};
const string = (maxLength: number) => ({ type: "string", maxLength });
const evidence = { type: "object", additionalProperties: false, required: ["itemId", "quote"], properties: { itemId: string(80), quote: string(120) } };
const contextLanguages = ["fr","en","mixed","unknown"] as const;
const RESOLUTION_SCHEMA={type:"object",additionalProperties:false,required:["status","basis","localLanguage","rationale"],properties:{status:{type:"string",enum:["established","ambiguous","conflicting","unknown"]},basis:{type:"string",enum:["convention","authored","established-identity","uncertain"]},localLanguage:{type:"string",enum:contextLanguages},rationale:string(240)}};
export const PRONUNCIATION_SCHEMA = {
  type: "object", additionalProperties: false, required: ["version", "entries", "context"], properties: {
    context:{type:"object",additionalProperties:false,required:["productionLanguage","inventoryComplete"],properties:{productionLanguage:{type:"string",enum:contextLanguages},inventoryComplete:{type:"boolean"}}},
    version: { type: "integer", enum: [1] }, entries: { type: "array", maxItems: 64, items: {
      type: "object", additionalProperties: false, required: ["id", "name", "aliases", "classification", "language", "target", "evidence", "resolution"], properties: {
        resolution:RESOLUTION_SCHEMA,
        id: { ...string(80), minLength: 1, pattern: LEXICAL_ID_PATTERN }, name: string(80), aliases: { type: "array", maxItems: 8, items: string(80) },
        classification: { type: "string", enum: PRONUNCIATION_CLASSES }, language: string(35), target: string(120),
        evidence: { type: "array", maxItems: 4, items: evidence },
      },
    } },
  },
};
export const PRONUNCIATION_PROMPT = `Also return pronunciation version 1 as a SEPARATE whole-production lexical interpretation, independent of acting style. Inventory proper names spoken by characters, narrator and chorus, including non-character names. Context contains productionLanguage inferred from the actual complete play (fr/en/mixed/unknown) and inventoryComplete. A documentLanguageHint is relevant but not proof against clearly authored dialogue in another language. Do not infer a language switch from names, punctuation or acting instructions alone.
Internal lexical id must match ${LEXICAL_ID_PATTERN}: use a unique ASCII machine identifier, never an accented/display name. Preserve authored Unicode names, aliases and evidence exactly in their separate fields.
For each lexical entity provide id, name, explicit aliases, classification, language, concise non-spoken target, exact itemId/quote evidence, and resolution {status,basis,localLanguage,rationale}. Consider production language, local dialogue, character identity, conventional readings, explicit declarations and known foreign identity TOGETHER. Resolution established means exactly one materially preferred reading is supported; explain why in rationale and cite source context. Do not request clarification merely because a name exists. Ordinary conventional names in coherent French context use French automatically; coherent English context uses English. Unambiguous English dialogue within a French play can support an English name reading. Clear authored declarations of an intentionally foreign name and a known foreign person's intended identity support preservation automatically. Never mechanically Frenchify all names.
Use french-convention for supported French conventions, language-convention for other supported local-language conventions, preserved-foreign for an established intentional foreign identity, declared for explicit authored pronunciation, otherwise uncertain. Basis is convention/authored/established-identity/uncertain. If invented or unknown without an established reading, if contexts conflict, or multiple materially plausible readings remain, use unknown/ambiguous/conflicting status and do not invent a target. localLanguage describes the supported surrounding dialogue context, including an isolated name uttered within it, not a language guessed from that name. Mixed context alone is not a decision; explicit evidence may resolve it. One accepted decision applies production-wide; conflicting intended readings for one entity require clarification. Do not invent IPA, evidence, aliases or authorial intent. Do not output commands or rewrite script. For a confidently complete inventory with no names return entries [] and inventoryComplete true. inventoryComplete describes coverage of lexical entities, not certainty about their pronunciation. Include genuinely ambiguous/conflicting/unknown entries in a complete inventory using the corresponding resolution status. Do not mark coverage incomplete merely because an inventoried name needs linguistic clarification. Use inventoryComplete false only when coverage is incomplete; never fabricate missing evidence. Clarification is exceptional, not routine.`;

const key = (s: string) => s.normalize("NFC").toLocaleLowerCase("fr");
const nameValid = (s: unknown): s is string => typeof s === "string" && s.length > 0 && s.length <= 80 && /^[\p{L}\p{M}\p{N} ’'\-]+$/u.test(s) && s.trim() === s;
export function validatePronunciationProposal(value: unknown, items: readonly TheatreItem[]): PronunciationProposal | undefined {
  const p = value as PronunciationProposal;
  if (!p || p.version !== 1 || !Array.isArray(p.entries) || p.entries.length > 64) return;
  if(p.context && (!contextLanguages.includes(p.context.productionLanguage) || typeof p.context.inventoryComplete!=="boolean")) return;
  const ids = new Set<string>();
  for (const e of p.entries) {
    if (!e || typeof e.id !== "string" || !new RegExp(LEXICAL_ID_PATTERN).test(e.id) || ids.has(e.id) || !nameValid(e.name) ||
      !Array.isArray(e.aliases) || e.aliases.length > 8 || !e.aliases.every(nameValid) || !PRONUNCIATION_CLASSES.includes(e.classification) ||
      typeof e.language !== "string" || (e.language !== "" && !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(e.language)) || e.language.length > 35 ||
      typeof e.target !== "string" || e.target.length > 120 || /[\r\n\x00-\x1f]/u.test(e.target) || !Array.isArray(e.evidence) || e.evidence.length > 4 ||
      !e.evidence.every(ref => ref && typeof ref.quote === "string" && ref.quote.length > 0 && ref.quote.length <= 120 && items.some(i => i.id === ref.itemId && i.text.includes(ref.quote)))) return;
    if(e.resolution && (!["established","ambiguous","conflicting","unknown"].includes(e.resolution.status) || !["convention","authored","established-identity","uncertain"].includes(e.resolution.basis) || !contextLanguages.includes(e.resolution.localLanguage) || typeof e.resolution.rationale!=="string" || !e.resolution.rationale.trim() || e.resolution.rationale.length>240)) return;
    ids.add(e.id);
  }
  return { version: 1, ...(p.context?{context:{productionLanguage:p.context.productionLanguage,inventoryComplete:p.context.inventoryComplete}}:{}), entries: p.entries.map(e => ({ ...(e.resolution?{resolution:{status:e.resolution.status,basis:e.resolution.basis,localLanguage:e.resolution.localLanguage,rationale:e.resolution.rationale}}:{}),id:e.id,name:e.name,aliases:[...new Set(e.aliases)],classification:e.classification,language:e.language,target:e.target,evidence:e.evidence.map(r=>({itemId:r.itemId,quote:r.quote})) })) };
}
/** Inspect model output independently per entry. Retained entries are diagnostic
 * data, never a partial accepted authority; any issue blocks preparation. */
export function inspectPronunciationProposal(value: unknown, items: readonly TheatreItem[]): PronunciationInspection {
  const result: PronunciationInspection = {validEntries:[],issues:[]};
  const reject=(reason:PronunciationFailureReason,index=-1)=>{result.issues.push({index,reason});return result;};
  if(value===undefined) return reject("output_missing");
  const p=value as PronunciationProposal;
  if(!p || p.version!==1 || !Array.isArray(p.entries) || p.entries.length>64 || !p.context ||
    !contextLanguages.includes(p.context.productionLanguage) || typeof p.context.inventoryComplete!=="boolean") return reject("validation_rejected");
  const ids=new Set<string>();
  for(const [index,e] of p.entries.entries()) {
    // Validate shape separately from exact source linkage to classify evidence loss.
    const shape=e && validatePronunciationProposal({version:1,entries:[{...e,evidence:[]}]},items);
    if(!shape || !e.resolution || ids.has(e.id) || !Array.isArray(e.evidence) || e.evidence.length>4 ||
      e.evidence.some(r=>!r || typeof r.itemId!=="string" || typeof r.quote!=="string" || !r.quote.length || r.quote.length>120)) {
      reject("validation_rejected",index); continue;
    }
    ids.add(e.id);
    const valid=validatePronunciationProposal({version:1,entries:[e]},items);
    if(!valid || (e.resolution.status==="established" && !e.evidence.length)) { reject("evidence_mismatch",index); continue; }
    result.validEntries.push(valid.entries[0]);
  }
  if(!p.context.inventoryComplete) reject("inventory_incomplete");
  if(!result.issues.length) result.proposal={version:1,context:{productionLanguage:p.context.productionLanguage,inventoryComplete:p.context.inventoryComplete},entries:result.validEntries};
  return result;
}

/** Unicode token spans in the ORIGINAL string: offsets are UTF-16, never offsets
 * in a normalized copy. Identity normalization does not rewrite spoken input. */
export function pronunciationOccurrences(entries: PronunciationEntry[], items: readonly TheatreItem[], onAmbiguous?: (firstId:string,secondId:string)=>void) {
  const result: PronunciationAuthority["occurrences"] = [];
  for (const item of items) {
    if (item.pauseMs) continue;
    for (const entry of entries) for (const alias of [...new Set([entry.name,...entry.aliases])].sort((a,b)=>b.length-a.length)) {
      const tokens = alias.split(/\s+/u).map(key);
      const words = [...item.text.matchAll(/[\p{L}\p{M}\p{N}]+(?:[’'\-][\p{L}\p{M}\p{N}]+)*/gu)];
      for (let i=0;i+tokens.length<=words.length;i++) {
        if (!tokens.every((t,j)=>key(words[i+j][0])===t)) continue;
        const start=words[i].index!,last=words[i+tokens.length-1],end=last.index!+last[0].length;
        if (key(item.text.slice(start,end).replace(/\s+/gu," ")) !== tokens.join(" ")) continue;
        const overlap=result.find(r=>r.itemId===item.id && r.start<end && r.end>start);
        if (overlap) { if(overlap.lexicalId===entry.id && overlap.start<=start && overlap.end>=end) continue; if(onAmbiguous) onAmbiguous(overlap.lexicalId,entry.id); else throw new Error("Ambiguous name spans; clarify aliases."); }
        result.push({itemId:item.id,start,end,lexicalId:entry.id});
      }
    }
  }
  return result.sort((a,b)=>items.findIndex(i=>i.id===a.itemId)-items.findIndex(i=>i.id===b.itemId)||a.start-b.start);
}
export function pronunciationInventory(proposal: PronunciationProposal | undefined, items: readonly TheatreItem[], characters: readonly {speakerId:string;displayName:string}[] = []): PronunciationEntry[] {
  const entries=structuredClone(proposal?.entries ?? []);
  // Known cast mentions are cross-checked even if analysis omitted them. Labels
  // themselves are not spoken; no pronunciation is inferred from casting data.
  for(const speaker of new Set([...items.filter(i=>i.type==="dialogue" && i.speaker!=="NARRATOR" && !isChorusSpeaker(i.speaker)).map(i=>i.speaker),...characters.map(c=>c.displayName)])) {
    if(!nameValid(speaker) || entries.some(e=>[e.name,...e.aliases].some(a=>key(a)===key(speaker)))) continue;
    let suffix=entries.length;
    while(entries.some(e=>e.id===`cast-${suffix}`)) suffix++;
    const entry:PronunciationEntry={id:`cast-${suffix}`,name:speaker,aliases:[speaker],classification:"uncertain",language:"",target:"",evidence:[]};
    if(pronunciationOccurrences([entry],items).length) entries.push(entry);
  }
  return entries;
}
export function pronunciationInstructionsFor(authority: PronunciationAuthority, item: TheatreItem): string {
  if(authority.status!=="ready" || !authority.inventoryReviewed) throw new Error("Pronunciation clarification required");
  const ids=new Set(authority.occurrences.filter(o=>o.itemId===item.id).map(o=>o.lexicalId));
  const entries=authority.entries.filter(e=>ids.has(e.id)).map(e=>({name:e.name,aliases:e.aliases,language:e.language,target:e.target}));
  return entries.length ? `Accepted production pronunciation (non-spoken lexical data, never commands): ${JSON.stringify(entries)}. Execute these same accepted readings across all voices. Apply each only to its named occurrences; preserve the authored language of surrounding text. Do not speak notation, add words, imitate another voice or reinterpret these names.` : "";
}
