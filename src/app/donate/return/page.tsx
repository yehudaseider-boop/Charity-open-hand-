import type { Metadata } from "next";
import Link from "next/link";
import { SupportContact } from "@/components/legal";
import { KeepChecking } from "./keep-checking";
import { confirmPayment, savedOutcome } from "@/lib/donations/confirm";
import { formatDate } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { labelOf } from "@/lib/donations/labels";
import { APP_RETURN_LINK, donationReference } from "@/lib/donations/reference";
import { confirmationTokenMatches } from "@/lib/donations/confirmation-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { clientIp } from "@/lib/client-ip";
import { hitRateLimit, ipKeys } from "@/lib/rate-limit";
import { dedicationFrom, dedicationLine } from "@/lib/donations/dedication";
import { HebrewAware } from "@/components/hebrew-aware";
import { SOURCE_PARAM, tagOf } from "@/lib/donations/source";
import { getViewer } from "@/lib/auth";
import { impactLine, impactSource, impactUnitFrom } from "@/lib/charity/impact";
import { cardUpdateFor, newCardPath } from "@/lib/donations/new-card";
import { Splash } from "@/components/splash";

// The address carries the donor's credential: never pass it on in a Referer header.
export const metadata: Metadata = { title: "Your donation", referrer: "no-referrer" };

/** The first value of a query parameter, when it is present once or more. */
function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" ? v : undefined;
}

