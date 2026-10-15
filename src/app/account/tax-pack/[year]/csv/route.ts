import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/auth";
import { centsToPlain, toCsv } from "@/lib/csv";
import { formatDate } from "@/lib/dates";
import { parseTaxYear } from "@/lib/tax-pack/build";
import { loadTaxPack } from "@/lib/tax-pack/load";

const HEADER = ["Date", "Charity", "Amount (R)", "s18A receipt asked for", "On an issued s18A receipt", "Counted as", "Monthly", "Dedication"];
const kindLabel = { maaser: "Maaser", chomesh: "Chomesh", tzedaka: "General tzedaka" } as const;

/** The signed-in donor's tax pack as a spreadsheet: one row per paid donation in the tax year. */
export async function GET(_request: Request, ctx: RouteContext<"/account/tax-pack/[year]/csv">) {
  const { year: raw } = await ctx.params;
  const year = parseTaxYear(raw);
  if (!year) return new NextResponse("Not found", { status: 404 });
  // Signed in and agreed to the current Terms, as for the page (otherwise it sends them to sign in).
  const viewer = await requireViewer(`/account/tax-pack/${year}`);

  const pack = await loadTaxPack(viewer.userId, year);
  const rows = (pack?.lines ?? []).map((l) => [formatDate(l.paidAt), l.charityName, centsToPlain(l.cents), l.s18a ? "Yes" : "No", l.receipted ? "Yes" : "No", kindLabel[l.kind], l.monthly ? "Yes" : "No", l.dedication ?? ""]);
  return new NextResponse(toCsv(HEADER, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="givezy-tax-pack-${year}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
