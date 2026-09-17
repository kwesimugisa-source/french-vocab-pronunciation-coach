import type { ContentDocument } from "@/lib/content-document";
import type { PronunciationSnapshot } from "@/lib/pronunciation-session";
import { READING_SPEEDS } from "@/lib/tongue-twisters";
import PronunciationSummary from "@/components/pronunciation/PronunciationSummary";
import WeakPointsPanel from "@/components/pronunciation/WeakPointsPanel";
import PreparationNotice from "./PreparationNotice";

type Props = {
  document: ContentDocument; selectedId?: string; speed: string; busy: boolean; audioBusy: boolean;
  audioPreparing?: boolean;
  pronunciation: PronunciationSnapshot;
  onSpeedChange: (speed: string) => void; onListen: (id: string) => void; onSelect: (id: string) => void;
  onStopAudio: () => void; onRecord: () => void; onStopRecording: () => void; onAnalyze: () => void;
};
const button = "rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50";
export default function TongueTwisterPractice(p: Props) {
  const practice = p.document.tongueTwisters;
  const active = practice?.exercises.find(e => e.id === p.selectedId);
  const recorded = p.pronunciation.recording?.target;
  const currentRecording = !!active && recorded?.itemId === active.id && recorded.documentId === p.document.documentId && recorded.revision === p.document.revision;
  const feedback = currentRecording ? p.pronunciation.feedback : null;
  return <section aria-label="Pratique des virelangues" className="mb-6 space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="text-xl font-semibold">Virelangues — son à pratiquer : {practice?.target.label ?? "Mixte"}</h2>
    <p className="text-sm text-slate-600">Choisissez une phrase. « Répéter » prépare votre exercice ; le microphone démarre seulement avec « Enregistrer ».</p>
    {practice?.warnings.map((warning, i) => <p key={i} className="text-sm text-amber-800">{warning}</p>)}
    {!practice?.exercises.length && <p>Aucune limite d’exercice certaine. Le texte original est conservé ci-dessous ; importez une phrase ou une liste avec une phrase complète par ligne pour la pratiquer.</p>}
    <ol className="space-y-3">{practice?.exercises.map(e => <li key={e.id} className={`rounded-2xl border p-4 ${e.id === active?.id ? "border-amber-400 bg-amber-50" : "border-slate-200"}`}>
      <h3 className="font-semibold">Exercice {e.index + 1} · {e.target.label}</h3>
      <p className="my-3 whitespace-pre-wrap">{e.text}</p>
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={p.busy || p.audioPreparing} onClick={() => p.onListen(e.id)}>{e.id === active?.id ? "Réécouter" : "Écouter"}</button>
        <button className={button} disabled={p.busy} onClick={() => p.onSelect(e.id)}>Répéter</button>
      </div>
      {e.id === active?.id && <div className="mt-4 space-y-3">
        <PreparationNotice label={p.audioPreparing ? "Préparation de l’audio de cette phrase…" : p.pronunciation.status==="analyzing" ? "Analyse de la prononciation…" : null} />
        <label className="block text-sm">Vitesse <select aria-label="Vitesse de cet exercice" className="ml-2 rounded-xl border p-2" value={p.speed} onChange={event => p.onSpeedChange(event.target.value)}>
          {READING_SPEEDS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select></label>
        <p className="text-xs text-slate-600">La vitesse choisie s’applique à la prochaine écoute.</p>
        <div className="flex flex-wrap gap-2">
          <button className={button} disabled={!p.audioBusy} onClick={p.onStopAudio}>Arrêter l’écoute</button>
          <button className={button} disabled={p.busy} onClick={p.onRecord}>{currentRecording ? "Réessayer" : "Enregistrer"}</button>
          <button className={button} disabled={p.pronunciation.status !== "recording"} onClick={p.onStopRecording}>Terminer l’enregistrement</button>
          <button className={button} disabled={!currentRecording || p.busy} onClick={p.onAnalyze}>Analyser ma lecture</button>
        </div>
        <p role="status" className="text-sm">{p.pronunciation.status === "recording" ? "Le microphone enregistre cette phrase." : p.pronunciation.status === "requesting-microphone" ? "Autorisation du microphone…" : p.pronunciation.status === "analyzing" ? "Comparaison de la transcription…" : currentRecording ? "Enregistrement de cette phrase disponible." : "Prêt à enregistrer cette phrase."}</p>
        {p.pronunciation.error && <p role="alert">{p.pronunciation.error}</p>}
        <p className="text-sm text-slate-600">Le son indique l’objectif de pratique. L’analyse compare les mots transcrits au texte ; elle ne mesure pas les sons, la fluidité ou l’intonation.</p>
        {feedback && <>
          {feedback.score && <p>Correspondance estimée : {feedback.score.overall}/100</p>}
          <PronunciationSummary summary={feedback.summary} /><WeakPointsPanel weakPoints={feedback.weakPoints} />
        </>}
      </div>}
    </li>)}</ol>
  </section>;
}
