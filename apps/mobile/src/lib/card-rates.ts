import { cleanRates, fetchWithTimeout } from "./pay-api";
import type { RatesAnswer } from "./live-giving";

/**
 * The payment provider's rates, asked of our server (18/11/2026), so a monthly donation whose donor covers the card
 * charge shows what each month really collects, worked out as the website does. Only asked when one does. No site
 * address, no connection, an older server or an odd answer: not known, and the app says "plus the card charge"
 * rather than guess a figure.
 */
export async function fetchCardChargeRates(
  site: string | undefined,
  get: (url: string) => Promise<{ status: number; json: unknown }> = (url) => fetchWithTimeout(url, { method: "GET" }, 10_000),
): Promise<RatesAnswer> {
  const base = (site ?? "").replace(/\/+$/, "");
  if (!/^https:\/\//.test(base)) return { known: false };
  try {
    const { status, json } = await get(`${base}/api/app/card-rates`);
    const j = json as Record<string, unknown> | null;
    if (status !== 200 || j?.ok !== true || !("cardChargeRates" in j)) return { known: false };
    // Null from the server: the rates aren't filled in, or Givezy pays the charge itself. Nothing is added.
    if (j.cardChargeRates === null) return { known: true, rates: null };
    const rates = cleanRates(j.cardChargeRates);
    return rates ? { known: true, rates } : { known: false };
  } catch {
    return { known: false };
  }
}
