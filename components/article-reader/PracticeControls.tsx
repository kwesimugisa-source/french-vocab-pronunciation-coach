import type { PracticeUnit } from "@/lib/practice-units";

type Props = {
  active: boolean; units: PracticeUnit[]; selected: PracticeUnit | null;
  disabled?: boolean; audioBusy: boolean; recordingBusy: boolean;
  onMode: (practice: boolean) => void; onSelect: (id: string) => void;
  onListen: () => void; onStop: () => void;
};
const button = "min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-50";
export default function PracticeControls({ active, units, selected, disabled, audioBusy, recordingBusy, onMode, onSelect, onListen, onStop }: Props) {
  return <section aria-label="Mode de lecture" className="mb-4 min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={disabled} aria-pressed={!active} className={button + (!active ? " bg-slate-900 text-white" : "")} onClick={() => onMode(false)}>Lecture complète</button>
      <button type="button" disabled={disabled} aria-pressed={active} className={button + (active ? " bg-slate-900 text-white" : "")} onClick={() => onMode(true)}>Pratique</button>
    </div>
    {active && <div className="mt-3 space-y-3">
      <p className="text-sm text-slate-600">Choisissez une unité dans le texte, écoutez-la, puis enregistrez votre essai. La vitesse choisie s’applique à chaque écoute.</p>
      <p aria-live="polite" className="break-words text-sm font-medium">{selected ? `Unité ${selected.index + 1} sur ${units.length}${selected.speaker ? " · " + selected.speaker : ""}` : "Aucune unité disponible."}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={disabled || !selected || selected.index === 0} onClick={() => selected && onSelect(units[selected.index - 1].id)}>Précédente</button>
        <button type="button" className={button} disabled={disabled || !selected || selected.index === units.length - 1} onClick={() => selected && onSelect(units[selected.index + 1].id)}>Suivante</button>
        <button type="button" className={button} disabled={disabled || !selected || recordingBusy || audioBusy} onClick={onListen}>Écouter / Réécouter</button>
        <button type="button" className={button} disabled={!audioBusy} onClick={onStop}>Arrêter l’écoute</button>
      </div>
    </div>}
  </section>;
}
