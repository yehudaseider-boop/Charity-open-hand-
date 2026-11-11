import Link from "next/link";
import { PageHeader, blueAction, field, secondaryAction } from "@/components/dash";
import { CopyLink } from "../copy-link";
import { platformConfig } from "@/config/platform";
import { giveLink, linkAmountCents } from "@/lib/donations/give-link";
import { formatRand } from "@/lib/money";
import { charityPageUrl, qrSvg, qrTarget } from "@/lib/charity/qr";
import { PrintButton } from "./print-button";

/**
 * The QR poster page's body, shared by the charity dashboard and its public demo: the give link with an amount, and
 * the printable poster. In the demo (`demoHref`), the code and the link open the demo itself, since Sample Charity
 * has no real page.
 */
export async function PosterView({ name, slug, issues18a, sp, backHref, demoHref }: {
  name: string;
  slug: string;
  issues18a: boolean;
  sp: Record<string, string | string[] | undefined>;
  backHref: string;
  demoHref?: string;
}) {
  const charity = { name_en: name, slug };
  const url = charityPageUrl(charity.slug);
  // A give link with an amount and once-off or monthly chosen (decided 04/11/2026): the link to copy and the
  // QR code both open the give form with that amount (and monthly) already selected. Empty: the charity's page.
  const typedAmount = typeof sp.amount === "string" ? sp.amount.slice(0, 16) : "";
  const amountCents = typedAmount.trim() ? linkAmountCents(typedAmount, platformConfig) : undefined;
  const amountRefused = Boolean(typedAmount.trim()) && amountCents === undefined;
  const monthly = sp.monthly === "1";
  const chosen = Boolean(amountCents) || monthly;
  const site = process.env.SITE_URL ?? "";
  const shareUrlReal = chosen ? giveLink(site, charity.slug, { amountCents, monthly, src: "link" }) : `${url}?src=link`;
  // The code opens the page tagged as the poster; the printed address stays short.
  const qrUrlReal = chosen ? giveLink(site, charity.slug, { amountCents, monthly, src: "qr" }) : qrTarget(charity.slug);
  // The demo's code opens the demo: a scan always lands somewhere real.
  const shareUrl = demoHref ?? shareUrlReal;
  const qrUrl = demoHref ?? qrUrlReal;
  const svg = await qrSvg(qrUrl);
  const shortUrl = url.replace(/^https?:\/\//, "");
  const ask = amountCents ? `Give ${formatRand(amountCents)}${monthly ? " a month" : ""} to` : monthly ? "Give every month to" : "Give to";
  const download = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  return (
    <div className="space-y-5">
      <div className="space-y-2 print:hidden">
        <PageHeader
          title="QR poster"
          intro="Put this up where your community sees it: a notice board, your front desk, a table at an event. People point their phone camera at the code and land on your Givezy page, ready to give."
          actions={
            <>
              <PrintButton primary />
              <a href={download} download={`givezy-qr-${charity.slug}.svg`} className={secondaryAction}>
                Download the QR code only
              </a>
            </>
          }
        />
        <p className="text-xs text-muted">Tip: in the print window, choose &quot;Save as PDF&quot; to email it or send it to a print shop.</p>
      </div>

      {/* Start people closer to the finish: a link (and code) with the amount and once-off or monthly already chosen. */}
      <section aria-labelledby="link-builder" className="space-y-3 rounded-card border-2 border-border bg-surface p-5 print:hidden">
        <h2 id="link-builder" className="font-display text-xl font-bold text-indigo">Give link with an amount</h2>
        <p className="text-sm text-muted">Choose an amount and once-off or monthly, and people who use the link or scan the code start with it selected. They can still change it.</p>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="link-amount" className="block text-sm font-semibold">Amount in Rand <span className="font-normal text-muted">(optional)</span></label>
            <input id="link-amount" name="amount" inputMode="numeric" defaultValue={typedAmount} maxLength={16} aria-invalid={amountRefused || undefined} aria-describedby="link-amount-hint" className={`${field} w-36`} />
          </div>
          <fieldset className="flex flex-wrap gap-2">
            <legend className="mb-1 text-sm font-semibold">How often</legend>
            {([["", "Once-off"], ["1", "Every month"]] as const).map(([value, label]) => (
              <label key={label} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-2 border-border px-4 text-sm font-semibold has-checked:border-brand has-checked:bg-honey-soft has-checked:text-brand">
                <input type="radio" name="monthly" value={value} defaultChecked={monthly === (value === "1")} />
                {label}
              </label>
            ))}
          </fieldset>
          <button className={blueAction}>Show my link</button>
        </form>
        {amountRefused ? (
          <p id="link-amount-hint" role="alert" className="text-sm font-semibold text-danger">
            That amount can&apos;t be used. Enter Rand from {formatRand(platformConfig.minDonationCents)} to {formatRand(platformConfig.maxDonationCents)}, for example 250, or leave it empty. The link and code below have no amount.
          </p>
        ) : (
          <p id="link-amount-hint" className="text-xs text-muted">From {formatRand(platformConfig.minDonationCents)} to {formatRand(platformConfig.maxDonationCents)}. Leave it empty for your page without an amount.</p>
        )}
        <div className="space-y-1 text-sm">
          <p className="font-semibold">{chosen ? `Your link: ${amountCents ? formatRand(amountCents) : "any amount"}, ${monthly ? "every month" : "once-off"}` : "Your link"}</p>
          <CopyLink url={shareUrl} />
          <p className="text-xs text-muted">The QR code on the poster below opens the same{chosen ? " choice" : " page"}.</p>
        </div>
      </section>

      {/* The poster itself: what prints. */}
      <section className="mx-auto max-w-md space-y-5 rounded-card border border-border bg-surface p-8 text-center print:max-w-none print:border-0 print:p-0">
        <p className="text-base font-semibold text-muted print:text-xl">{ask}</p>
        <h2 className="text-3xl font-semibold leading-tight text-indigo print:text-5xl"><bdi>{charity.name_en}</bdi></h2>
        <div
          className="mx-auto w-64 print:w-[11cm]"
          role="img"
          aria-label={`QR code that opens ${qrUrl.replace(/^https?:\/\//, "").replace(/[?&]src=qr$/, "")}`}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <p className="text-lg font-semibold print:text-2xl">Point your phone camera here to give</p>
        <p className="text-sm text-muted print:text-base">or go to {shortUrl}</p>
        {issues18a ? <p className="text-sm print:text-base">Donations get an s18A receipt.</p> : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Givezy" width={97} height={32} className="mx-auto h-8 w-auto print:h-10" />
      </section>

      <p className="text-sm print:hidden">
        <Link href={backHref} className="font-semibold text-brand underline hover:text-indigo">Back to your overview</Link>
      </p>
    </div>
  );
}
