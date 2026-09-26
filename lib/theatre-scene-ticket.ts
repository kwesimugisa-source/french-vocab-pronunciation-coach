// Server-only, authenticated encrypted transport of an already validated plan.
// No public storage, new credentials, content diagnostics or worker affinity.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import type { TheatrePlan } from "./theatre-generation";
import type { TheatreManifest } from "./theatre-incremental";
import { theatreRole } from "./theatre-casting";

export type SceneTicket = { version: 1; expires: number; plan: TheatrePlan; speed: number; language: "fr" };
const key = (secret: string) => createHash("sha256").update("theatre-scene-v1\0"+secret).digest();
export function sealScene(plan: TheatrePlan, speed: number, secret: string, now=Date.now()): string {
  const ticket: SceneTicket={version:1,expires:now+2*60*60_000,plan,speed,language:"fr"};
  const encoded=Buffer.from(JSON.stringify(ticket));
  if(encoded.length>1_000_000) throw new Error("Plan trop volumineux.");
  const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key(secret),iv);
  cipher.setAAD(Buffer.from("theatre-scene-v1"));
  const encrypted=Buffer.concat([cipher.update(deflateRawSync(encoded)),cipher.final()]);
  const token=Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString("base64url");
  if(token.length>450_000) throw new Error("Plan trop volumineux.");
  return token;
}
export function openScene(token: unknown, secret: string, now=Date.now()): SceneTicket {
  if(typeof token!=="string" || token.length<40 || token.length>450_000 || !/^[A-Za-z0-9_-]+$/.test(token)) throw new Error("INVALID_SCENE");
  const data=Buffer.from(token,"base64url"), decipher=createDecipheriv("aes-256-gcm",key(secret),data.subarray(0,12));
  decipher.setAAD(Buffer.from("theatre-scene-v1"));decipher.setAuthTag(data.subarray(12,28));
  const decoded=inflateRawSync(Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]),{maxOutputLength:1_000_000});
  const ticket=JSON.parse(decoded.toString()) as SceneTicket;
  if(ticket.version!==1 || ticket.expires<=now || ticket.language!=="fr") throw new Error("EXPIRED_SCENE");
  return ticket;
}
export function sceneManifest(plan: TheatrePlan, speed: number, sceneToken: string): TheatreManifest {
  const clips=plan.items.map(item=>{
    const voices=theatreRole(item)==="chorus"?plan.casting.chorus.voices:[plan.casting.members.find(m=>m.speaker===item.speaker && m.role===theatreRole(item))!.voice];
    return {...item,voice:voices[0],speed:item.type==="stage"?Math.max(.65,speed-.15):speed,audioBase64:"",
      ...(voices.length===3?{chorus:{components:voices.map(voice=>({voice,audioBase64:""}))}}:{})};
  });
  return {mode:"theatre",protocol:"incremental-v1",sceneToken,performanceStyle:plan.performanceStyle,direction:plan.direction,
    analysisCacheKey:plan.analysisCacheKey,ambience:plan.ambience,casting:plan.casting,
    integrity:{version:1,parsedItemCount:clips.length,expectedItemIds:clips.map(i=>i.id),generatedClipCount:0},clips};
}
