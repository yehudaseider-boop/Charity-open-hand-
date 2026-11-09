import { TEMPLATE_HEADINGS } from "@/lib/charity/recorded-gifts";
import { toCsv } from "@/lib/csv";

/**
 * The demo's import template: our headings and three made-up gifts from the last few days, so a visitor can import
 * it straight back and watch it work. No s18A rows: those need an SA ID number, and the demo never makes one up.
 */
export function GET() {
  const day = (back: number) => {
    const d = new Date(Date.now() + 2 * 3_600_000 - back * 86_400_000);
    return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
  };
  const row = (date: string, amount: string, method: string, first: string, last: string, email: string, ref: string) =>
    [date, amount, method, "individual", first, last, "", "", email, "", "no", "", "", "", "", "", "", "", "", ref];
  const rows = [
    row(day(2), "500.00", "EFT", "Sarah", "Example", "sarah.example@example.test", "DEMO-EFT-1"),
    row(day(3), "250.00", "Cash", "Thabo", "Sample", "thabo.sample@example.test", "DEMO-CASH-1"),
    row(day(5), "1250.00", "EFT", "Priya", "Demo", "priya.demo@example.test", "DEMO-EFT-2"),
  ];
  return new Response(toCsv(TEMPLATE_HEADINGS, rows), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="givezy-demo-gifts.csv"', "cache-control": "no-store" },
  });
}
