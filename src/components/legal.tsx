import Link from "next/link";
import { legalConfig } from "@/config/legal";

/** Shown on legal pages until Yosef has approved the wording. */
export function DraftNotice() {
  if (legalConfig.reviewedByLegal) return null;
  return (
    <p className="rounded-control bg-warning-soft p-3 text-sm text-warning">
      Draft for legal review. Not yet in force. Items marked [to be confirmed] still need to be supplied.
    </p>
  );
}

/** "the Terms and the Privacy Policy" with links, for consent lines. */
export function TermsAndPrivacyLinks() {
  return (
    <>
      the{" "}
      <Link href="/terms" target="_blank" className="text-brand underline">Terms</Link> and the{" "}
      <Link href="/privacy" target="_blank" className="text-brand underline">Privacy Policy</Link>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-3xl flex-wrap gap-x-4 gap-y-1 px-4 py-4 text-xs text-muted">
        <Link href="/privacy" className="hover:text-brand">Privacy Policy</Link>
        <Link href="/terms" className="hover:text-brand">Terms</Link>
        <Link href="/account/data" className="hover:text-brand">Your information</Link>
        <span>Card details are handled by our payment provider. We never see or store them.</span>
      </div>
    </footer>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed">{children}</div>
    </section>
  );
}
