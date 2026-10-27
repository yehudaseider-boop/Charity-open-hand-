import { NextResponse } from "next/server";
import { annualReport, reportYears } from "@/lib/charity/annual-report";
import { loadReportData } from "@/lib/charity/dashboard-queries";
import { audit, authoriseExport, csvResponse } from "@/lib/charity/export";
import { centsToPlain, toCsv } from "@/lib/csv";
import { taxYearName } from "@/lib/dates";

/** The annual report's figures for one tax year, as a CSV (no donor details). */
export async function GET(request: Request, ctx: RouteContext<"/charity-admin/[id]/export/report">) {
  const { id } = await ctx.params;
  const who = await authoriseExport(id);
  if (who instanceof NextResponse) return who;
  let data;
  try {
    data = await loadReportData(id);
  } catch {
    return new NextResponse("Could not read the donations.", { status: 500 });
  }
  const now = new Date();
  const years = reportYears(data.gifts, now);
  const asked = Number(new URL(request.url).searchParams.get("year"));
  const year = years.includes(asked) ? asked : years[0];
  const r = annualReport(data.gifts, year, data.campaignTitles, data.onIssued, now);
  await audit({ actorUserId: who.userId, action: "charity.report_exported", entityType: "charity", entityId: id, details: { taxYear: year } });
  const rows: (string | number)[][] = [
    ["Raised (R)", centsToPlain(r.totalCents)],
    ["Donations", r.donationCount],
    ["Average donation (R)", centsToPlain(r.averageCents)],
    ["Donors", r.donors],
    ["New donors", r.newDonors],
    ["Donors who gave before", r.returningDonors],
    ["Monthly donations (R)", centsToPlain(r.monthlyCents)],
    ["Once-off donations (R)", centsToPlain(r.onceOffCents)],
    ["Refunded or reversed (R)", centsToPlain(r.refunded.cents)],
    ["Donors who asked for an s18A receipt", r.s18a.donors],
    ["Of them, with a receipt", r.s18a.receipted],
    ...r.months.map((m) => [`${m.label} (R)`, centsToPlain(m.cents)]),
    ...r.campaigns.map((c) => [`Campaign: ${c.title} (R)`, centsToPlain(c.cents)]),
  ];
  return csvResponse(toCsv([`${taxYearName(year)} tax year${r.running ? " so far" : ""}`, "Value"], rows), `annual-report-${year}.csv`);
}
