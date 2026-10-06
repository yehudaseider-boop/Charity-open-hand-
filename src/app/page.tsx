import Link from "next/link";
import { platformConfig } from "@/config/platform";

export default function Home() {
  return (
    <div className="space-y-6">
      <section className="rounded-card bg-surface border border-border p-6">
        <h1 className="text-2xl font-semibold">{platformConfig.appName}</h1>
        <p className="mt-2 text-muted">{platformConfig.appTagline}</p>
        <Link
          href="/charities"
          className="mt-5 inline-block rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast"
        >
          Find a charity
        </Link>
      </section>
      <p className="text-sm text-muted">
        Your gift goes straight to the charity&apos;s own bank account. We never hold your money.
      </p>
    </div>
  );
}
