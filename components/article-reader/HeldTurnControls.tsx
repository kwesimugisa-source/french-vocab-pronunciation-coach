import { useSyncExternalStore } from "react";
import type { HeldTurnAssistance } from "@/lib/held-turn-assistance";
import type { LearnerTurn } from "@/lib/theatre-role-play";

const button = "min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-left disabled:opacity-50";
export default function HeldTurnControls({ assistance, turn }: { assistance: HeldTurnAssistance; turn: LearnerTurn }) {
  const state = useSyncExternalStore(assistance.subscribe, assistance.getSnapshot, assistance.getSnapshot);
  if (state.turn !== turn) return null;
  const r = state.recording;
  const busy = ["requesting-microphone", "recording", "stopping", "analyzing"].includes(r.status);
  const listening = state.media !== "idle";
  const labels = { idle: "", "requesting-microphone": "Autorisation du microphone…", recording: "Enregistrement en cours", stopping: "Fin de l’enregistrement…", recorded: "Enregistrement prêt", analyzing: "Comparaison en cours…", analyzed: "Comparaison prête", error: "" };
  return <details className="mt-4 rounded-lg border border-amber-200 p-3">
    <summary className="min-h-11 cursor-pointer font-medium">Aide à la répétition (facultative)
      <span className="block text-sm font-normal" role="status">{labels[r.status]}{listening ? (state.media === "loading-model" ? " Préparation du modèle…" : " Écoute en cours") : ""}</span>
    </summary>
    <p className="my-2 text-sm">Vous pouvez continuer la scène à tout moment. L’enregistrement reste temporaire ; seul « Comparer » l’envoie au service de transcription.</p>
    <div className="flex flex-wrap gap-2">
      <button className={button} disabled={busy} onClick={() => void assistance.record(turn)}>{r.recording ? "Enregistrer un autre essai" : "Enregistrer"}</button>
      <button className={button} disabled={r.status !== "recording"} onClick={() => assistance.stopRecording(turn)}>Arrêter l’enregistrement</button>
      <button className={button} disabled={busy || listening || !r.recording} onClick={() => void assistance.listen(turn, "self")}>Écouter mon enregistrement</button>
      <button className={button} disabled={busy || listening} onClick={() => void assistance.listen(turn, "model")}>Écouter le modèle</button>
      {listening && <button className={button} onClick={() => assistance.stopListening(turn)}>Arrêter l’écoute</button>}
      <button className={button} disabled={busy || !r.recording} onClick={() => void assistance.analyze(turn)}>Comparer mon enregistrement au texte</button>
    </div>
    {(state.error || r.error) && <p role="alert" className="mt-3 text-red-700">{state.error || r.error}</p>}
    {r.feedback && <div className="mt-3 break-words" aria-label="Comparaison transcription et texte">
      <h4 className="font-semibold">Transcription reconnue</h4>
      <p className="whitespace-pre-wrap">{r.feedback.transcript || "Aucune transcription exploitable."}</p>
      {!!r.feedback.weakPoints.length && <p className="mt-2">Mots à comparer dans la transcription : {r.feedback.weakPoints.map(point => point.word).join(", ")}.</p>}
      <p className="mt-2 text-sm">Comparez cette transcription à votre réplique ci-dessus. La reconnaissance peut se tromper : ceci ne mesure ni les phonèmes, ni l’intonation, ni la fluidité, ni le jeu théâtral.</p>
    </div>}
  </details>;
}
