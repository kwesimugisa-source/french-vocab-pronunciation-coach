import type { ArticleData } from "@/lib/types";

export default function ArticleHeader({ article }: { article: ArticleData }) {
  return (
    <header className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">
          Coach de vocabulaire et de prononciation française
        </p>

        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Lire, écouter, progresser
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Pratiquez votre français en lisant des textes à voix haute,
            en repérant vos points faibles de prononciation et en explorant
            le vocabulaire dans son contexte.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 pt-2 text-sm text-slate-600">
          <span className="rounded-full bg-slate-100 px-3 py-1">
            {article.source || "Source en attente"}
          </span>

          <span className="rounded-full bg-slate-100 px-3 py-1">
            {article.level || "Niveau en attente"}
          </span>
        </div>
      </div>
    </header>
  );
}