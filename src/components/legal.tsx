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
      <Link href="/terms" target="_blank" className="text-brand underline">Terms<span className="sr-only"> (opens in a new tab)</span></Link> and the{" "}
      <Link href="/privacy" target="_blank" className="text-brand underline">Privacy Policy<span className="sr-only"> (opens in a new tab)</span></Link>
    </>
  );
}

const footerGroups = [
  { title: "Give", links: [["Find a charity", "/charities"], ["How it works", "/#how"], ["Your account", "/account"]] },
  { title: "Charities", links: [["For charities", "/for-charities"], ["List your charity", "/apply"], ["Charity sign in", "/login"]] },
  { title: "Your privacy", links: [["Privacy Policy", "/privacy"], ["Terms", "/terms"], ["Your information", "/account/data"]] },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-auto bg-navy text-white print:hidden">
      <div className="mx-auto grid max-w-[75rem] grid-cols-2 gap-x-6 gap-y-9 px-4 pb-8 pt-12 sm:grid-cols-3 sm:px-6 md:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))]">
        <div className="col-span-2 flex flex-col items-start gap-3 sm:col-span-3 md:col-span-1">
          <Link href="/" aria-label="Givezy home" className="rounded-xl bg-white px-3 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Givezy" width={97} height={32} className="h-8 w-auto" />
          </Link>
          <p className="max-w-[18rem] text-[15px] leading-relaxed text-white/70">Registered South African charities, checked by us. Give in a minute, and keep every gift in one place.</p>
        </div>
        {footerGroups.map((g) => (
          <nav key={g.title} aria-label={g.title} className="flex flex-col gap-1">
            <h2 className="text-sm font-bold text-white!">{g.title}</h2>
            <ul className="flex flex-col text-[15px]">
              {g.links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="inline-flex min-h-11 items-center text-white/70 underline-offset-4 transition-colors hover:text-white hover:underline">{label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="mx-auto max-w-[75rem] px-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-white/15 py-5 text-[13px] text-white/70">
        <p className="flex items-center gap-2">
          <svg aria-hidden viewBox="0 0 24 24" width="16" height="16" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 stroke-honey">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          Card details are handled by our payment provider. We never see or store them.
        </p>
        <p>© {new Date().getFullYear()} Givezy</p>
      </div>
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

/** How a charity reaches us: the support address once there is one, until then a reply to our emails. */
export function SupportContact() {
  const email = legalConfig.supportEmail;
  return email ? (
    <a href={`mailto:${email}`} className="text-brand underline">{email}</a>
  ) : (
    <>reply to any email we&apos;ve sent you</>
  );
}
