import { canPractise } from "@/lib/theatre-playback";
import type { TheatrePlaybackSnapshot } from "@/lib/theatre-playback";
import type { AmbienceLevel } from "@/lib/ambience-playback";
import type { AmbienceKind, AmbienceStatus } from "@/lib/theatre-ambience";
import { ambienceDescription, ambienceStatusDescription, hasLocalAmbienceProvider } from "@/lib/theatre-ambience";

type Props = {
  ambience?: { environment: AmbienceKind; level: AmbienceLevel; status?: AmbienceStatus };
  onAmbienceChange?: (level: AmbienceLevel) => void;
  playback: TheatrePlaybackSnapshot;
  recordingBusy: boolean;
  onPause: () => void;
  onResume: () => void;
  onReplay: () => void;
  onStop: () => void;
  onPractise: (id: string) => void;
  onFinishPractice: () => void;
};
const labels = {
  buffering: "Préparation du prochain passage…",
  idle: "Prêt", loading: "Préparation de la scène…", playing: "Lecture en cours",
  paused: "En pause", replaying: "Réécoute en cours", practising: "Pratique d’une réplique",
  completed: "Scène terminée", error: "Lecture interrompue",
};
const button = "min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 disabled:cursor-not-allowed disabled:opacity-50";

export default function TheatreControls({ playback, recordingBusy, onPause, onResume, onReplay,
  onStop, onPractise, onFinishPractice, ambience, onAmbienceChange }: Props) {
  const current = playback.queue[playback.currentIndex];
  const practice = playback.practiceTarget;
  return (
    <section aria-label="Lecture théâtrale" className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Lecture théâtrale</h2>
      {ambience && <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <label htmlFor="theatre-ambience">Ambiance</label>
        <select id="theatre-ambience" className="rounded-xl border border-slate-300 bg-white p-2"
          value={ambience.level} disabled={!hasLocalAmbienceProvider(ambience.environment)}
          onChange={(event) => onAmbienceChange?.(event.target.value as AmbienceLevel)}>
          <option value="off">Désactivée</option><option value="low">Faible</option><option value="medium">Modérée</option>
        </select>
        <span className="text-slate-600">{ambience.status ? ambienceStatusDescription(ambience.status, ambience.environment) : ambienceDescription(ambience.environment)}</span>
      </div>}
      <p role="status" className="mt-1 text-sm text-slate-600">
        {labels[playback.status]}{current ? ` — élément ${playback.currentIndex + 1} sur ${playback.queue.length}` : ""}
      </p>
      {!!playback.queue.length && <p className="text-xs text-slate-600">{playback.completions.length} / {playback.queue.length} éléments terminés</p>}
      {current && !practice && <p className="mt-3 max-w-[68ch] rounded-xl bg-slate-50 p-3 leading-7 whitespace-pre-wrap break-words"><strong>{current.speaker} : </strong>{current.text}</p>}
      {playback.error && <p role="alert" className="mt-3 text-sm text-red-700">
        {playback.error.message} {playback.error.itemId && `Élément ${playback.error.index + 1} (${playback.error.itemId}).`}
      </p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={button} onClick={onPause}
          disabled={!(["playing", "replaying", "buffering"].includes(playback.status) || playback.modelPlaying)}>Pause</button>
        <button type="button" className={button} onClick={onResume}
          disabled={recordingBusy || (playback.status !== "paused" && !playback.modelPaused)}>Reprendre</button>
        <button type="button" className={button} onClick={onReplay}
          disabled={recordingBusy || !current}>{playback.status === "error" ? "Réessayer cet élément" : "Réécouter depuis le début"}</button>
        <button type="button" className={button} onClick={onStop}>Arrêter la scène</button>
      </div>
      {practice && (
        <div className="mt-4 rounded-2xl bg-amber-50 p-4">
          <h3 className="font-semibold">Réplique de {practice.speaker}</h3>
          <p className="mt-2 whitespace-pre-wrap break-words">{practice.text}</p>
          <p className="mt-2 text-sm text-slate-600">
            Réécoutez le modèle, puis utilisez les commandes d’enregistrement et d’analyse ci-dessous.
            Vous pouvez recommencer autant de fois que nécessaire.
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {practice.index === playback.currentIndex && playback.completions.length < playback.queue.length
              ? "En terminant, la lecture passera à l’élément suivant."
              : "En terminant, vous retrouverez le point d’écoute conservé."}
          </p>
          <button type="button" className={`${button} mt-3`} onClick={onFinishPractice} disabled={recordingBusy}>
            Terminer la pratique et continuer
          </button>
        </div>
      )}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium">Choisir une réplique à pratiquer</summary>
        <p className="mt-2 text-xs text-slate-600">Pour une autre réplique, la lecture revient ensuite au point d’écoute conservé. Les didascalies et le chœur restent en lecture seule.</p>
        <ol className="mt-3 max-h-80 space-y-2 overflow-y-auto">
          {playback.queue.map((clip) => (
            <li key={clip.id} className="rounded-xl bg-slate-50 p-3 text-sm" aria-current={current?.id === clip.id ? "true" : undefined}>
              <div><strong>{clip.index + 1}. {clip.speaker}</strong> — {clip.text}</div>
              {canPractise(clip) && <button type="button" className={`${button} mt-2`}
                disabled={recordingBusy || !!practice} onClick={() => onPractise(clip.id)}>
                Pratiquer cette réplique
              </button>}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
