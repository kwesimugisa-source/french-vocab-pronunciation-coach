// Server-only acceptance boundary. Model interpretation proposes the reading;
// source validation and the ambiguity policy decide whether it is ready.
import { createHash, randomUUID } from "node:crypto";
import { pronunciationInventory, pronunciationOccurrences, validatePronunciationProposal } from "./theatre-pronunciation";
import type { PronunciationAuthority, PronunciationEntry } from "./theatre-pronunciation";
import type { TheatrePlan } from "./theatre-generation";
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
function freeze<T>(value:T):T {
  if(value && typeof value==="object") { for(const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
export const pronunciationSourceDigest=(text:string,documentId:unknown,revision:unknown,characters:unknown)=>hash([text,documentId??null,revision??null,characters??[]]);
const resolved=(e:PronunciationEntry)=>e.classification!=="uncertain" && !!e.language && !!e.target.trim() &&
  (e.classification!=="french-convention" || e.language==="fr");

/** No name-specific dictionary or confidence threshold. Automatic acceptance
 * requires a source-linked, established interpretation, not just a valid target.
 * This validates the decision contract; it cannot prove model linguistic truth. */
export function isEstablishedPronunciation(e:PronunciationEntry):boolean {
  const r=e.resolution;
  if(!resolved(e) || !r || r.status!=="established" || !e.evidence.length || !r.rationale.trim()) return false;
  if(e.classification==="declared") return r.basis==="authored";
  if(e.classification==="preserved-foreign") return r.basis==="established-identity" || r.basis==="authored";
  if(r.basis!=="convention") return false;
  // A local clear dialogue language may establish a conventional reading in a
  // mixed production. A mixed/unknown local context cannot establish one by itself.
  return ["fr","en"].includes(r.localLanguage) && e.language===r.localLanguage;
}
function ready(draft:PronunciationAuthority,entries:PronunciationEntry[],plan:TheatrePlan,acceptance:"director-established"|"owner-confirmed",excludedIds:string[]=[]) {
  const occurrences=pronunciationOccurrences(entries,plan.items);
  if(entries.some(e=>!resolved(e) || !occurrences.some(o=>o.lexicalId===e.id))) throw new Error("Unresolved pronunciation");
  const accepted:PronunciationAuthority={...draft,acceptance,excludedIds:[...new Set(excludedIds)],status:"ready",inventoryReviewed:true,entries,occurrences,digest:""};
  accepted.digest=hash({...accepted,digest:undefined});
  return freeze(accepted);
}
export function draftPronunciation(plan:TheatrePlan,sourceDigest:string):PronunciationAuthority {
  const proposal=plan.analysis?.pronunciation;
  const productionLanguage=proposal?.context?.productionLanguage??"unknown";
  const entries=pronunciationInventory(proposal,plan.items,plan.pronunciationCharacters);
  const draft:PronunciationAuthority={version:1,policyVersion:2,productionLanguage,automaticIds:[],acceptance:"pending",excludedIds:[],productionId:randomUUID(),sourceDigest,revision:1,digest:"",status:"needs-clarification",inventoryReviewed:false,entries,occurrences:[]};
  // An absent/malformed/incomplete inventory is an analysis failure, not an
  // ambiguous pronunciation invented from silence. Ask for the missing inventory.
  if(!proposal?.context) return draft;
  try {
    const ambiguousIds=new Set<string>();
    const occurrences=pronunciationOccurrences(entries,plan.items,(a,b)=>{ambiguousIds.add(a);ambiguousIds.add(b);});
    draft.automaticIds=entries.filter(e=>!ambiguousIds.has(e.id) && isEstablishedPronunciation(e) && occurrences.some(o=>o.lexicalId===e.id)).map(e=>e.id);
  }
  catch { draft.automaticIds=[]; return draft; }
  // Empty, complete inventories are ready immediately, even in mixed-language plays.
  if(proposal.context.inventoryComplete && draft.automaticIds.length===entries.length) {
    try { return ready(draft,entries,plan,"director-established"); }
    catch { draft.automaticIds=[]; }
  }
  return draft;
}
export function acceptPronunciation(draft:PronunciationAuthority,answer:unknown,plan:TheatrePlan):PronunciationAuthority {
  const a=answer as {inventoryReviewed?:unknown;entries?:unknown;excludedIds?:unknown};
  if(draft.policyVersion!==2 || draft.status!=="needs-clarification" || a?.inventoryReviewed!==true) throw new Error("Clarification required");
  const proposal=validatePronunciationProposal({version:1,entries:a.entries},plan.items);
  if(!proposal || proposal.entries.some(e=>!resolved(e) || draft.automaticIds.includes(e.id))) throw new Error("Unresolved pronunciation");
  const excludedIds=a.excludedIds??[];
  if(!Array.isArray(excludedIds) || excludedIds.length>draft.entries.length || excludedIds.some(id=>typeof id!=="string" || !draft.entries.some(e=>e.id===id) || draft.automaticIds.includes(id) || proposal.entries.some(e=>e.id===id))) throw new Error("Invalid inventory correction");
  if(draft.entries.some(e=>!draft.automaticIds.includes(e.id) && !excludedIds.includes(e.id) && !proposal.entries.some(p=>p.id===e.id && p.name===e.name))) throw new Error("Missing name");
  const entries=[...draft.entries.filter(e=>draft.automaticIds.includes(e.id)),...proposal.entries];
  if(!validatePronunciationProposal({version:1,entries},plan.items)) throw new Error("Invalid combined inventory");
  return ready(draft,entries,plan,"owner-confirmed",excludedIds as string[]);
}
export function assertPronunciationAuthority(plan:TheatrePlan) {
  const a=plan.pronunciation;
  if(!a || a.version!==1 || a.policyVersion!==2 || !["owner-confirmed","director-established"].includes(a.acceptance) || a.status!=="ready" || !a.inventoryReviewed || !validatePronunciationProposal({version:1,entries:a.entries},plan.items) || a.entries.some(e=>!resolved(e)) || a.digest!==hash({...a,digest:undefined}) ||
    JSON.stringify(a.occurrences)!==JSON.stringify(pronunciationOccurrences(a.entries,plan.items))) throw new Error("Invalid pronunciation authority");
  freeze(a);
}
