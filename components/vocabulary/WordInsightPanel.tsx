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
        <h2 className="text-xl font-semibold text-slate-900">Word Insight</h2>
        <p className="mt-1 text-sm text-slate-500">
          Click a word later to explore meaning, structure, and pronunciation differences.
        </p>
      </div>

      {!selectedWord ? (
        <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
          Select a word to view its root, grammatical role, usage notes, and France vs Québec pronunciation.
        </div>
      ) : (
        <div className="space-y-4 text-sm text-slate-700">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Word</p>
            <p className="mt-1 font-medium text-slate-900">{selectedWord.word}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Root</p>
            <p className="mt-1">{selectedWord.root || "—"}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Part of Speech</p>
            <p className="mt-1">{selectedWord.partOfSpeech || "—"}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Role in Sentence</p>
            <p className="mt-1 leading-6">{selectedWord.roleInSentence || "—"}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Infinitive</p>
            <p className="mt-1">{selectedWord.infinitive || "—"}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Tense</p>
            <p className="mt-1">{selectedWord.tense || "—"}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Mood</p>
            <p className="mt-1">{selectedWord.mood || "—"}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Conjugation / Form</p>
            <p className="mt-1">{selectedWord.conjugation || "—"}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Usage / Context</p>
            <p className="mt-1 leading-6">{selectedWord.usage || "—"}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Sentence Context</p>
            <p className="mt-1 leading-7">
              {renderHighlightedSentence(
                selectedWord.sentence || "—",
                selectedWord.word
              )}
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">France pronunciation</p>
            <p className="mt-1">{selectedWord.francePronunciation || "—"}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Québec pronunciation</p>
            <p className="mt-1">{selectedWord.quebecPronunciation || "—"}</p>
          </div>
        </div>
      )}
    </aside>
  );
}