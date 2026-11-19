/**
 * Shown the moment a signed-in page is clicked, while it loads (19/11/2026): a heading and a few cards as soft
 * placeholders, the same everywhere, so a click always answers straight away instead of the old page sitting still.
 */
export function PageLoading({ label }: { label: string }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label={label}>
      <div className="skeleton h-9 w-64 max-w-full" />
      <div className="skeleton h-5 w-96 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="skeleton h-32" />
        <div className="skeleton h-32" />
      </div>
      <div className="skeleton h-56" />
    </div>
  );
}
