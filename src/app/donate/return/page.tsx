import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/card";
import { KeepChecking } from "./keep-checking";
import { confirmPayment } from "@/lib/donations/confirm";
import { formatDate } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { givingKinds } from "@/lib/donations/validation";
import { APP_RETURN_LINK, donationReference } from "@/lib/donations/reference";
import { confirmationTokenMatches } from "@/lib/donations/confirmation-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { clientIp } from "@/lib/client-ip";
import { hitRateLimit } from "@/lib/rate-limit";
import { dedicationFrom, dedicationLine } from "@/lib/donations/dedication";

// The address carries the donor's credential: never pass it on in a Referer header.
export const metadata: Metadata = { title: "Thank you", referrer: "no-referrer" };

/** Where the gateway sends the donor back. We check the payment ourselves. */
export default async function DonateReturnPage({ searchParams }: PageProps<"/donate/return">) {
  const params = await searchParams;
  // The payment provider adds its own "reference" (the same value) to our address, so a key
  // can arrive twice: take the first.
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const fromApp = first(params.from) === "app";
  const ref = first(params.reference) ?? "";
  const t = first(params.t);
  // If the payment provider can't be reached, or the result can't be saved yet, say we're still
  // confirming rather than showing an error page. Nothing here says "paid" unless it is saved.
  // Each load can ask the payment provider about the payment, so one visitor gets a generous but
  // limited number of checks (a donor needs about 13); past that the page just says "still confirming".
  const limited = await hitRateLimit("return-check", [`ip:${clientIp(await headers())}`], 40, 10).catch(() => false);
  const outcome = limited
    ? ("pending" as const)
    : await confirmPayment(ref).catch((e) => {
        console.error(e);
        return "pending" as const;
      });

  // The donation id is not a secret (charity admins see it), so the donor's details
  // are read only for the signed-in donor (row-level security decides) or for
  // someone holding the credential that came with their payment link.
  const select = "id, amount_cents, contribution_cents, total_charged_cents, paid_at, wants_18a, dedication_kind, dedication_name, campaign_id, donation_giving_kinds(kind), charities(name_en, slug)";
  let d = null;
  if (ref && outcome !== "not_found") {
    if (await confirmationTokenMatches(ref, t)) {
      d = (await createAdminClient().from("donations").select(select).eq("gateway_ref", ref).maybeSingle()).data;
    } else {
      d = (await (await createClient()).from("donations").select(select).eq("gateway_ref", ref).maybeSingle()).data;
    }
  }
  const charity = d?.charities as unknown as { name_en: string; slug: string } | undefined;
  const kindRow = d?.donation_giving_kinds as unknown as { kind: string } | { kind: string }[] | null | undefined;
  const givingKind = (Array.isArray(kindRow) ? kindRow[0] : kindRow)?.kind;

  // Trying again from the phone app's sheet keeps the way back to the app and the giving choice.
  const retryParams = new URLSearchParams();
  if (fromApp) retryParams.set("from", "app");
  if (givingKind && givingKind in givingKinds) retryParams.set("kind", givingKind);
  // A campaign gift tries again for the same campaign (the donate page says if it has ended since).
  if (d?.campaign_id) retryParams.set("campaign", d.campaign_id);
  const retryQuery = retryParams.size ? `?${retryParams}` : "";

  if (outcome === "paid" && d && charity) {
    return (
      <Card title="Thank you">
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-3"><dt>Donation to {charity.name_en}</dt><dd className="font-semibold">{formatRand(d.amount_cents)}</dd></div>
          {Number(d.contribution_cents) > 0 ? (
            <div className="flex justify-between gap-3"><dt>Contribution to Givezy</dt><dd>{formatRand(d.contribution_cents)}</dd></div>
          ) : null}
          <div className="flex justify-between gap-3 border-t border-border pt-1"><dt>Paid</dt><dd>{formatRand(d.total_charged_cents)} on {formatDate(d.paid_at!)}</dd></div>
          <div className="flex justify-between gap-3"><dt>Reference</dt><dd className="font-mono">{donationReference(d.id)}</dd></div>
          {dedicationFrom(d.dedication_kind, d.dedication_name) ? (
            <div className="flex justify-between gap-3"><dt>Dedication</dt><dd className="text-right" dir="auto">{dedicationLine(dedicationFrom(d.dedication_kind, d.dedication_name)!)}</dd></div>
          ) : null}
        </dl>
        <p className="mt-3 text-sm text-muted">
          A confirmation is on its way to your email.{" "}
          {d.wants_18a ? "This donation will be on your annual s18A receipt after the tax year closes." : null}
        </p>
        {givingKind && givingKind in givingKinds ? (
          <p className="mt-2 text-sm text-muted">
            Counted as {givingKinds[givingKind as keyof typeof givingKinds].toLowerCase()} in your records.
          </p>
        ) : null}
        {fromApp ? (
          <a href={APP_RETURN_LINK} className="mt-4 block rounded-control bg-brand px-4 py-3 text-center font-medium text-brand-contrast">
            Back to the Givezy app
          </a>
        ) : null}
        <Link href={`/c/${charity.slug}`} className="mt-3 inline-block text-sm text-brand underline">Back to {charity.name_en}</Link>
      </Card>
    );
  }
  if (outcome === "paid") {
    // Paid, but we can't show whose it is: no amounts, no giving choice.
    return (
      <Card title="Thank you">
        <p className="text-sm">Your payment went through. A confirmation is on its way to your email.</p>
        <p className="mt-2 text-sm text-muted">To see the details, open the link from your payment or sign in with the email you gave with.</p>
        {fromApp ? (
          <a href={APP_RETURN_LINK} className="mt-4 block rounded-control bg-brand px-4 py-3 text-center font-medium text-brand-contrast">
            Back to the Givezy app
          </a>
        ) : null}
        <Link href="/charities" className="mt-3 inline-block text-sm text-brand underline">Find a charity</Link>
      </Card>
    );
  }
  if (outcome === "failed") {
    return (
      <Card title="Payment didn't go through">
        <p className="text-sm">Nothing was charged. You can try again.</p>
        <Link href={charity ? `/c/${charity.slug}/donate${retryQuery}` : "/charities"} className="mt-4 inline-block rounded-control bg-brand px-4 py-2.5 text-sm font-medium text-brand-contrast">
          Try again
        </Link>
      </Card>
    );
  }
  if (outcome === "review") {
    return (
      <Card title="We're checking this payment">
        <p className="text-sm">Something about this payment needs a person to look at it. Please don&apos;t pay again. We&apos;ll email you once it&apos;s sorted.</p>
      </Card>
    );
  }
  if (outcome === "pending") {
    return (
      <Card title="We're confirming your payment">
        <p className="text-sm">This can take a minute. Please don&apos;t pay again.</p>
        <KeepChecking retryHref={charity ? `/c/${charity.slug}/donate${retryQuery}` : "/charities"} />
      </Card>
    );
  }
  return (
    <Card title="Donation not found">
      <p className="text-sm text-muted">We couldn&apos;t find that donation. If you were charged, your confirmation email has the reference.</p>
      <Link href="/charities" className="mt-4 inline-block text-sm text-brand underline">Find a charity</Link>
    </Card>
  );
}
