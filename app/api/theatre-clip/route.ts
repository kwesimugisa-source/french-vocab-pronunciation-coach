import OpenAI from "openai";
import { protectedRoute, RequestGate, providerCall } from "../../../lib/beta-server";
import { openScene } from "../../../lib/theatre-scene-ticket";
import { theatreRole } from "../../../lib/theatre-casting";
import { dramaticInstructions } from "../../../lib/theatre-direction";
import { pronunciationInstructions } from "../../../lib/document-language";
import { TTS_INPUT_LIMIT } from "../../../lib/content-document";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One serialized request per client. Separate bounded allowance from whole-read
// actions: a long scene is not 50 learner duplicate clicks.
const clipGate = new RequestGate(Date.now, 240, 4, 120);
async function handlePost(req: Request) {
  const secret=process.env.OPENAI_API_KEY;
  if(!secret) return Response.json({code:"PROVIDER_FAILED"},{status:503});
  const body=await req.json();
  let ticket;
  try { ticket=openScene(body?.sceneToken,secret); }
  catch { return Response.json({code:"SCENE_EXPIRED"},{status:410}); }
  const {plan,speed,language}=ticket;
  const item=plan.items.find(i=>i.id===body.itemId);
  if(!item || !Number.isInteger(body.componentIndex)) return Response.json({code:"INVALID_ITEM"},{status:400});
  const voices=theatreRole(item)==="chorus"?plan.casting.chorus.voices:[plan.casting.members.find(m=>m.speaker===item.speaker && m.role===theatreRole(item))!.voice];
  const voice=voices[body.componentIndex];
  if(!voice || item.text.length>TTS_INPUT_LIMIT) return Response.json({code:"INVALID_ITEM"},{status:400});
  const itemSpeed=item.type==="stage"?Math.max(.65,speed-.15):speed;
  try {
    req.signal.throwIfAborted();
    const client=new OpenAI({apiKey:secret});
    const audio=await providerCall("tts",()=>client.audio.speech.create({model:"gpt-4o-mini-tts",voice,input:item.text,speed:itemSpeed,
      instructions:pronunciationInstructions(language,dramaticInstructions(item,plan.analysis,plan.performanceStyle,{voice,items:plan.items}))},
      {signal:req.signal,timeout:55_000,maxRetries:0}),item.text.length);
    const buffer=Buffer.from(await audio.arrayBuffer());
    req.signal.throwIfAborted();
    // Stay below the host response-body ceiling even for a very long utterance.
    if(!buffer.length || buffer.length>2_500_000) return Response.json({code:"AUDIO_SIZE_LIMIT"},{status:413});
    return Response.json({mode:"theatre-component",itemId:item.id,componentIndex:body.componentIndex,voice,speed:itemSpeed,audioBase64:buffer.toString("base64")},{headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    const status=(error as {status?:unknown})?.status;
    return Response.json({code:req.signal.aborted?"PREPARATION_ABORTED":status===429?"PROVIDER_RATE_LIMITED":"CLIP_FAILED"},
      {status:req.signal.aborted?408:status===429?429:502,...(status===429?{headers:{"Retry-After":"60"}}:{})});
  }
}
export const POST=protectedRoute("reading",handlePost,{gate:clipGate,deadlineMs:65_000});
