export default function WeakPointsPanel() {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 border-b border-slate-100 pb-4">
        <h2 className="text-xl font-semibold text-slate-900">Weak Points</h2>
        <p className="mt-1 text-sm text-slate-500">
          Flagged words and sounds will appear here after analysis.
        </p>
      </div>

      <div className="space-y-3">
        <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
          No weak points yet.
        </div>
      </div>
    </section>
  );
}
