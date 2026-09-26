import OpenAI from "openai";
import { protectedRoute, RequestGate, providerCall } from "../../../lib/beta-server";
import { openScene } from "../../../lib/theatre-scene-ticket";
import { theatreRole } from "../../../lib/theatre-casting";
import { dramaticInstructions } from "../../../lib/theatre-direction";
import { pronunciationInstructions } from "../../../lib/document-language";
import { TTS_INPUT_LIMIT } from "../../../lib/content-document";
import { semanticPause } from "../../../lib/theatre";
import { directorDelivery } from "../../../lib/theatre-director";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Two bounded requests per client. Separate allowance from whole-read
// actions: a long scene is not 50 learner duplicate clicks.
const clipGate = new RequestGate(Date.now, 240, 4, 120, 2);
async function handlePost(req: Request) {
  const secret=process.env.OPENAI_API_KEY;
  if(!secret) return Response.json({code:"PROVIDER_FAILED"},{status:503});
  const body=await req.json();
  let ticket;
  try { ticket=openScene(body?.sceneToken,secret); }
  catch { return Response.json({code:"SCENE_EXPIRED"},{status:410}); }
  const {plan,speed,language}=ticket;
  const item=plan.items.find(i=>i.id===body.itemId);
  // Also reject semantic silence in a still-valid token issued before this repair.
  if(!item || item.pauseMs || (item.type==="stage" && semanticPause(item.text)) || !Number.isInteger(body.componentIndex)) return Response.json({code:"INVALID_ITEM"},{status:400});
  const voices=theatreRole(item)==="chorus"?plan.casting.chorus.voices:[plan.casting.members.find(m=>m.speaker===item.speaker && m.role===theatreRole(item))!.voice];
  const voice=voices[body.componentIndex];
  if(!voice || item.text.length>TTS_INPUT_LIMIT) return Response.json({code:"INVALID_ITEM"},{status:400});
  const itemSpeed=item.type==="stage"?Math.max(.65,speed-.15):speed;
  const speech = {model:"gpt-4o-mini-tts",voice,input:item.text,speed:itemSpeed,
    instructions:pronunciationInstructions(language,dramaticInstructions(item,plan.analysis,plan.performanceStyle,{voice,items:plan.items}))};
  const debug = body.debug === true ? {kind:"speech",item:{id:item.id,index:item.index,speaker:item.speaker,type:item.type},
    componentIndex:body.componentIndex,performanceStyle:plan.performanceStyle,language,
    direction:plan.direction,tts:speech,
    director:plan.performanceStyle==="naturel" && plan.analysis?.director ? directorDelivery(item,plan.analysis.director,plan.items) : null,
    requestOutcome:{sdkInvoked:false,audioReceived:false,providerStatus:null as number|null},
    provenance:"exact constructed request; see requestOutcome for invocation/result; not proof of audible words"} : undefined;
  try {
    req.signal.throwIfAborted();
    const client=new OpenAI({apiKey:secret});
    const audio=await providerCall("tts",()=>{if(debug) debug.requestOutcome.sdkInvoked=true;return client.audio.speech.create(speech,
      {signal:req.signal,timeout:55_000,maxRetries:0});},item.text.length);
    const buffer=Buffer.from(await audio.arrayBuffer());
    if(debug) debug.requestOutcome.audioReceived=true;
    req.signal.throwIfAborted();
    // Stay below the host response-body ceiling even for a very long utterance.
    if(!buffer.length || buffer.length>2_500_000) return Response.json({code:"AUDIO_SIZE_LIMIT",...(debug?{debug}:{})},{status:413,headers:{"Cache-Control":"no-store"}});
    return Response.json({mode:"theatre-component",itemId:item.id,componentIndex:body.componentIndex,voice,speed:itemSpeed,audioBase64:buffer.toString("base64"),...(debug?{debug}:{})},{headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    const status=(error as {status?:unknown})?.status;
    if(debug) debug.requestOutcome.providerStatus=typeof status==="number" && Number.isInteger(status) && status>=100 && status<=599 ? status : null;
    return Response.json({code:req.signal.aborted?"PREPARATION_ABORTED":status===429?"PROVIDER_RATE_LIMITED":"CLIP_FAILED",...(debug?{debug}:{})},
      {status:req.signal.aborted?408:status===429?429:502,headers:{"Cache-Control":"no-store",...(status===429?{"Retry-After":"60"}:{})}});
  }
}
export const POST=protectedRoute("reading",handlePost,{gate:clipGate,deadlineMs:65_000});
