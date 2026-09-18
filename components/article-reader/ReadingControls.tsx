import PreparationNotice from "./PreparationNotice";
type Props = {
  isRecording: boolean;
  hasRecording: boolean;
  isBusy?: boolean;
  isAnalyzing?: boolean;
  targetLabel?: string;
  statusMessage?: string;
  error?: string | null;
  onStartReading: () => void;
  onStopReading: () => void;
  onAnalyzePronunciation: () => void;
};

export default function ReadingControls({
  isRecording,
  hasRecording,
  isBusy = false,
  isAnalyzing = false,
  targetLabel,
  statusMessage,
  error,
  onStartReading,
  onStopReading,
  onAnalyzePronunciation,
}: Props) {
  return (
    <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold">À vous de parler</h2>
      <p className="mb-4 mt-1 text-sm text-slate-600">Enregistrez votre lecture, arrêtez le microphone, puis analysez la transcription.</p>
      <PreparationNotice label={isAnalyzing ? "Analyse de la prononciation…" : null} />
      {targetLabel && <p className="mb-3 text-sm font-medium">{targetLabel}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onStartReading}
          disabled={isRecording || isBusy}
          className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRecording ? "Enregistrement..." : "Commencer l’enregistrement"}
        </button>

        <button
          type="button"
          onClick={onStopReading}
          disabled={!isRecording}
          className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Arrêter l’enregistrement
        </button>

        <button
          type="button"
          onClick={onAnalyzePronunciation}
          disabled={!hasRecording || isBusy}
          className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isAnalyzing ? "Analyse en cours…" : "Analyser la prononciation"}
        </button>
      </div>

      <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
        {statusMessage ?? (isRecording
          ? "Le microphone enregistre votre lecture."
          : hasRecording
          ? "Enregistrement terminé et prêt pour l’analyse."
          : "Cliquez sur « Commencer l’enregistrement » pour enregistrer votre lecture à voix haute.")}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}
