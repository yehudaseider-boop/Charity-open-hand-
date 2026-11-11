/**
 * Nudging a gift amount up or down, as a dial would (11/11/2026). Dependency-free, so the app and its tests share it.
 *
 * Givezy never suggests a figure of its own: stepping starts only from an amount the donor already has (typed, or
 * one of their own recent amounts), and it never goes below the smallest or above the largest gift.
 */

/** How big a step is at this amount: R10 under R100, R50 under R500, R100 under R2 000, R500 above. */
export function stepSize(cents: number): number {
  if (cents < 10_000) return 1_000;
  if (cents < 50_000) return 5_000;
  if (cents < 200_000) return 10_000;
  return 50_000;
}

/**
 * The next amount up (`1`) or down (`-1`) on the dial, in cents, or null when there is nowhere to go:
 * no amount yet (we never invent one), already at the smallest or largest gift, or an amount that isn't a number.
 */
export function stepAmount(cents: number | null, dir: 1 | -1, min: number, max: number | null): number | null {
  if (cents === null || !Number.isFinite(cents) || cents <= 0) return null;
  const c = Math.round(cents);
  const floor = Math.max(min, 1);
  // Typed below the smallest gift, up goes to the smallest; typed above the largest, down goes to the largest.
  if (dir === 1 && c < floor) return max === null || floor <= max ? floor : null;
  if (dir === -1 && max !== null && c > max) return max;
  let next: number;
  if (dir === 1) {
    const s = stepSize(c);
    next = (Math.floor(c / s) + 1) * s;
  } else {
    // Down from exactly R100 steps by R10, not R50: the step size is the one for the amounts just below.
    const s = stepSize(c - 1);
    next = (Math.ceil(c / s) - 1) * s;
  }
  if (next < floor) return null;
  if (max !== null && next > max) return null;
  return next;
}

type PastGift = { charitySlug: string; date: Date; cents: number; monthly?: boolean };

/** The donor's most recent gift to this charity, for "Same as last time", or null if they haven't given before. */
export function lastGiftTo(gifts: PastGift[], slug: string): { cents: number; monthly: boolean } | null {
  const g = gifts.filter((x) => x.charitySlug === slug && x.cents > 0).sort((a, b) => b.date.getTime() - a.date.getTime())[0];
  return g ? { cents: g.cents, monthly: Boolean(g.monthly) } : null;
}

/** An amount passed in a link (`?amount=25000`, in cents): digits only and sensible, else ignored. */
export function amountFromParam(v: unknown): number | null {
  const s = Array.isArray(v) ? v[0] : v;
  if (typeof s !== "string" || !/^[0-9]{1,9}$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n : null;
}

/**
 * A link from outside the app (a web page, a message) must not choose the amount or make a gift monthly: only the
 * app's own "Make it monthly?" passes those, and it does so inside the app, not through a link (review of 11/11/2026).
 * Takes the path a system link opens and returns it without `amount` and `monthly` on give screens.
 */
export function stripGivePrefill(path: string): string {
  const q = path.indexOf("?");
  if (q === -1 || !/(^|\/)give\//.test(path.slice(0, q))) return path;
  const params = new URLSearchParams(path.slice(q + 1));
  if (!params.has("amount") && !params.has("monthly")) return path;
  params.delete("amount");
  params.delete("monthly");
  const rest = params.toString();
  return rest ? `${path.slice(0, q)}?${rest}` : path.slice(0, q);
}
