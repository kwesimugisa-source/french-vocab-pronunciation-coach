type Props = {
  isRecording: boolean;
  hasRecording: boolean;
  onStartReading: () => void;
  onStopReading: () => void;
  onAnalyzePronunciation: () => void;
};

export default function ReadingControls({
  isRecording,
  hasRecording,
  onStartReading,
  onStopReading,
  onAnalyzePronunciation,
}: Props) {
  return (
    <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onStartReading}
          disabled={isRecording}
          className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRecording ? "Enregistrement..." : "Commencer la lecture"}
        </button>

        <button
          type="button"
          onClick={onStopReading}
          disabled={!isRecording}
          className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Arrêter
        </button>

        <button
          type="button"
          onClick={onAnalyzePronunciation}
          disabled={!hasRecording}
          className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Analyser la prononciation
        </button>
      </div>

      <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
        {isRecording
          ? "Le microphone enregistre votre lecture."
          : hasRecording
          ? "Enregistrement terminé et prêt pour l’analyse."
          : "Cliquez sur « Commencer la lecture » pour enregistrer votre lecture à voix haute."}
      </div>
    </section>
  );
}