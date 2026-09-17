"use client";
import { useState } from "react";
import { betaJournal, resetBetaDiagnostics } from "@/lib/beta-events";
/** Local development inspection only. No production page, collector or admin secret. */
export default function BetaDiagnostics() {
  const [summary,setSummary]=useState<ReturnType<typeof betaJournal.aggregate> | null>(null);
  if(process.env.NODE_ENV!=="development") return null;
  return <details className="my-4 rounded-xl border p-4 text-sm">
    <summary>Diagnostics locaux — développement</summary>
    <p>Ce navigateur uniquement, en mémoire pendant 30 minutes au maximum. Aucun tableau de bord de classe ni stockage durable. Aucun texte, mot, transcription ou audio n’est collecté ici.</p>
    <button className="mr-4 underline" onClick={()=>setSummary(betaJournal.aggregate())}>Actualiser les agrégats</button>
    <button className="underline" onClick={()=>{resetBetaDiagnostics();setSummary(null);}}>Effacer les diagnostics</button>
    {summary && <pre className="overflow-auto text-xs">{JSON.stringify(summary,null,2)}</pre>}
  </details>;
}
