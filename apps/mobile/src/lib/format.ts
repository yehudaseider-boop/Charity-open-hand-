import { formatRand } from "@shared/money";

/**
 * Rand for display. Whole Rand amounts drop the cents ("R1 250", "R30"),
 * as in the design brief; anything with cents shows them ("R34.57").
 */
export function rand(cents: number): string {
  const full = formatRand(cents);
  return cents % 100 === 0 ? full.slice(0, -3) : full;
}

/** dd/mm/yyyy */
export function ddmmyyyy(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Rand with cents always shown, for money summaries: "R180.00", "R16.05". */
export function randExact(cents: number): string {
  return formatRand(cents);
}
