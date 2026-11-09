import { demoData } from "../../../data";
import { demoDepositsCsv } from "../../../deposits";

/** The demo's "Download all": the made-up deposits as a CSV. */
export function GET() {
  return new Response(demoDepositsCsv(demoData(new Date())), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="givezy-demo-deposits.csv"', "cache-control": "no-store" },
  });
}
