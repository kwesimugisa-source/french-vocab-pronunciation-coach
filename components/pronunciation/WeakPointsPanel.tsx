type WeakPoint = {
  word: string;
  note: string;
  severity: "low" | "medium" | "high";
};

type Props = {
  weakPoints: WeakPoint[];
};

export default function WeakPointsPanel({ weakPoints }: Props) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 border-b border-slate-100 pb-4">
        <h2 className="text-xl font-semibold text-slate-900">Weak Points</h2>
        <p className="mt-1 text-sm text-slate-500">
          Flagged words and sounds will appear here after analysis.
        </p>
      </div>

      <div className="space-y-3">
        {weakPoints.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            No weak points yet.
          </div>
        ) : (
          weakPoints.map((item, index) => (
            <div
              key={`${item.word}-${index}`}
              className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700"
            >
              <p className="font-medium text-slate-900">{item.word}</p>
              <p className="mt-1 leading-6">{item.note}</p>
              <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">
                Severity: {item.severity}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}