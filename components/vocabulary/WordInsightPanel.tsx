import type { WordInsight } from "@/lib/types";

type Props = {
  selectedWord: WordInsight | null;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderHighlightedSentence(sentence: string, targetWord: string) {
  if (!sentence || !targetWord) return sentence || "—";

  const pattern = new RegExp(`(${escapeRegExp(targetWord)})`, "gi");
  const parts = sentence.split(pattern);

  return parts.map((part, index) => {
    const isMatch = part.toLowerCase() === targetWord.toLowerCase();

    if (isMatch) {
      return (
        <mark
          key={`${part}-${index}`}
          className="rounded bg-amber-200 px-1 text-slate-900"
        >
          {part}
        </mark>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

export default function WordInsightPanel({ selectedWord }: Props) {
  return (
    <aside className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 border-b border-slate-100 pb-4">
        <h2 className="text-xl font-semibold text-slate-900">Analyse du mot</h2>
        <p className="mt-1 text-sm text-slate-500">
          Cliquez sur un mot pour explorer son sens, sa structure et ses différences de prononciation.
        </p>
      </div>

      {!selectedWord ? (
        <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
          Sélectionnez un mot pour voir sa racine, son rôle grammatical, ses notes d’usage et sa prononciation en France et au Québec.
        </div>
      ) : (
        <div className="space-y-4 text-sm text-slate-700">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Mot</p>
            <p className="mt-1 font-medium text-slate-900">{selectedWord.word}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Racine</p>
            <p className="mt-1">{selectedWord.root || "—"}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Nature grammaticale</p>
            <p className="mt-1">{selectedWord.partOfSpeech || "—"}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Rôle dans la phrase</p>
            <p className="mt-1 leading-6">{selectedWord.roleInSentence || "—"}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Infinitif</p>
            <p className="mt-1">{selectedWord.infinitive || "—"}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Temps</p>
            <p className="mt-1">{selectedWord.tense || "—"}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Mode</p>
            <p className="mt-1">{selectedWord.mood || "—"}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Conjugaison / forme</p>
            <p className="mt-1">{selectedWord.conjugation || "—"}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Usage / contexte</p>
            <p className="mt-1 leading-6">{selectedWord.usage || "—"}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Contexte de la phrase</p>
            <p className="mt-1 leading-7">
              {renderHighlightedSentence(
                selectedWord.sentence || "—",
                selectedWord.word
              )}
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Prononciation en France</p>
            <p className="mt-1">{selectedWord.francePronunciation || "—"}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Prononciation au Québec</p>
            <p className="mt-1">{selectedWord.quebecPronunciation || "—"}</p>
          </div>
        </div>
      )}
    </aside>
  );
}