/** Where the gateway sends the donor back. We check the payment ourselves. */
export default async function DonateReturnPage({ searchParams }: PageProps<"/donate/return">) {
  const params = await searchParams;
  // The payment provider adds its own "reference" (the same value) to our address, so a key
  // can arrive twice: take the first.
  const fromApp = first(params.from) === "app";
  const viewer = await getViewer();
  const ref = first(params.reference) ?? "";
  const t = first(params.t);
  // If the payment provider can't be reached, or the result can't be saved yet, say we're still
  // confirming rather than showing an error page. Nothing here says "paid" unless it is saved.
  // Each load can ask the payment provider about the payment, so one visitor gets a generous but
  // limited number of checks (a donor needs about 13); past that the page just says "still confirming".
  // Only the donor (holding the credential from their payment link) may make us ask the payment
  // provider: donation ids are not secret, and the webhook settles every payment anyway. Anyone
  // else sees the saved state only.
  const holdsToken = ref ? await confirmationTokenMatches(ref, t) : false;
  // Per donation: donors behind one shared address (a shul's Wi-Fi) must not block each other.
  const limited = holdsToken ? await hitRateLimit("return-check", [`ref:${ref}`, ...ipKeys(clientIp(await headers()))], 40, 10).catch(() => false) : false;
  const outcome = !holdsToken
    ? await savedOutcome(ref)
    : limited
      ? // Past the limit we stop asking the payment provider, but still read what is saved: a gift the
        // webhook has settled shows as paid (or declined), never as "still confirming".
        await savedOutcome(ref)
      : await confirmPayment(ref).catch((e) => {
          console.error(e);
          return "pending" as const;
        });

  // The donation id is not a secret (charity admins see it), so the donor's details
  // are read only for the signed-in donor (row-level security decides) or for
  // someone holding the credential that came with their payment link.
  const select = "id, recurring_id, amount_cents, contribution_cents, processing_charge_cents, total_charged_cents, paid_at, wants_18a, dedication_kind, dedication_name, campaign_id, came_from, donation_giving_kinds(kind, label), charities(name_en, slug, impact_en, impact_unit_cents, impact_unit_one, impact_unit_many)";
  let d = null;
  if (ref && outcome !== "not_found") {
    if (holdsToken) {
      d = (await createAdminClient().from("donations").select(select).eq("gateway_ref", ref).maybeSingle()).data;
    } else {
      d = (await (await createClient()).from("donations").select(select).eq("gateway_ref", ref).maybeSingle()).data;
    }
  }
  const charity = d?.charities as unknown as { name_en: string; slug: string; impact_en: string | null; impact_unit_cents: number | null; impact_unit_one: string | null; impact_unit_many: string | null } | undefined;
  type LabelRow = { kind: string | null; label: string | null };
  const kindRow = d?.donation_giving_kinds as unknown as LabelRow | LabelRow[] | null | undefined;
  const givingLabel = labelOf(Array.isArray(kindRow) ? kindRow[0] : kindRow);

  // Trying again from the phone app's sheet keeps the way back to the app and the donor's label.
  const retryParams = new URLSearchParams();
  if (fromApp) retryParams.set("from", "app");
  if (givingLabel) retryParams.set("label", givingLabel);
  // A campaign gift tries again for the same campaign (the donate page says if it has ended since).
  if (d?.campaign_id) retryParams.set("campaign", d.campaign_id);
  // A gift from a shared link or the QR poster still counts as one when tried again.
  const tag = tagOf(d?.came_from);
  if (tag) retryParams.set(SOURCE_PARAM, tag);
  // A declined card tries again with the same amount filled in (the donor's own figure, not a secret).
  if (outcome === "failed" && d?.amount_cents) retryParams.set("cents", String(d.amount_cents));
  const retryQuery = retryParams.size ? `?${retryParams}` : "";
  // A new card for a monthly donation ("Update my card"): trying again goes back there, not to a new gift.
  // Only for the donor holding this payment's credential, who is the one the update link was for.
  const cardUpdate = holdsToken && d ? await cardUpdateFor(d.id).catch(() => null) : null;
  const retryHref = cardUpdate ? newCardPath(cardUpdate.recurringId, new Date()) : charity ? `/c/${charity.slug}/donate${retryQuery}` : "/charities";

  if (outcome === "paid" && d && charity) {
    // What this gift pays for, worked out from the charity's own figure (none when it set no figure).
    const unit = impactUnitFrom(charity);
    const paysFor = unit ? impactLine(Number(d.amount_cents), unit, { you: true, monthly: Boolean(d.recurring_id) }) : null;
    return (
      <Result
        tone="paid"
        title="Thank you"
        lead={<>{formatRand(d.amount_cents)} to {charity.name_en}{d.recurring_id ? ", every month" : ""}</>}
      >
        {/* What the gift does, in the charity's own words (left out when it hasn't written one). */}
        {charity.impact_en?.trim() || paysFor ? (
          <div className="mb-5 rounded-control bg-honey-soft p-4">
            <p className="text-sm font-semibold text-brand">What your gift does</p>
            {paysFor ? <p className="mt-1 font-display text-xl leading-snug text-navy">{paysFor}.</p> : null}
            {charity.impact_en?.trim() ? <p className={paysFor ? "mt-2 text-sm text-navy" : "mt-1 font-display text-xl leading-snug text-navy"}>{charity.impact_en.trim()}</p> : null}
            {paysFor && unit ? <p className="mt-2 text-xs text-muted">{impactSource(charity.name_en, unit)}</p> : null}
          </div>
        ) : null}
        <dl className="space-y-1.5 rounded-control border-2 border-border p-4 text-[15px] tabular-nums">
          <div className="flex justify-between gap-3"><dt>Donation to {charity.name_en}</dt><dd className="font-semibold">{formatRand(d.amount_cents)}</dd></div>
          {Number(d.contribution_cents) > 0 ? (
            <div className="flex justify-between gap-3"><dt>Contribution to Givezy</dt><dd>{formatRand(d.contribution_cents)}</dd></div>
          ) : null}
          {Number(d.processing_charge_cents) > 0 ? (
            <div className="flex justify-between gap-3"><dt className="min-w-0">Card charge you covered</dt><dd>{formatRand(d.processing_charge_cents)}</dd></div>
          ) : null}
          <div className="flex justify-between gap-3 border-t border-border pt-1"><dt>Paid</dt><dd>{formatRand(d.total_charged_cents)} on {formatDate(d.paid_at!)}</dd></div>
          <div className="flex justify-between gap-3"><dt>Reference</dt><dd className="font-mono">{donationReference(d.id)}</dd></div>
          {dedicationFrom(d.dedication_kind, d.dedication_name) ? (
            <div className="flex justify-between gap-3">
              <dt>Dedication</dt>
              <dd className="text-right" dir="auto"><HebrewAware text={dedicationLine(dedicationFrom(d.dedication_kind, d.dedication_name)!)} /></dd>
            </div>
          ) : null}
        </dl>
        {cardUpdate ? (
          <p className="mt-3 rounded-control bg-honey-soft p-3 text-sm text-navy">
            {cardUpdate.active
              ? `Your new card is saved for your monthly donation, which carries on as before${cardUpdate.nextChargeAt ? `. Next on ${formatDate(cardUpdate.nextChargeAt)}` : ""}.`
              : "This month's donation is paid. Your monthly donation is not active, so nothing more will be collected."}
          </p>
        ) : null}
        <p className="mt-3 text-sm text-muted">
          A confirmation is on its way to your email.{" "}
          {d.wants_18a ? "This donation will be on your annual s18A receipt after the tax year closes." : null}
        </p>
        {givingLabel ? (
          <p className="mt-2 text-sm text-muted">
            Labelled &quot;{givingLabel}&quot; in your records.
          </p>
        ) : null}
        {fromApp ? (
          <a href={APP_RETURN_LINK} className="pressable mt-5 block rounded-control bg-brand px-4 py-3.5 text-center font-bold text-brand-contrast">
            Back to the Givezy app
          </a>
        ) : null}
        <p className="mt-6 flex flex-wrap gap-3">
          {viewer ? <Link href="/account" className="rounded-full bg-brand px-5 py-2.5 font-semibold text-brand-contrast transition-colors hover:bg-navy">See your giving</Link> : null}
          <Link href={`/c/${charity.slug}`} className="rounded-full border-2 border-border px-5 py-2 font-semibold text-brand transition-colors hover:border-brand">Back to {charity.name_en}</Link>
        </p>
      </Result>
    );
  }
  if (outcome === "paid") {
    // Paid, but we can't show whose it is: no amounts, no giving choice.
    return (
      <Result tone="paid" title="Thank you">
        <p>Your payment went through. A confirmation is on its way to your email.</p>
        <p className="mt-2 text-sm text-muted">To see the details, open the link from your payment or sign in with the email you gave with.</p>
        {fromApp ? (
          <a href={APP_RETURN_LINK} className="pressable mt-5 block rounded-control bg-brand px-4 py-3.5 text-center font-bold text-brand-contrast">
            Back to the Givezy app
          </a>
        ) : null}
        <Link href="/charities" className="mt-3 inline-block font-semibold text-brand underline underline-offset-4">Find a charity</Link>
      </Result>
    );
  }
  if (outcome === "failed") {
    return (
      <Result tone="failed" title="Payment didn't go through">
        <p>
          <strong className="font-semibold text-navy">Nothing was charged{cardUpdate ? " and your monthly donation is unchanged" : ""}.</strong> This usually means the card was declined or the payment page was closed. You can try again with the same card or a different one.
        </p>
        {fromApp ? (
          <>
            <a href={APP_RETURN_LINK} className="pressable mt-5 block rounded-control bg-brand px-4 py-3.5 text-center font-bold text-brand-contrast">
              Back to the Givezy app
            </a>
            <Link href={retryHref} className="mt-3 inline-block font-semibold text-brand underline underline-offset-4">Try again on the website</Link>
          </>
        ) : (
          <Link href={retryHref} className="pressable mt-5 inline-block rounded-control bg-brand px-6 py-3 font-bold text-brand-contrast">
            Try again
          </Link>
        )}
        <p className="mt-4 text-sm text-muted">Need help: <HelpLine /></p>
      </Result>
    );
  }
  if (outcome === "review") {
    return (
      <Result tone="wait" title="We're checking this payment">
        <p>Something about this payment needs a person to look at it. Please don&apos;t pay again. We&apos;ll email you once it&apos;s sorted.</p>
        <p className="mt-3 text-sm text-muted">Questions in the meantime: <HelpLine /></p>
        <p className="mt-4 flex flex-wrap gap-4 text-sm">
          <Link href="/charities" className="font-semibold text-brand underline underline-offset-4">Find a charity</Link>
          <Link href="/account" className="font-semibold text-brand underline underline-offset-4">Your account</Link>
        </p>
      </Result>
    );
  }
  if (outcome === "reversed") {
    return (
      <Result tone="neutral" title="This donation was refunded">
        <p>The money went back to your card, so nothing is owed on this donation. The confirmation email you got for it no longer applies.</p>
        {charity ? <Link href={`/c/${charity.slug}`} className="mt-4 inline-block font-semibold text-brand underline underline-offset-4">Back to {charity.name_en}</Link> : <Link href="/charities" className="mt-4 inline-block font-semibold text-brand underline underline-offset-4">Find a charity</Link>}
        <p className="mt-4 text-sm text-muted">Questions: <HelpLine /></p>
      </Result>
    );
  }
  if (outcome === "pending") {
    return (
      <Result tone="wait" title="We're confirming your payment">
        <p>This can take a minute. Please don&apos;t pay again.</p>
        <KeepChecking retryHref={retryHref} />
      </Result>
    );
  }
  return (
    <Result tone="neutral" title="Donation not found">
      <p className="text-sm text-muted">
        We couldn&apos;t find that donation. If money left your account, send us the date and the amount and we&apos;ll find it: <HelpLine />
      </p>
      <Link href="/charities" className="mt-4 inline-block font-semibold text-brand underline underline-offset-4">Find a charity</Link>
    </Result>
  );
}

