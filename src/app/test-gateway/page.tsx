import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getGateway } from "@/lib/gateway";
import { testGatewaySign } from "@/lib/gateway/test-gateway";
import { formatRand } from "@/lib/money";
import { completeTestPayment } from "./actions";

export const metadata: Metadata = { title: "Test payment" };

/** The stand-in gateway's hosted payment page. Local development only. */
export default async function TestGatewayPage({ searchParams }: PageProps<"/test-gateway">) {
  if (getGateway().name !== "test") notFound();
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const k of ["reference", "total", "share", "account", "email", "return"]) {
    params.set(k, typeof sp[k] === "string" ? (sp[k] as string) : "");
  }
  if (sp.sig !== testGatewaySign(params.toString())) notFound();
  const total = Number(params.get("total"));
  const share = Number(params.get("share"));

  return (
    <div className="mx-auto max-w-sm space-y-4 rounded-card border-2 border-dashed border-warning bg-surface p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-warning">Test gateway: no real money</p>
      <h1 className="text-xl font-semibold">Pay {formatRand(total)}</h1>
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between"><dt className="text-muted">To charity account</dt><dd>{formatRand(share)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">To platform</dt><dd>{formatRand(total - share)}</dd></div>
      </dl>
      <form action={completeTestPayment} className="space-y-2">
        {[...params.entries()].map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <button name="outcome" value="success" className="w-full rounded-control bg-brand px-4 py-3 font-medium text-brand-contrast">
          Pay (simulate success)
        </button>
        <button name="outcome" value="failed" className="w-full rounded-control border border-border px-4 py-3">
          Decline (simulate failure)
        </button>
      </form>
    </div>
  );
}
