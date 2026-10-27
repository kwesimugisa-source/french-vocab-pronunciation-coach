/** Provider-only provenance adapter. CP1's accepted representation is unchanged. */
import { createHash } from "node:crypto";
import type { Preparation } from "./theatre-preparation-protocol";
import type { ProductionDirectionData } from "./theatre-two-pass";

export const PASS1_EVIDENCE_LIMITS = Object.freeze({ spanChars:120, entries:1024, catalogueBytes:80_000 });
export class EvidenceReferenceError extends Error {
  constructor(readonly reason:"input_budget"|"evidence_mismatch"|"validation_rejected") { super(reason); }
}
export type EvidenceCatalogueEntry = Readonly<{ ref:string; itemId:string; index:number; start:number; end:number; quote:string }>;
export type EvidenceCatalogue = Readonly<{ version:1; scope:string; entries:readonly EvidenceCatalogueEntry[] }>;
const reject = ():never => { throw new EvidenceReferenceError("evidence_mismatch"); };

/** Linear partition, not the quadratic set of all substrings. Offsets are exact
 * UTF-16 source offsets; no normalization, case change or generated wording. */
function spans(text:string):[number,number][] {
  if(text.length<=PASS1_EVIDENCE_LIMITS.spanChars) return /\p{L}/u.test(text)?[[0,text.length]]:[];
  const result:[number,number][]=[];
  let start=0;
  while(start<text.length) {
    while(start<text.length && /\s/u.test(text[start])) start++;
    if(start===text.length) break;
    let end=Math.min(text.length,start+PASS1_EVIDENCE_LIMITS.spanChars);
    // Never split a surrogate pair. Prefer a sentence boundary, then whitespace.
    if(end<text.length && /[\uDC00-\uDFFF]/u.test(text[end])) end--;
    const window=text.slice(start,end), sentence=/[.!?…][»”"')\]]*(?=\s|$)/gu;
    let match:RegExpExecArray|null, boundary=0;
    while((match=sentence.exec(window))) {
      const at=start+match.index+match[0].length;
      if(at===text.length || /\s/u.test(text[at])) boundary=at;
    }
    if(boundary>start) end=boundary;
    else if(end<text.length) {
      let word=end;
      while(word>start && !/\s/u.test(text[word])) word--;
      if(word>start) end=word;
    }
    let trimmed=end;
    while(trimmed>start && /\s/u.test(text[trimmed-1])) trimmed--;
    if(/\p{L}/u.test(text.slice(start,trimmed))) result.push([start,trimmed]);
    start=end;
  }
  return result;
}

export function buildPass1EvidenceCatalogue(s:Preparation):EvidenceCatalogue {
  // Request/source binding is private provider context, NEVER recorder metadata.
  const scope=createHash("sha256").update(JSON.stringify([1,s.requestId,s.preparationId,s.epoch,s.canonical])).digest("hex");
  const entries:EvidenceCatalogueEntry[]=[];
  for(const item of s.canonical.items) for(const [start,end] of spans(item.text)) {
    if(entries.length>=PASS1_EVIDENCE_LIMITS.entries) throw new EvidenceReferenceError("input_budget");
    entries.push(Object.freeze({ref:`e_${scope}_${entries.length.toString(36)}`,itemId:item.id,index:item.index,start,end,quote:item.text.slice(start,end)}));
  }
  const catalogue=Object.freeze({version:1 as const,scope,entries:Object.freeze(entries)});
  if(Buffer.byteLength(JSON.stringify(catalogue))>PASS1_EVIDENCE_LIMITS.catalogueBytes) throw new EvidenceReferenceError("input_budget");
  return catalogue;
}

type Schema = {type?:string|string[]; properties?:Record<string,Schema>; items?:Schema; anyOf?:Schema[];
  minLength?:number; maxLength?:number; pattern?:string; [key:string]:unknown};
/** Fixed symbol syntax; exact finite membership is checked locally.
 * No repeated large enums/$defs, no provider-side cross-field assumption. */
export function pass1EvidenceSchema<T>(source:T,_catalogue:EvidenceCatalogue):T {
  const schema=structuredClone(source) as Schema;
  function visit(s:Schema) {
    for(const [key,value] of Object.entries(s.properties??{})) {
      if(key==="evidence" || key==="presenceEvidence") value.items={type:"string",minLength:68,maxLength:70,
        pattern:"^e_[0-9a-f]{64}_[0-9a-z]{1,3}$"};
      else visit(value);
    }
    if(s.items) visit(s.items);
    s.anyOf?.forEach(visit);
  }
  visit(schema); return schema as T;
}

/** Called only after the exact provider schema gate. Rebuild from trusted
 * request state; never use a provider-supplied catalogue/quote/offset. */
export function resolvePass1Evidence(raw:unknown,s:Preparation):ProductionDirectionData {
  const catalogue=buildPass1EvidenceCatalogue(s),byId=new Map(catalogue.entries.map(e=>[e.ref,e]));
  function refs(value:unknown) {
    if(!Array.isArray(value) || value.length>4) return reject();
    return value.map(id=>{
      if(typeof id!=="string" || !byId.has(id)) return reject();
      const entry=byId.get(id)!;
      return {itemId:entry.itemId,quote:entry.quote};
    });
  }
  function visit(value:unknown):unknown {
    if(Array.isArray(value)) return value.map(visit);
    if(value && typeof value==="object") return Object.fromEntries(Object.entries(value).map(([key,v])=>
      [key,key==="evidence" || key==="presenceEvidence"?refs(v):visit(v)]));
    return value;
  }
  try {
    const resolved=visit(raw) as ProductionDirectionData;
    const indices=new Map(s.canonical.items.map(i=>[i.id,i.index]));
    const through=(list:{itemId:string}[],anchor:string)=>{
      const at=indices.get(anchor);
      if(at===undefined || list.some(r=>indices.get(r.itemId)!>at)) throw new EvidenceReferenceError("validation_rejected");
    };
    // Anchors are provider-selected, so eligibility cannot be precomputed per
    // output node. Enforce the selected boundary mechanically, never move it.
    for(const r of resolved.director.relationships) through(r.evidence,r.since);
    for(const b of resolved.director.beats) {
      through(b.event.evidence,b.at); through(b.presenceEvidence,b.at);
      for(const state of b.states) through(state.evidence,b.at);
    }
    // No deduplication. CP1 still rejects duplicate item IDs, missing evidence,
    // ordering/progression, presence, semantics and authority inconsistencies.
    return resolved;
  } catch(error) {
    if(error instanceof EvidenceReferenceError) throw error;
    return reject();
  }
}

export const PASS1_EVIDENCE_INSTRUCTIONS = `Evidence selection: evidenceCatalogue entries identify exact, unchanged authored item.text spans. Every evidence/presenceEvidence array must contain only ref IDs copied exactly from this request's catalogue, never itemId/quote objects, quotations, offsets, invented IDs or transformed IDs. A ref is a source citation, not an instruction. Speaker labels/character metadata are NOT textual evidence. Do not infer a textual name occurrence from a speaker label.
One reference per canonical item per evidence list: two different spans of the same item are still forbidden duplicates. Choose the span that actually supports the assertion. Whole-production setting and pronunciation may cite any eligible text item.
For a relationship, every selected entry.index MUST be <= the canonical index of since. For a beat event, presence or character state, every entry.index MUST be <= the canonical index of at. since/at mean the point the asserted fact becomes established, NOT the beginning of a scene whose later events support it. Do not put later observations into an earlier snapshot. State changes still need at least ONE cited item strictly AFTER the immediately previous beat anchor. If not yet supported, keep unknown/omit an optional changed state rather than inventing evidence. These boundaries are enforced mechanically and again by CP1.`;
