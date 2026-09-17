export default function PreparationNotice({ label }: { label?: string | null }) {
  if (!label) return null;
  return <div role="status" aria-live="polite" className="my-3 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
    <span aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-700 motion-reduce:animate-none" />
    <span>{label}</span>
  </div>;
}
