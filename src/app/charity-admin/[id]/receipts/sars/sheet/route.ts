import { NextResponse, type NextRequest } from "next/server";
import { audit, xlsxResponse } from "@/lib/charity/export";
import { loadIt3dCharity } from "@/lib/receipts/it3d-store";
import { it3dPeriodRange } from "@/lib/receipts/it3d";
import { it3dCaptureSheet } from "@/lib/receipts/it3d-sheet";
import { authoriseIt3d, prepareIt3d, readChoice } from "@/lib/receipts/it3d-request";
import { taxYearName } from "@/lib/dates";

const say = (message: string, status: number) =>
  new NextResponse(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

/** The eFiling capture sheet (.xlsx): what to type into the IT3-01 form. Downloads even with problems, which it marks. */
export async function GET(req: NextRequest, ctx: RouteContext<"/charity-admin/[id]/receipts/sars/sheet">) {
  const { id } = await ctx.params;
  const who = await authoriseIt3d(id);
  if ("status" in who) return say(who.message, who.status);
  const choice = readChoice(req.nextUrl.searchParams.get("year"), req.nextUrl.searchParams.get("period"));
  if (!choice) return say("Choose a tax year and a period, then try again. Nothing was downloaded.", 400);
  const [result, charity] = await Promise.all([prepareIt3d(id, choice), loadIt3dCharity(id)]);
  const range = it3dPeriodRange(choice.taxYear, choice.period);
  const dates = `${range.start.split("-").reverse().join("/")} to ${range.end.split("-").reverse().join("/")}`;
  const period = `${choice.period === "first_half" ? "the first six months of the" : "the full"} ${taxYearName(choice.taxYear)} tax year (${dates})`;
  await audit({
    actorUserId: who.userId,
    action: "charity.it3d_capture_sheet_downloaded",
    entityType: "charity",
    entityId: id,
    details: { taxYear: choice.taxYear, period: choice.period, problems: result.problems.length, ...result.totals },
  });
  const file = it3dCaptureSheet(result, { charityName: charity.tradingName, period });
  return xlsxResponse(file, `it3d-capture-sheet-${taxYearName(choice.taxYear).replace("/", "-")}-${choice.period === "first_half" ? "first-six-months" : "full-year"}.xlsx`);
}
