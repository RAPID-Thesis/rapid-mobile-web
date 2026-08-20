import { Spinner } from './ui/Button';

/** Route-level fallback for lazily loaded pages. */
export default function PageSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-16 text-ink-subtle"
      role="status"
    >
      <Spinner className="h-6 w-6 text-brand-700" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
