import type { Metadata } from "next";
import Link from "next/link";
import { SupportContact } from "@/components/legal";
import { PendingButton } from "@/components/forms/pending-button";
import { getViewer } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { loadNewCardOffer, newCardLinkValid, offerMessage, ownsMonthly, type NotOffered } from "@/lib/donations/new-card";
import { payWithNewCard } from "./actions";

// The address carries the donor's signed link: never pass it on in a Referer header.
export const metadata: Metadata = { title: "Update your card", referrer: "no-referrer" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Why the last try didn't open the payment page, in plain words. */
function tryMessage(x: string): string | null {
  if (x === "link") return "This link has expired or isn't complete. Sign in to your account to update your card there.";
  if (x === "limit") return "That was a few tries in a short time. Nothing was charged. Please wait ten minutes, then try again.";
  if (x === "error") return "Something went wrong on our side. Nothing was charged and your monthly donation is unchanged. Please try again.";
  if (["not_needed", "busy", "charity_closed", "gone", "gateway", "start_again"].includes(x)) return offerMessage(x as NotOffered | "gateway");
  return null;
}

/**
 * "Update my card" for a monthly donation whose card was declined: pay this month with a new card on the
 * payment provider's page, and the same monthly donation carries on with it. Opened from the "we could not
 * collect" email (signed link) or from the donor's account.
 */
export default async function NewCardPage({ searchParams }: PageProps<"/monthly/new-card">) {
  const sp = await searchParams;
  const m = first(sp.m);
  const e = first(sp.e);
  const s = first(sp.s);
  const now = new Date();
  const viewer = await getViewer();
  const allowed = newCardLinkValid(m, e, s, now) || (viewer ? await ownsMonthly(viewer.userId, m).catch(() => false) : false);
  const problem = tryMessage(first(sp.x));

  if (!allowed) {
    return (
      <Shell title="This link has expired">
        <p>For your safety, the link in our email works for 30 days. Sign in with the email you give with, and update your card from your account.</p>
        <Link href={`/login?next=${encodeURIComponent("/account")}`} className="pressable mt-5 inline-block rounded-control bg-brand px-6 py-3 font-bold text-brand-contrast">
          Sign in
        </Link>
        <p className="mt-4 text-sm text-muted">Need help? <SupportContact />.</p>
      </Shell>
    );
  }

  const offer = await loadNewCardOffer(m, now).catch((err) => {
    console.error(err);
    return null;
  });
  if (!offer) {
    return (
      <Shell title="We couldn't load this just now">
        <p>Nothing was charged and your monthly donation is unchanged. Please try again in a minute.</p>
        <Link href={`/monthly/new-card?${new URLSearchParams({ m, ...(e && s ? { e, s } : {}) })}`} className="pressable mt-5 inline-block rounded-control bg-brand px-6 py-3 font-bold text-brand-contrast">
          Try again
        </Link>
        <p className="mt-4 text-sm text-muted">Need help? <SupportContact />.</p>
      </Shell>
    );
  }
  if (!offer.ok) {
    return (
      <Shell title={offer.reason === "not_needed" ? "Nothing to update" : offer.reason === "start_again" ? "Your monthly donation has stopped" : "Your card can't be updated right now"}>
        <p>{offerMessage(offer.reason)}</p>
        <p className="mt-4 flex flex-wrap gap-4">
          {offer.charitySlug ? <Link href={`/c/${offer.charitySlug}/donate`} className="font-semibold text-brand underline underline-offset-4">Start a new monthly donation</Link> : null}
          <Link href="/account" className="font-semibold text-brand underline underline-offset-4">Your account</Link>
          <Link href="/charities" className="font-semibold text-brand underline underline-offset-4">Find a charity</Link>
        </p>
        <p className="mt-4 text-sm text-muted">Need help? <SupportContact />.</p>
      </Shell>
    );
  }

  return (
    <Shell title="Update your card">
      <p>
        {offer.stopped
          ? `Your monthly donation to ${offer.charityName} stopped because we couldn't collect it from your card${offer.cardLast4 ? ` ending ${offer.cardLast4}` : ""}.`
          : `We couldn't collect your monthly donation to ${offer.charityName} from your card${offer.cardLast4 ? ` ending ${offer.cardLast4}` : ""}.`}{" "}
        Nothing was charged.
      </p>
      <dl className="mt-4 space-y-1.5 rounded-control border-2 border-border p-4 text-[15px] tabular-nums">
        <div className="flex justify-between gap-3"><dt className="min-w-0">Monthly donation to {offer.charityName}</dt><dd className="whitespace-nowrap font-semibold">{formatRand(offer.amountCents)}</dd></div>
        {offer.contributionCents > 0 ? (
          <div className="flex justify-between gap-3"><dt>Contribution to Givezy</dt><dd>{formatRand(offer.contributionCents)}</dd></div>
        ) : null}
        <div className="flex justify-between gap-3 border-t border-border pt-1"><dt className="min-w-0">Pay now, for this month</dt><dd className="whitespace-nowrap font-semibold">{formatRand(offer.totalCents)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="min-w-0">Then monthly, next on</dt><dd className="whitespace-nowrap">{formatDate(offer.nextChargeAt)}</dd></div>
      </dl>
      {problem ? <p role="alert" className="mt-4 rounded-control bg-danger-soft p-3 text-sm text-danger">{problem}</p> : null}
      <form action={payWithNewCard} className="mt-5">
        <input type="hidden" name="m" value={m} />
        <input type="hidden" name="e" value={e} />
        <input type="hidden" name="s" value={s} />
        <PendingButton pendingLabel="Opening the payment page…" className="pressable w-full rounded-control bg-coral px-4 py-3.5 font-bold text-navy">
          Pay {formatRand(offer.totalCents)} with a new card
        </PendingButton>
      </form>
      <p className="mt-3 text-sm text-muted">
        You enter the card on the payment provider&apos;s secure page; we never see it. By paying, you agree that the new card is used for this
        monthly donation, the same amount each month, until you pause or cancel it in your account or the Givezy app.
      </p>
      <p className="mt-4 text-sm text-muted">Need help? <SupportContact />.</p>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-xl rounded-[2rem] border-2 border-border bg-surface p-6 sm:p-8">
      <h1 className="mb-3 font-display text-3xl font-semibold text-indigo [text-wrap:balance]">{title}</h1>
      {children}
    </section>
  );
}
