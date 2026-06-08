import type { Props } from "./types"; // keep your existing import if different

type Props = {
  summary: {
    overall: string;
    clarity: string;
    rhythm: string;
    priority: string;
  } | null;
};

export default function PronunciationSummary({ summary }: Props) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 border-b border-slate-100 pb-4">
        <h2 className="text-xl font-semibold text-slate-900">
          Résumé de la prononciation
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Cette section affichera une évaluation générale de votre lecture après l’analyse.
        </p>
      </div>

      <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        {!summary ? (
          <p>
            Aucune analyse de prononciation pour le moment. Enregistrez votre lecture puis cliquez sur « Analyser la prononciation » pour obtenir une rétroaction.
          </p>
        ) : (
          <div className="space-y-2">
            <p>
              <strong>Évaluation générale :</strong> {summary.overall}
            </p>

            <p>
              <strong>Clarté :</strong> {summary.clarity}
            </p>

            <p>
              <strong>Rythme :</strong> {summary.rhythm}
            </p>

            <p>
              <strong>Priorité :</strong> {summary.priority}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}