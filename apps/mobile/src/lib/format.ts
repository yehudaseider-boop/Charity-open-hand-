import { formatRand } from "@shared/money";

/** Rand for display: whole Rand drop the cents ("R1 250", "R30"); anything with cents shows them ("R34.57"). */
export function rand(cents: number): string {
  return formatRand(cents);
}

/** dd/mm/yyyy */
export function ddmmyyyy(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** 24-hour time, as South Africans write it: "14:05". */
export function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Same as `rand` (kept for the summaries that used to always show cents). */
export function randExact(cents: number): string {
  return formatRand(cents);
}
