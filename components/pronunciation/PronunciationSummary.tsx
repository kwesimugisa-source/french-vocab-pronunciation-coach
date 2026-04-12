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
          Pronunciation Summary
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          This area will show a short overall reading review after analysis.
        </p>
      </div>

      <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        {!summary ? (
          <p>
            No pronunciation analysis yet. Record yourself and click "Analyze
            Pronunciation" to see feedback.
          </p>
        ) : (
          <div className="space-y-2">
            <p>
              <strong>Overall:</strong> {summary.overall}
            </p>
            <p>
              <strong>Clarity:</strong> {summary.clarity}
            </p>
            <p>
              <strong>Rhythm:</strong> {summary.rhythm}
            </p>
            <p>
              <strong>Priority:</strong> {summary.priority}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}