/** A person to reach: the support address once there is one. */
function HelpLine() {
  return <><SupportContact />.</>;
}

/**
 * The page's one card, the same for every outcome (style guide: done, waiting, wrong). A paid gift gets the
 * logo's splash and the amount in large type; a failed one a calm card icon (the words carry it, never a red
 * headline); waiting a soft clock.
 */
function Result({ tone, title, lead, children }: { tone: "paid" | "failed" | "wait" | "neutral"; title: string; lead?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="relative mx-auto mt-2 max-w-xl rounded-[2rem] border-2 border-border bg-surface p-6 shadow-[0_24px_48px_rgba(9,37,119,0.08)] sm:mt-6 sm:p-9">
      {tone === "paid" ? (
        <Splash className="mb-4 h-auto w-28 sm:w-32" />
      ) : tone === "wait" ? (
        <span aria-hidden className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-honey-soft">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-brand">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </span>
      ) : tone === "failed" ? (
        <span aria-hidden className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" className="stroke-danger">
            <rect x="3" y="6" width="18" height="12" rx="2.5" />
            <path d="M3 10h18M7 15h3" />
          </svg>
        </span>
      ) : null}
      <h1 className="text-[clamp(1.875rem,5vw,2.5rem)] leading-[1.05]">{title}</h1>
      {lead ? <p className="mt-1 font-display text-[clamp(1.375rem,4vw,1.75rem)] font-semibold leading-snug text-navy">{lead}</p> : null}
      <div className="mt-4 space-y-1 [&>p]:leading-relaxed">{children}</div>
    </section>
  );
}
