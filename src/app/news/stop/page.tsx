import type { Metadata } from "next";
import Link from "next/link";
import { confirmStopNews } from "./actions";

// The address carries the donor's link: never pass it on in a Referer header.
export const metadata: Metadata = { title: "Stop emails from a charity", referrer: "no-referrer", robots: { index: false, follow: false } };

/** From the link in a charity's news or appeal. Asks first, so an email scanner opening the link changes nothing. */
export default async function StopNewsPage({ searchParams }: PageProps<"/news/stop">) {
  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t : "";
  return (
    <div className="mx-auto max-w-sm rounded-card border border-border bg-surface p-6">
      <h1 className="text-xl font-semibold">News and appeals</h1>
      {sp.done === "1" ? (
        <p className="mt-3 text-sm">Done. That charity won&apos;t send you news or appeals through Givezy any more. You still get your donation confirmations and s18A receipts.</p>
      ) : token ? (
        <form action={confirmStopNews} className="mt-4 space-y-3">
          <p className="text-sm">Stop news and appeals from this charity? You will still get your donation confirmations and s18A receipts.</p>
          <input type="hidden" name="t" value={token} />
          {sp.error === "1" ? <p role="alert" className="text-sm text-danger">That link didn&apos;t work. Please use the link from the charity&apos;s most recent email.</p> : null}
          <button className="w-full rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast">Stop these emails</button>
        </form>
      ) : (
        <p className="mt-3 text-sm text-muted">Open the link from a charity&apos;s email to stop them.</p>
      )}
      <Link href="/" className="mt-4 inline-block text-sm text-brand underline">Givezy home</Link>
    </div>
  );
}
