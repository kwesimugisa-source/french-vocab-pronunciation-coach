import { useState } from "react";
import type { PronunciationClarification as Clarification } from "@/lib/reading-playback";
import type { PronunciationEntry, PronunciationClass } from "@/lib/theatre-pronunciation";

export default function PronunciationClarification({state,busy,onAccept,onCancel}:{state:Clarification;busy:boolean;onAccept:(entries:PronunciationEntry[],reviewed:boolean,excludedIds:string[])=>void;onCancel:()=>void}) {
  const [entries,setEntries]=useState(()=>structuredClone(state.entries));
  const [excluded,setExcluded]=useState<string[]>(state.excludedIds??[]);
  const [reviewed,setReviewed]=useState(false),[name,setName]=useState("");
  const change=(index:number,patch:Partial<PronunciationEntry>)=>{setReviewed(false);setEntries(entries.map((e,i)=>i===index?{...e,...patch}:e));};
  const complete=entries.filter(e=>!excluded.includes(e.id)).every(e=>e.classification!=="uncertain"&&e.language.trim()&&e.target.trim());
  return <section aria-label="Prononciation de la production" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
    <h2 className="font-semibold">Prononciation à clarifier</h2>
    <p className="my-2">Le Directeur a établi les lectures non ambiguës. Seules les décisions ci-dessous demandent une précision. Le texte de la pièce reste inchangé. Ces indications ne garantissent pas le résultat sonore du fournisseur.</p>
    {!state.inventoryComplete&&<p role="status">L’inventaire automatique est indisponible ou incomplet. Examinez le texte avant de confirmer.</p>}
    <div className="space-y-4">{entries.map((e,index)=><fieldset key={e.id} disabled={busy} className="min-w-0 rounded border p-3">
      <legend className="font-semibold">{e.name}</legend>
      {e.evidence.map((ref,i)=><p key={i} className="break-words text-sm">{ref.quote}</p>)}
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={excluded.includes(e.id)} onChange={event=>{setReviewed(false);setExcluded(event.target.checked?[...excluded,e.id]:excluded.filter(id=>id!==e.id));}}/>Exclure : ce n’est pas un nom prononcé à diriger dans cette production</label>
      {!excluded.includes(e.id)&&<div>
      <label className="block">Lecture voulue
        <select className="block min-h-11 w-full rounded border p-2" value={e.classification} onChange={event=>change(index,{classification:event.target.value as PronunciationClass})}>
          <option value="uncertain">À clarifier — ne pas deviner</option><option value="french-convention">Convention française confirmée</option>
          <option value="language-convention">Convention de la langue du dialogue</option><option value="preserved-foreign">Prononciation non française conservée</option><option value="declared">Prononciation explicitement déclarée</option>
        </select>
      </label>
      <label className="block">Langue de ce nom (fr, en, …)<input className="block min-h-11 w-full rounded border p-2" maxLength={35} value={e.language} onChange={event=>change(index,{language:event.target.value})}/></label>
      <label className="block">Indication de prononciation confirmée — non prononcée<input className="block min-h-11 w-full rounded border p-2" maxLength={120} value={e.target} onChange={event=>change(index,{target:event.target.value})}/></label>
      <label className="block">Autres formes exactes dans le texte (séparées par ;)<input className="block min-h-11 w-full rounded border p-2" value={e.aliases.join(";")} onChange={event=>change(index,{aliases:event.target.value.split(";").map(a=>a.trim()).filter(Boolean)})}/></label>
    </div>}
    </fieldset>)}</div>
    <div className="my-3 flex flex-wrap gap-2"><label className="min-w-0 flex-1">Nom manquant<input className="block min-h-11 w-full rounded border p-2" maxLength={80} value={name} disabled={busy} onChange={e=>setName(e.target.value)}/></label>
      <button className="min-h-11 rounded border bg-white p-2" disabled={busy||!name.trim()||entries.length>=64} onClick={()=>{const id=`owner-${Date.now()}-${entries.length}`;setEntries([...entries,{id,name:name.trim(),aliases:[],classification:"uncertain",language:"",target:"",evidence:[]}]);setName("");setReviewed(false);}}>Ajouter</button></div>
    <label className="my-3 flex min-h-11 items-start gap-2"><input type="checkbox" disabled={busy} checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>Je confirme ces précisions pour les noms à clarifier.</label>
    <div className="flex flex-wrap gap-2"><button className="min-h-11 rounded border bg-white p-3 disabled:opacity-50" disabled={busy||!reviewed||!complete} onClick={()=>onAccept(entries.filter(e=>!excluded.includes(e.id)),reviewed,excluded.filter(id=>state.entries.some(e=>e.id===id)))}>Confirmer et préparer la scène</button>
      <button className="min-h-11 rounded border bg-white p-3" onClick={onCancel}>Annuler</button></div>
  </section>;
}
