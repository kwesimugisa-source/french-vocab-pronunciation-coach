// Server adapter: exactly one CP3 pass per HTTP request. No monolithic fallback.
import { createHmac } from "node:crypto";
import type OpenAI from "openai";
import { createCanonicalPreparation } from "./theatre-two-pass";
import { runProductionPass, runPerformancePass } from "./theatre-pass-orchestration";
import type { PreparationResult } from "./theatre-pass-orchestration";
import { openPreparation } from "./theatre-preparation-token";
import { openScene, sceneManifest } from "./theatre-scene-ticket";
import { PreparationCaches } from "./theatre-preparation-cache";
import { theatreContinuation } from "./theatre-preparation-client";
import type { TheatreCharacter } from "./theatre-characters";
import type { TheatreStyle } from "./theatre-performance";
import type { PreparationRecord } from "./beta-events";
import { isPreparationId } from "./beta-events";

const caches = new PreparationCaches();
type Input = { text:string; documentId?:string; revision?:number; performanceStyle:TheatreStyle;
  theatreCharacters?:TheatreCharacter[]; preparationContinuation?:unknown; pronunciationAnswer?:unknown };
type Options = { client:OpenAI; secret:string; speed:number; signal?:AbortSignal; requestId?:string;
  caches?:PreparationCaches; sink?:(record:PreparationRecord)=>void };
const expired = () => Response.json({code:"PRONUNCIATION_EXPIRED",error:"La préparation a expiré ou le texte a changé. Recommencez explicitement la préparation."},{status:410});
export async function prepareProductionResponse(input:Input, options:Options):Promise<Response> {
  const continuation = theatreContinuation(input.preparationContinuation);
  if (input.preparationContinuation !== undefined && !continuation) return expired();
  // Private stable application identity enables the existing exact stage-cache
  // keys across fresh requests. Never emitted in diagnostic records. Session
  // preparation/request IDs remain independent random opaque IDs.
  const productionId=createHmac("sha256",options.secret).update("theatre-production-cp4\0").update(JSON.stringify([
    input.text,input.documentId??null,input.revision??null,input.theatreCharacters??[],input.performanceStyle])).digest("hex");
  if(continuation && continuation.productionId!==productionId) return expired();
  const canonical = createCanonicalPreparation(input.text,{productionId,
    documentId:input.documentId,documentRevision:input.revision,characters:input.theatreCharacters,performanceStyle:input.performanceStyle});
  if (!canonical.ok) return Response.json({code:"INVALID_INPUT"},{status:400});
  const o = {...options,requestId:isPreparationId(options.requestId)?options.requestId:undefined,caches:options.caches ?? caches};
  let result:PreparationResult;
  if (continuation) {
    const scope={preparationId:continuation.preparationId,epoch:continuation.epoch,canonical:canonical.value};
    let prior;
    try { prior=openPreparation(continuation.token,options.secret,scope); } catch { return expired(); }
    try {
      // No accepted upstream work exists after a Pass-1 failure. Explicit retry
      // may start fresh; Pass-2 holds always resume their authenticated upstream.
      if (prior.state === "PASS1_TECHNICAL_HOLD") {
        if(input.pronunciationAnswer !== undefined) return expired();
        result=await runProductionPass(canonical.value,o);
      } else result=await runPerformancePass(continuation.token,scope,{...o,answer:input.pronunciationAnswer,speed:options.speed});
    } catch {
      if(prior.state === "CLARIFICATION_REQUIRED" && input.pronunciationAnswer !== undefined)
        return Response.json({code:"INVALID_PRONUNCIATION_ANSWER",error:"Vérifiez les décisions de prononciation encore incertaines."},{status:400});
      return expired();
    }
  } else {
    if(input.pronunciationAnswer !== undefined) return expired();
    result=await runProductionPass(canonical.value,o);
  }
  const s=result.preparation;
  const headers = new Headers({"Cache-Control":"no-store"});
  if(result.receipt) {
    headers.set("X-Theatre-Request-Id",result.receipt.requestId);
    headers.set("X-Theatre-Preparation-Receipt",JSON.stringify(result.receipt));
  }
  const next = result.token && s.state !== "READY" ? {token:result.token,productionId:s.canonical.productionId,preparationId:s.preparationId,epoch:s.epoch} : undefined;
  if(s.state === "READY" && result.token) {
    const scene=openScene(result.token,options.secret);
    return Response.json(sceneManifest(scene.plan,options.speed,result.token),{headers});
  }
  if(s.state === "CLARIFICATION_REQUIRED") return Response.json({mode:"pronunciation-clarification",reason:"linguistic_ambiguity",
    performanceStyle:input.performanceStyle,pronunciationToken:result.token,preparationContinuation:next,
    entries:s.authority!.entries.filter(e=>!s.authority!.automaticIds.includes(e.id)),inventoryComplete:true},{headers});
  if(s.state === "PASS1_READY") return Response.json({mode:"theatre-preparation",preparationContinuation:next},{headers});
  return Response.json({code:"THEATRE_ANALYSIS_FAILED",reason:result.reason,retryable:result.retryable,
    ...(result.upstreamRevisionRequired?{}:{preparationContinuation:next}),
    error:"La préparation de la scène a échoué. Relancez la lecture pour réessayer l’analyse."},{status:s.state==="CANCELLED"?408:503,headers});
}
