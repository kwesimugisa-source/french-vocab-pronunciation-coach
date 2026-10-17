import type { TheatrePlaybackSnapshot } from "@/lib/theatre-playback";
import type { LearnerTurn } from "@/lib/theatre-role-play";
import type { HeldTurnAssistance } from "@/lib/held-turn-assistance";
import HeldTurnControls from "./HeldTurnControls";

type Props = {
  enabled: boolean; roles: string[]; speaker: string; disabled: boolean; busy: boolean;
  playback: TheatrePlaybackSnapshot;
  assistance?: HeldTurnAssistance;
  onEnable: (enabled: boolean) => void; onSpeaker: (speaker: string) => void;
  onStart: () => void; onStop: () => void; onContinue: (turn: LearnerTurn) => void;
};
const button = "min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 disabled:opacity-50";
export default function RolePlayControls(p: Props) {
  const turn = p.playback.learnerTurn;
  return <section aria-label="Jouer un rôle" className="mb-4 rounded-xl border bg-white p-4">
    <label className="flex min-h-11 items-center gap-2 font-semibold">
      <input type="checkbox" checked={p.enabled} disabled={p.disabled || !p.roles.length}
        onChange={e => p.onEnable(e.target.checked)} /> Jouer un rôle
    </label>
    {!p.roles.length && <p>Aucun personnage individuel disponible dans ce texte.</p>}
    {p.enabled && <>
      <label className="block">Votre personnage
        <select className="m-2 min-h-11 max-w-full rounded border p-2" value={p.speaker} disabled={p.disabled}
          onChange={e => p.onSpeaker(e.target.value)}>
          {p.roles.map(role => <option key={role} value={role}>{role}</option>)}
        </select>
      </label>
      <p className="mb-3 text-sm">Jouez vos répliques à voix haute, puis continuez. Une aide facultative est disponible à votre tour. Changer de personnage, de style ou de vitesse arrête la scène.</p>
      <button className={button} disabled={p.disabled || (!p.busy && !p.speaker)} onClick={p.busy ? p.onStop : p.onStart}>
        {p.busy ? "Arrêter la scène" : "Commencer la scène"}
      </button>
      {turn && <div className="mt-4 rounded-xl bg-amber-50 p-4">
        <h3 className="font-semibold">Votre tour — {turn.speaker}</h3>
        <p className="my-3 whitespace-pre-wrap break-words leading-7" aria-live="polite" aria-atomic="true">{turn.text}</p>
        <button className={button} disabled={p.disabled} onClick={event => { if (event.detail <= 1) p.onContinue(turn); }}>Continuer la scène</button>
        {p.assistance && <HeldTurnControls key={`${turn.run.epoch}:${turn.index}`} assistance={p.assistance} turn={turn} />}
      </div>}
    </>}
  </section>;
}
