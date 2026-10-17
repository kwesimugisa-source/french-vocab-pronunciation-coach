// Local browser acceptance only. Served by scripts/held-turn-browser-fixture.cjs;
// never imported by the application. All recording/provider responses are fixtures.
import React, { useState, useSyncExternalStore } from "react";
import RolePlayControls from "../components/article-reader/RolePlayControls";
import { HeldTurnAssistance } from "../lib/held-turn-assistance";
import { TheatrePlaybackController, browserPlaybackEnvironment } from "../lib/theatre-playback";
import { parseTheatreItems } from "../lib/theatre";

function tone() {
  const rate=8000, count=4000, bytes=new ArrayBuffer(44+count*2), view=new DataView(bytes);
  const text=(offset:number,value:string)=>[...value].forEach((c,i)=>view.setUint8(offset+i,c.charCodeAt(0)));
  text(0,"RIFF");view.setUint32(4,36+count*2,true);text(8,"WAVEfmt ");view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,"data");view.setUint32(40,count*2,true);
  for(let i=0;i<count;i++)view.setInt16(44+i*2,Math.sin(i*2*Math.PI*440/rate)*1000,true);
  return new Blob([bytes],{type:"audio/wav"});
}
const fixtureTone=tone();
let deny=false, block=false;
const env={...browserPlaybackEnvironment,createAudio:(url:string)=>{const audio=browserPlaybackEnvironment.createAudio(url);if(block)audio.play=()=>Promise.reject(Error("fixture autoplay rejection"));return audio;}};
const theatre=new TheatrePlaybackController(env);
const assistance=new HeldTurnAssistance(theatre,env,()=>{theatre.setCaptureBlocked(true);return()=>theatre.setCaptureBlocked(false);},async turn=>{
  const bytes=new Uint8Array(await fixtureTone.arrayBuffer());
  return {...theatre.getSnapshot().queue[turn.index],audioBase64:btoa(String.fromCharCode(...bytes))};
},{getUserMedia:async()=>{if(deny)throw Error("fixture denied");return {getTracks:()=>[{stop(){}}]} as unknown as MediaStream;},
 createRecorder:()=>{const recorder={mimeType:"audio/wav",state:"inactive",ondataavailable:null as null | ((event:{data:Blob})=>void),onstop:null as null | (()=>void),start(){recorder.state="recording";},stop(){recorder.state="inactive";recorder.ondataavailable?.({data:fixtureTone});recorder.onstop?.();}};return recorder as unknown as MediaRecorder;},
 fetch:async()=>Response.json({transcript:"Ah… Oui ?!",weakPoints:[{word:"Oui",note:"Différence possible dans la transcription.",severity:"low"}]})});
function start(){theatre.stop();const text="CLARA: Ah… Oui ?!\nCLARA: Je voudrais reprendre cette longue réplique avec beaucoup de soin, sans perdre le fil de notre scène.\nCLARA: Fin.",items=parseTheatreItems(text),sid=theatre.beginLoading();theatre.acceptScene(sid,{mode:"theatre",clips:items.map(i=>({...i,voice:"ash",speed:1,audioBase64:"Zml4dHVyZQ=="})),integrity:{version:1,parsedItemCount:items.length,generatedClipCount:items.length,expectedItemIds:items.map(i=>i.id)}},text,{epoch:sid,sessionId:sid,documentId:"fixture",revision:1,speaker:"CLARA",style:"clarte",speed:"normal"});}
function Fixture(){const state=useSyncExternalStore(theatre.subscribe,theatre.getSnapshot,theatre.getSnapshot);const [denied,setDenied]=useState(false),[blocked,setBlocked]=useState(false);return <main className="mx-auto max-w-4xl p-4">
 <h1 className="mb-4 text-xl font-bold">CP2 — test local sans fournisseur</h1>
 <p>Microphone simulé ; son de test synthétique, aucune voix enregistrée ni requête réseau.</p>
 <label className="block min-h-11"><input type="checkbox" checked={denied} onChange={e=>{deny=e.target.checked;setDenied(deny);}}/> Simuler refus du microphone</label>
 <label className="block min-h-11"><input type="checkbox" checked={blocked} onChange={e=>{block=e.target.checked;setBlocked(block);}}/> Simuler blocage de lecture</label>
 <p role="status">État : {state.status} — index : {state.currentIndex} — terminés : {state.completions.length}</p>
 <RolePlayControls enabled roles={["CLARA"]} speaker="CLARA" disabled={false} busy={state.status==="learner_turn"} playback={state} assistance={assistance} onEnable={()=>{}} onSpeaker={()=>{}} onStart={start} onStop={()=>theatre.stop()} onContinue={turn=>assistance.continue(turn)}/>
 </main>;}
start();
export default Fixture;
