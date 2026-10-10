/**
 * Money helpers. All amounts are integer cents in ZAR. No floats, ever.
 */

const PPM_SCALE = 1_000_000n;

/** Format cents as South African Rand: 125000 -> "R1 250.00". */
export function formatRand(cents: number | bigint): string {
  const value = BigInt(cents);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const rands = (abs / 100n).toString();
  const rem = (abs % 100n).toString().padStart(2, "0");
  const grouped = rands.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${negative ? "-" : ""}R${grouped}.${rem}`;
}

/**
 * Parse a Rand amount typed by a person into cents, without floating point.
 * Accepts "1250", "1 250", "1250.5", "R1 250,50" (comma or dot decimal).
 * Returns null if it is not a valid amount with at most 2 decimals.
 */
export function parseRandToCents(input: string): number | null {
  const cleaned = input.trim().replace(/^R/i, "").replace(/[\s ]/g, "").replace(",", ".");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(cents);
}

/**
 * Convert a percentage written as a decimal string to integer
 * parts-per-million: "3" -> 30000, "2.9" -> 29000, "15" -> 150000.
 * Up to 4 decimal places are allowed so it is always exact.
 */
export function percentToPpm(percent: string): number {
  const match = /^(\d+)(?:\.(\d{1,4}))?$/.exec(percent.trim());
  if (!match) throw new Error(`Invalid percentage: "${percent}"`);
  const ppm = BigInt(match[1]) * 10_000n + BigInt((match[2] ?? "").padEnd(4, "0"));
  if (ppm >= PPM_SCALE) throw new Error(`Percentage must be below 100: "${percent}"`);
  return Number(ppm);
}

/** Format ppm back to a percentage string for display: 30000 -> "3%". */
export function formatPpmAsPercent(ppm: number): string {
  const whole = Math.trunc(ppm / 10_000);
  const frac = (ppm % 10_000).toString().padStart(4, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}%` : `${whole}%`;
}
