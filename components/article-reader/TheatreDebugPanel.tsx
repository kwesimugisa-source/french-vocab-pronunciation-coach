"use client";
import { useEffect, useState } from "react";
import type { ReadingPlaybackSession } from "@/lib/reading-playback";

/** Explicit local debug mode; no uploads, persistence or automatic clipboard use. */
export default function TheatreDebugPanel({playback,sessionId}:{playback:ReadingPlaybackSession;sessionId:number}) {
  const [enabled,setEnabled]=useState(false),[output,setOutput]=useState(""),[notice,setNotice]=useState("");
  const [index,setIndex]=useState(0),[component,setComponent]=useState(0);
  useEffect(()=>{setEnabled(new URLSearchParams(window.location.search).get("theatreDebug")==="1");},[]);
  useEffect(()=>{setOutput("");setNotice("");setIndex(0);setComponent(0);},[sessionId]);
  if(!enabled) return null;
  const clips=playback.theatre.getSnapshot().queue;
  const show=(value: unknown)=>{setOutput(JSON.stringify(value,null,2));setNotice("");};
  const button="min-h-11 rounded-xl border bg-white px-3 py-2 text-sm";
  return <details className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4" aria-label="Diagnostic théâtre">
    <summary className="cursor-pointer font-semibold">Diagnostic théâtre — mode debug local</summary>
    <p className="my-2 text-sm">Aucun envoi automatique. La trace exclut le dialogue et les noms des personnages. Les détails de direction contiennent du texte de la scène : vérifiez-les avant de les partager. Exportez avant d’arrêter, de recharger ou de remplacer la scène.</p>
    <button type="button" className={button} onClick={()=>show(playback.exportTheatreDiagnostics())}>Afficher la trace</button>
    <div className="my-3 flex flex-wrap items-center gap-2">
      <label>Élément <select className="min-h-11 max-w-full rounded border p-2" value={index} onChange={e=>{setIndex(Number(e.target.value));setComponent(0);}}>
        {clips.map(c=><option key={c.id} value={c.index}>{c.index+1} — {c.type}</option>)}
      </select></label>
      <label>Composante <select className="min-h-11 rounded border p-2" value={component} onChange={e=>setComponent(Number(e.target.value))}>
        {(clips[index]?.chorus?[0,1,2]:[0]).map(c=><option key={c} value={c}>{c+1}</option>)}
      </select></label>
      <button type="button" className={button} disabled={!clips.length} onClick={()=>show(playback.getTheatreDelivery(index,component) ?? {unavailable:"Pas de requête capturée : élément non préparé, pause silencieuse, capture non activée au départ ou limite de mémoire atteinte."})}>Afficher la direction et la requête TTS (contient du texte)</button>
    </div>
    {output && <>
      <textarea aria-label="Export diagnostic" className="h-64 w-full rounded border bg-white p-2 font-mono text-xs" readOnly value={output}/>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className={button} onClick={async()=>{try{await navigator.clipboard.writeText(output);setNotice("Copié.");}catch{setNotice("Copie indisponible : sélectionnez le texte ou téléchargez le JSON.");}}}>Copier le JSON affiché</button>
        <button type="button" className={button} onClick={()=>{const url=URL.createObjectURL(new Blob([output],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="theatre-diagnostic.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>Télécharger le JSON affiché</button>
      </div>
    </>}
    <p role="status" className="mt-2 text-sm">{notice}</p>
  </details>;
}
