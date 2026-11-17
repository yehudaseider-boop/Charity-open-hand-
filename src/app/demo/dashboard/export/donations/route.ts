import { toCsv, centsToPlain } from "@/lib/csv";
import { formatDate } from "@/lib/dates";
import { giftSourceLabel } from "@/lib/donations/source";
import { cameInBy } from "@/lib/charity/recorded-gifts";
import { demoData } from "../../data";

/**
 * The demo's "Download paid donations (CSV)" on the Overview (17/11/2026: it opened the Overview again). The made-up
 * paid gifts, in the same columns a charity's own download starts with, so a visitor sees what their bookkeeper gets.
 * References match the demo's donation pages (GZ-000296).
 */
export function GET() {
  const data = demoData(new Date());
  const campaigns = new Map(data.campaigns.map((c) => [c.id, c.title]));
  const HEADER = ["Date", "Reference", "Donor", "Email", "Amount (R)", "s18A receipt requested", "How it came in", "Campaign", "Came from"];
  const rows = data.gifts
    .filter((g) => g.status === "paid")
    .map((g) => {
      const d = data.donor(g.donorId)!;
      return [formatDate(g.paidAt), `GZ-${g.id.replace("demo-g", "").padStart(6, "0")}`, d.name, d.email, centsToPlain(g.amountCents), g.wants18a ? "Yes" : "No", cameInBy(g.recordedMethod), g.campaignId ? campaigns.get(g.campaignId) ?? "" : "", giftSourceLabel(g.source)];
    });
  return new Response(toCsv(HEADER, rows), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="givezy-demo-donations.csv"', "cache-control": "no-store" },
  });
}
