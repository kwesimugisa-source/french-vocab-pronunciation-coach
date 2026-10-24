/** Content-free projections only. Never pass SDK/source objects to the recorder. */
import { observePreparation } from "./beta-events";
import type { PreparationBoundary, PreparationObserver } from "./beta-events";
import type { TheatreItem } from "./theatre";
import { theatreRole } from "./theatre-casting";

type FieldState = "missing" | "invalid" | "valid";
const object = (v:unknown):v is Record<string,unknown> => !!v && typeof v==="object" && !Array.isArray(v);
function field(v:unknown,key:string):unknown {
  if(!object(v)) return undefined;
  const d=Object.getOwnPropertyDescriptor(v,key);
  return d && Object.hasOwn(d,"value") ? d.value : undefined;
}
function number(v:unknown,max=1_000_000):number|undefined {
  return typeof v==="number" && Number.isSafeInteger(v) && v>=0 && v<=max ? v : undefined;
}
const state=(v:unknown,valid:boolean):FieldState => v===undefined ? "missing" : valid ? "valid" : "invalid";

export function recordSceneEvidence(items:readonly TheatreItem[],inputBytes:number,observer?:PreparationObserver) {
  try {
    const boundary:PreparationBoundary={kind:"scene",items:items.length,
      dialogue:items.filter(i=>i.type==="dialogue").length,
      stage:items.filter(i=>i.type==="stage").length,
      chorus:items.filter(i=>theatreRole(i)==="chorus").length,
      silence:items.filter(i=>!!i.pauseMs).length,
      characters:new Set(items.filter(i=>theatreRole(i)==="character").map(i=>i.speaker)).size,
      speakers:new Set(items.map(i=>i.speaker)).size, inputBytes};
    observePreparation(observer,"provider_evidence","present","none",{boundary});
  } catch { /* Diagnostics cannot change preparation. */ }
}

export function providerBoundaryEvidence(response:unknown,requested:number):PreparationBoundary[] {
  const usage=field(response,"usage");
  const input=field(usage,"input_tokens"), output=field(usage,"output_tokens");
  const reasoning=field(field(usage,"output_tokens_details"),"reasoning_tokens"),total=field(usage,"total_tokens");
  const usageEvidence:PreparationBoundary={kind:"usage",usage:state(usage,object(usage)),
    inputState:state(input,number(input)!==undefined),outputState:state(output,number(output)!==undefined),
    reasoningState:state(reasoning,number(reasoning)!==undefined),totalState:state(total,number(total)!==undefined),
    ...(number(input)!==undefined?{inputTokens:number(input)}:{}),
    ...(number(output)!==undefined?{outputTokens:number(output)}:{}),
    ...(number(reasoning)!==undefined?{reasoningTokens:number(reasoning)}:{}),
    ...(number(total)!==undefined?{totalTokens:number(total)}:{})};
  const text=field(response,"output_text"),items=field(response,"output");
  const outputEvidence:Extract<PreparationBoundary,{kind:"output"}>={kind:"output",
    textState:state(text,typeof text==="string" && text.length<=10_000_000),
    itemsState:state(items,Array.isArray(items) && items.length<=10_000),contentState:"missing",
    ...(typeof text==="string" && text.length<=10_000_000?{chars:text.length}:{})};
  if(Array.isArray(items) && items.length<=10_000) {
    Object.assign(outputEvidence,{items:items.length,messages:0,reasoning:0,functions:0,otherItems:0});
    let textParts=0,refusals=0,otherParts=0,parts=0,valid=true,seen=false;
    for(const item of items) {
      switch(field(item,"type")) {
        case "message": {
          outputEvidence.messages!++;
          seen=true;
          const content=field(item,"content");
          if(!Array.isArray(content) || parts+content.length>10_000) {valid=false;break;}
          parts+=content.length;
          for(const part of content) {
            switch(field(part,"type")) {
              case "output_text":textParts++;break;
              case "refusal":refusals++;break;
              default:otherParts++;
            }
          }
          break;
        }
        case "reasoning":outputEvidence.reasoning!++;break;
        case "function_call":outputEvidence.functions!++;break;
        default:outputEvidence.otherItems!++;
      }
    }
    outputEvidence.contentState=!seen?"missing":valid?"valid":"invalid";
    if(seen && valid) Object.assign(outputEvidence,{textParts,refusals,otherParts});
  }
  const echoed=field(response,"max_output_tokens"),max=number(echoed);
  const config:PreparationBoundary={kind:"config",maxState:state(echoed,max!==undefined),
    maxMatch:max===undefined || number(requested)===undefined?"unavailable":max===requested?"same":"different",
    ...(max!==undefined?{echoedMax:max}:{})};
  return [usageEvidence,outputEvidence,config];
}
export function recordProviderEvidence(response:unknown,requested:number,observer?:PreparationObserver) {
  try {
    for(const boundary of providerBoundaryEvidence(response,requested))
      observePreparation(observer,"provider_evidence","present","none",{boundary});
  } catch { /* No payload/error logging and no effect on generation. */ }
}
