type Props = {
  contentType: string;
  level: string;
  readingSpeed: string;
  isPlayingAudio: boolean;
  isGenerating: boolean;
  onContentTypeChange: (value: string) => void;
  onLevelChange: (value: string) => void;
  onReadingSpeedChange: (value: string) => void;
  onPlayAudio: () => void;
  onGenerateArticle: () => void;
};

const contentTypes = [
  { value: "news", label: "Actualités" },
  { value: "opinion", label: "Opinion" },
  { value: "creative", label: "Créatif" },
  { value: "conversation", label: "Conversation" },
  { value: "academic", label: "Académique" },
  { value: "everyday-life", label: "Vie quotidienne" },
  { value: "poetry", label: "Poésie" },
  { value: "theatre", label: "Pièce de théâtre" },
  { value: "tongue-twisters", label: "Virelangues" },
];

const levels = ["A1", "A2", "B1", "B2", "C1", "C2"];

const readingSpeeds = [
  { value: "very-slow", label: "Très lent" },
  { value: "slow", label: "Lent" },
  { value: "normal", label: "Normal" },
  { value: "fast", label: "Rapide" },
];

export default function ReadingSetupBar({
  contentType,
  level,
  readingSpeed,
  isPlayingAudio,
  isGenerating,
  onContentTypeChange,
  onLevelChange,
  onReadingSpeedChange,
  onPlayAudio,
  onGenerateArticle,
}: Props) {
  return (
    <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="min-w-[220px]">
            <label
              htmlFor="contentType"
              className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-slate-500"
            >
              Type de contenu
            </label>
            <select
              id="contentType"
              value={contentType}
              onChange={(e) => onContentTypeChange(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-slate-500"
            >
              {contentTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[140px]">
            <label
              htmlFor="level"
              className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-slate-500"
            >
              Niveau
            </label>
            <select
              id="level"
              value={level}
              onChange={(e) => onLevelChange(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-slate-500"
            >
              {levels.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[160px]">
            <label
              htmlFor="readingSpeed"
              className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-slate-500"
            >
              Vitesse de lecture IA
            </label>
            <select
              id="readingSpeed"
              value={readingSpeed}
              onChange={(e) => onReadingSpeedChange(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-slate-500"
            >
              {readingSpeeds.map((speed) => (
                <option key={speed.value} value={speed.value}>
                  {speed.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onGenerateArticle}
            disabled={isGenerating}
            className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
           {isGenerating ? "Génération..." : "Générer un texte"}
          </button>

          <button
            type="button"
            onClick={onPlayAudio}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {isPlayingAudio ? "Arrêter la lecture IA" : "Lecture la IA"}
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
        L’IA générera un texte en français selon le type de contenu, le niveau et la vitesse de lecture sélectionnés.
      </div>
    </section>
  );
}