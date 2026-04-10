export default function PronunciationSummary() {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 border-b border-slate-100 pb-4">
        <h2 className="text-xl font-semibold text-slate-900">Pronunciation Summary</h2>
        <p className="mt-1 text-sm text-slate-500">
          This area will show a short overall reading review after analysis.
        </p>
      </div>

      <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        No pronunciation analysis yet. In the next stage, this panel will show a concise
        summary of clarity, rhythm, and priority pronunciation corrections.
      </div>
    </section>
  );
}
