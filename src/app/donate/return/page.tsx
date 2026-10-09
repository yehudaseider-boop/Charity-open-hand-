import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/card";
import { KeepChecking } from "./keep-checking";
import { confirmPayment } from "@/lib/donations/confirm";
import { formatDate } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { givingKinds } from "@/lib/donations/validation";
import { APP_RETURN_LINK, donationReference } from "@/lib/donations/reference";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Thank you" };

/** Where the gateway sends the donor back. We check the payment ourselves. */
export default async function DonateReturnPage({ searchParams }: PageProps<"/donate/return">) {
  const { reference, from } = await searchParams;
  const fromApp = from === "app";
  const ref = typeof reference === "string" ? reference : "";
  // If the payment provider can't be reached, say we're still confirming rather than showing an error page.
  const outcome = await confirmPayment(ref).catch((e) => {
    console.error(e);
    return "pending" as const;
  });

  const { data: d } = ref && outcome !== "not_found"
    ? await createAdminClient()
        .from("donations")
        .select("id, amount_cents, contribution_cents, total_charged_cents, paid_at, wants_18a, donation_giving_kinds(kind), charities(name_en, slug)")
        .eq("gateway_ref", ref)
        .maybeSingle()
    : { data: null };
  const charity = d?.charities as unknown as { name_en: string; slug: string } | undefined;
  const kindRow = d?.donation_giving_kinds as unknown as { kind: string } | { kind: string }[] | null | undefined;
  const givingKind = (Array.isArray(kindRow) ? kindRow[0] : kindRow)?.kind;

  if (outcome === "paid" && d && charity) {
    return (
      <Card title="Thank you">
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-3"><dt>Donation to {charity.name_en}</dt><dd className="font-semibold">{formatRand(d.amount_cents)}</dd></div>
          {Number(d.contribution_cents) > 0 ? (
            <div className="flex justify-between gap-3"><dt>Contribution to NEDIV lev</dt><dd>{formatRand(d.contribution_cents)}</dd></div>
          ) : null}
          <div className="flex justify-between gap-3 border-t border-border pt-1"><dt>Paid</dt><dd>{formatRand(d.total_charged_cents)} on {formatDate(d.paid_at!)}</dd></div>
          <div className="flex justify-between gap-3"><dt>Reference</dt><dd className="font-mono">{donationReference(d.id)}</dd></div>
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
            Back to the NEDIV lev app
          </a>
        ) : null}
        <Link href={`/c/${charity.slug}`} className="mt-3 inline-block text-sm text-brand underline">Back to {charity.name_en}</Link>
      </Card>
    );
  }
  if (outcome === "failed") {
    return (
      <Card title="Payment didn't go through">
        <p className="text-sm">Nothing was charged. You can try again.</p>
        <Link href={charity ? `/c/${charity.slug}/donate` : "/charities"} className="mt-4 inline-block rounded-control bg-brand px-4 py-2.5 text-sm font-medium text-brand-contrast">
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
        <KeepChecking />
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
