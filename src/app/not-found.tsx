import Link from "next/link";

export default function NotFound() {
  return (
    <div className="space-y-4 rounded-card border border-border bg-surface p-5">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted">This page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/charities" className="rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast">Find a charity</Link>
        <Link href="/" className="rounded-control border border-border px-4 py-2.5 font-medium">Go to the home page</Link>
      </div>
    </div>
  );
}
