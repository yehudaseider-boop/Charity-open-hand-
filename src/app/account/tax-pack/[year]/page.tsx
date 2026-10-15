import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { taxYearFor } from "@/lib/dates";
import { parseTaxYear } from "@/lib/tax-pack/build";
import { loadTaxPack } from "@/lib/tax-pack/load";
import { TaxPackView } from "./view";

export const metadata: Metadata = { title: "Tax pack" };

/**
 * The donor's annual tax pack, laid out for A4: every paid donation in the tax year, what goes on
 * s18A receipts, the totals, and the receipts issued. "Save as PDF" uses the browser's own print
 * dialog, so the server needs no PDF tools. A summary for the donor's records, not a tax receipt.
 */
export default async function TaxPackPage({ params }: PageProps<"/account/tax-pack/[year]">) {
  const { year: raw } = await params;
  const year = parseTaxYear(raw);
  if (!year) notFound();
  const viewer = await requireViewer(`/account/tax-pack/${raw}`);
  const pack = await loadTaxPack(viewer.userId, year);

  return <TaxPackView year={year} email={viewer.email} pack={pack} current={taxYearFor(new Date())} />;
}
