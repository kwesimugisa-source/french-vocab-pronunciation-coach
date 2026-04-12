import type { ArticleData } from "@/lib/types";

type Props = {
  article: ArticleData;
  onWordClick: (word: string) => void;
  selectedWord: string | null;
  weakWords?: string[];
};

function normalizeWord(word: string) {
  return word
    .toLowerCase()
    .trim()
    .replace(/^[^a-zàâçéèêëîïôûùüÿñæœ'-]+|[^a-zàâçéèêëîïôûùüÿñæœ'-]+$/gi, "");
}

export default function ArticleTextPanel({
  article,
  onWordClick,
  selectedWord,
  weakWords = [],
}: Props) {
  const normalizedSelectedWord = selectedWord ? normalizeWord(selectedWord) : null;

  const weakWordSet = new Set(weakWords.map(normalizeWord).filter(Boolean));

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 border-b border-slate-100 pb-4">
        <h2 className="text-xl font-semibold text-slate-900">{article.title}</h2>
        <p className="mt-1 text-sm text-slate-500">
          Article reading area. Click words to explore them in the side panel.
        </p>
      </div>

      <div className="space-y-4 text-[16px] leading-8 text-slate-700">
        {article.text.split("\n\n").map((paragraph, index) => (
          <p key={index}>
            {paragraph.split(" ").map((word, i) => {
              const cleaned = normalizeWord(word);
              const isSelected = cleaned && cleaned === normalizedSelectedWord;
              const isWeak = cleaned && weakWordSet.has(cleaned);

              return (
                <button
                  key={`${index}-${i}`}
                  type="button"
                  onClick={() => onWordClick(word)}
                  className={[
                    "inline rounded px-1 text-left transition",
                    "hover:bg-amber-100",
                    isSelected
                      ? "bg-amber-200 font-medium text-slate-900"
                      : isWeak
                      ? "bg-rose-100 font-medium text-rose-700 ring-1 ring-rose-200"
                      : "",
                  ].join(" ")}
                >
                  {word}&nbsp;
                </button>
              );
            })}
          </p>
        ))}
      </div>
    </section>
  );
}