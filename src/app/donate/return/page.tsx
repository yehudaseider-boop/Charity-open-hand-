import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/card";
import { confirmPayment } from "@/lib/donations/confirm";
import { formatDate } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { givingKinds } from "@/lib/donations/validation";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Thank you" };

/** Where the gateway sends the donor back. We check the payment ourselves. */
export default async function DonateReturnPage({ searchParams }: PageProps<"/donate/return">) {
  const { reference } = await searchParams;
  const ref = typeof reference === "string" ? reference : "";
  const outcome = await confirmPayment(ref);

  const { data: d } = ref && outcome !== "not_found"
    ? await createAdminClient()
        .from("donations")
        .select("amount_cents, total_charged_cents, paid_at, wants_18a, giving_kind, charities(name_en, slug)")
        .eq("gateway_ref", ref)
        .maybeSingle()
    : { data: null };
  const charity = d?.charities as unknown as { name_en: string; slug: string } | undefined;

  if (outcome === "paid" && d && charity) {
    return (
      <Card title="Thank you">
        <p className="text-sm">
          Your donation of <strong>{formatRand(d.amount_cents)}</strong> to <strong>{charity.name_en}</strong> has gone through.
        </p>
        <p className="mt-2 text-sm text-muted">
          Charged {formatRand(d.total_charged_cents)} on {formatDate(d.paid_at!)}.{" "}
          {d.wants_18a ? "Your donation will be on your annual s18A receipt after the tax year closes." : null}
        </p>
        {d.giving_kind && d.giving_kind in givingKinds ? (
          <p className="mt-2 text-sm text-muted">
            Counted as {givingKinds[d.giving_kind as keyof typeof givingKinds].toLowerCase()} in your records.
          </p>
        ) : null}
        <Link href={`/c/${charity.slug}`} className="mt-4 inline-block text-sm text-brand underline">Back to {charity.name_en}</Link>
      </Card>
    );
  }
  if (outcome === "failed" && charity) {
    return (
      <Card title="Payment didn't go through">
        <p className="text-sm">Nothing was charged. You can try again.</p>
        <Link href={`/c/${charity.slug}/donate`} className="mt-4 inline-block rounded-control bg-brand px-4 py-2.5 text-sm font-medium text-brand-contrast">
          Try again
        </Link>
      </Card>
    );
  }
  if (outcome === "pending" || outcome === "review") {
    return (
      <Card title="We're confirming your payment">
        <p className="text-sm">This can take a minute. Refresh this page shortly. Please don&apos;t pay again.</p>
      </Card>
    );
  }
  return (
    <Card title="Donation not found">
      <p className="text-sm text-muted">We couldn&apos;t find that donation.</p>
    </Card>
  );
}
