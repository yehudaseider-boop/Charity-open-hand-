import type { DemoData, DemoGift } from "./data";
import { saDay } from "./sample";

/**
 * The demo's deposits: its made-up gifts paid out the next working day, one deposit a day. No card fee is shown:
 * the payment provider's rates are not confirmed, and Givezy never makes one up. Pure, so it is tested on its own.
 * The last 30 days that had gifts.
 */
export type DemoDeposit = { id: string; paidOutOn: string; gifts: DemoGift[]; giftCents: number };
export function demoDeposits(data: DemoData): DemoDeposit[] {
  const byDay = new Map<string, DemoGift[]>();
  for (const g of data.gifts) {
    if (g.status !== "paid" || g.recordedMethod) continue;
    const day = saDay(g.paidAt);
    byDay.set(day, [...(byDay.get(day) ?? []), g]);
  }
  const next = (day: string) => {
    const d = new Date(`${day}T12:00:00Z`);
    do d.setUTCDate(d.getUTCDate() + 1);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
    return d.toISOString().slice(0, 10);
  };
  return [...byDay.entries()]
    .map(([day, gifts]) => ({ id: `demo-dep-${day}`, paidOutOn: next(day), gifts, giftCents: gifts.reduce((t, g) => t + g.amountCents, 0) }))
    .filter((d) => d.paidOutOn <= data.today)
    .sort((a, b) => b.paidOutOn.localeCompare(a.paidOutOn))
    .slice(0, 30);
}

/** The deposits as a CSV, for the demo's "Download all". */
export function demoDepositsCsv(data: DemoData): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [["Deposit date", "Gift date", "Donor", "Gift (R)", "Card fee"].map(q).join(",")];
  for (const d of demoDeposits(data)) {
    for (const g of d.gifts) rows.push([dmyDay(d.paidOutOn), dmyDay(saDay(g.paidAt)), data.donor(g.donorId)?.name ?? "", randText(g.amountCents), "To be confirmed"].map(q).join(","));
  }
  return rows.join("\r\n") + "\r\n";
}
export const dmyDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
/** Cents as Rand for a spreadsheet ("1250.00"), in whole numbers only. */
const randText = (cents: number) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
