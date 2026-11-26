import Link from "next/link";

export default function NotFound() {
  return (
    <div className="space-y-4 rounded-card border border-border bg-surface p-5">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted">This page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/charities" className="pressable inline-flex min-h-11 items-center rounded-control bg-coral px-5 font-bold text-navy">Find a charity</Link>
        <Link href="/" className="inline-flex min-h-11 items-center rounded-control border-2 border-outline px-5 font-bold text-navy hover:border-brand">Go to the home page</Link>
      </div>
    </div>
  );
}
