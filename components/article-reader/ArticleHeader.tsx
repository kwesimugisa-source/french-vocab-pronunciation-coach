import type { ArticleData } from "@/lib/types";

export default function ArticleHeader({ article }: { article: ArticleData }) {
  return (
    <header className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">
          French Vocabulary + Pronunciation Coach
        </p>

        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Read, listen, improve
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Practice French by reading real text aloud, reviewing pronunciation weak points,
            and exploring vocabulary in context.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 pt-2 text-sm text-slate-600">
          <span className="rounded-full bg-slate-100 px-3 py-1">
            {article.source || "Source pending"}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1">
            {article.level || "Level pending"}
          </span>
        </div>
      </div>
    </header>
  );
}
