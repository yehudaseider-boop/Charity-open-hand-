/**
 * The app's calls to our own server to give a once-off gift. No card details pass through the
 * app: the server returns the payment provider's own page, which the donor pays on.
 * No imports on purpose: the website's tests run this file too.
 */

export type Pricing = { amountCents: number; contributionCents: number; totalCents: number };
export type QuoteReply = { ok: true; quote: Pricing } | { ok: false; message: string };
export type CheckoutReply =
  | { ok: true; redirectUrl: string; charged?: undefined; reference: string; token: string }
  /** Paid with the saved card: no payment page. Ask for the outcome (the charge is only a first indication). */
  | { ok: true; charged: true; redirectUrl?: undefined; reference: string; token: string }
  /** `attemptMismatch`: this attempt id was already used with other details, so the app keeps the id (see give screen). */
  | { ok: false; message: string; fieldErrors?: Record<string, string>; quote?: Pricing; savedCardDeclined?: boolean; attemptMismatch?: boolean };

/** The card kept for next time: what is safe to show ("Visa ending 4242"), never the card itself. */
export type SavedCard = { brand: string | null; last4: string | null; expires: string | null };

export type DonorDetails = {
  donor_type: "individual";
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  wants_18a?: boolean;
  id_number?: string;
  tax_reference?: string;
  address_line1?: string;
  suburb?: string;
  city?: string;
  postal_code?: string;
  message?: string;
  /** Given in honour of, or in memory of, someone: the charity sees it, it is not on the s18A receipt. */
  dedication_kind?: "honour" | "memory";
  dedication_name?: string;
  /** The donor's own label for the gift, if any (private to them). */
  giving_label?: string;
  is_anonymous?: boolean;
  monthly?: boolean;
  monthly_authorised?: boolean;
  age_confirmed: boolean;
  popia_consent: boolean;
};

type Post = (url: string, body: unknown, token?: string | null) => Promise<{ status: number; json: unknown }>;

const NETWORK = "We couldn't reach Givezy. Please check your connection and try again.";

async function call<T extends { ok: boolean; message?: string }>(post: Post, url: string, body: unknown, token?: string | null): Promise<T> {
  try {
    const { json } = await post(url, body, token);
    if (json && typeof json === "object" && typeof (json as { ok?: unknown }).ok === "boolean") return json as T;
  } catch {
    // fall through
  }
  // `noReply`: the request may or may not have reached our server.
  return { ok: false, message: NETWORK, noReply: true } as unknown as T;
}

/** Our server's address. The sign-in token travels with some calls, so never over plain http. */
const api = (site: string, path: string) => {
  const base = site.replace(/\/+$/, "");
  if (!/^https:\/\//.test(base)) throw new Error("The site address must start with https://");
  return `${base}/api/app/${path}`;
};

export const fetchPost: Post = async (url, body, token) => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  // Signed in: tells our server who is giving (for "use my ID ending 1234"). Never sent elsewhere.
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => null) };
};

export function requestQuote(site: string, slug: string, giftCents: number, contributionCents: number, post: Post = fetchPost) {
  return call<QuoteReply>(post, api(site, "quote"), { slug, giftCents, contributionCents });
}

export function startPayment(
  site: string,
  args: {
    slug: string;
    giftCents: number;
    contributionCents: number;
    shownTotalCents: number;
    campaignId?: string;
    useSavedId?: boolean;
    /** Keep the card used for this once-off gift, for next time (signed in, saved cards switched on). */
    saveCard?: boolean;
    /** Pay with the saved card, no payment page (signed in, saved cards switched on). */
    useSavedCard?: boolean;
    /** One id per give attempt (see `newAttemptId`), so asking again never charges a saved card twice. */
    attemptId?: string;
    details: DonorDetails;
  },
  post: Post = fetchPost,
  token?: string | null,
) {
  return call<CheckoutReply>(post, api(site, "checkout"), args, token);
}

/** What the give screen needs to know before the donor fills anything in. */
export type ReadyReply =
  | { ok: true; accepting: boolean; receiptsAvailable: boolean; campaignOpen: boolean; minGiftCents: number; minContributionCents: number; savedIdLast4: string | null; suggestedCents: number[]; savedCardsOpen: boolean; savedCard: SavedCard | null }
  /** Giving in the app is switched off on the server: give on the website instead. */
  | { ok: false; closed: true }
  | { ok: false; closed?: false; message: string };

export async function checkReady(site: string, slug: string, campaignId: string | undefined, post: Post = fetchPost, token?: string | null): Promise<ReadyReply> {
  try {
    const { status, json } = await post(api(site, "ready"), { slug, campaignId }, token);
    if (status === 404) return { ok: false, closed: true };
    const j = json as Record<string, unknown> | null;
    if (j?.ok === true && typeof j.minGiftCents === "number" && typeof j.minContributionCents === "number") {
      const last4 = typeof j.savedIdLast4 === "string" && /^\d{4}$/.test(j.savedIdLast4) ? j.savedIdLast4 : null;
      return {
        ok: true,
        accepting: j.accepting === true,
        receiptsAvailable: j.receiptsAvailable === true,
        campaignOpen: j.campaignOpen === true,
        minGiftCents: j.minGiftCents,
        minContributionCents: j.minContributionCents,
        savedIdLast4: last4,
        suggestedCents: Array.isArray(j.suggestedCents) ? j.suggestedCents.filter((c): c is number => Number.isSafeInteger(c) && c > 0).slice(0, 3) : [],
        savedCardsOpen: j.savedCardsOpen === true,
        savedCard: cleanSavedCard(j.savedCard),
      };
    }
  } catch {
    // fall through
  }
  return { ok: false, message: NETWORK };
}

/** A saved card as the server describes it: brand, last four digits and expiry only; anything else is dropped. */
export function cleanSavedCard(v: unknown): SavedCard | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const last4 = typeof o.last4 === "string" && /^\d{4}$/.test(o.last4) ? o.last4 : null;
  if (!last4) return null;
  const brand = typeof o.brand === "string" && o.brand.trim() ? o.brand.trim().slice(0, 20) : null;
  const expires = typeof o.expires === "string" && /^\d{2}\/\d{4}$/.test(o.expires) ? o.expires : null;
  return { brand, last4, expires };
}

/** "Visa ending 4242", or "Card ending 4242" when the brand is not known. */
export function cardLabel(card: SavedCard): string {
  const b = (card.brand ?? "").trim();
  const name = b ? b.charAt(0).toUpperCase() + b.slice(1).toLowerCase() : "Card";
  return `${name} ending ${card.last4}`;
}

type Send = (method: "GET" | "DELETE", url: string, token: string) => Promise<{ status: number; json: unknown }>;

const fetchSend: Send = async (method, url, token) => {
  const res = await fetch(url, { method, headers: { authorization: `Bearer ${token}` } });
  return { status: res.status, json: await res.json().catch(() => null) };
};

export type SavedCardReply = { ok: true; card: SavedCard | null } | { ok: false; closed?: true; message: string };

/** The donor's saved card, for the Account screen. A 404 means saved cards are switched off on the server. */
export async function fetchSavedCard(site: string, token: string, send: Send = fetchSend): Promise<SavedCardReply> {
  try {
    const { status, json } = await send("GET", api(site, "saved-card"), token);
    if (status === 404) return { ok: false, closed: true, message: "Saved cards aren't switched on yet." };
    if ((json as { ok?: unknown } | null)?.ok === true) return { ok: true, card: cleanSavedCard((json as { card?: unknown }).card) };
  } catch {
    // fall through
  }
  return { ok: false, message: NETWORK };
}

/** Remove the saved card, at once. */
export async function removeSavedCard(site: string, token: string, send: Send = fetchSend): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const { json } = await send("DELETE", api(site, "saved-card"), token);
    if ((json as { ok?: unknown } | null)?.ok === true) return { ok: true };
  } catch {
    // fall through
  }
  return { ok: false, message: "We couldn't remove your card just now. Please try again." };
}

export type PaymentOutcome = "paid" | "failed" | "pending" | "review" | "not_found";

/** Whether a payment went through, asked after the payment page closes. Unknown or unreachable reads as "pending". */
export async function paymentStatus(site: string, reference: string, token: string, post: Post = fetchPost): Promise<PaymentOutcome> {
  const r = await call<{ ok: boolean; outcome?: string }>(post, api(site, "status"), { reference, token });
  const o = r.ok ? r.outcome : undefined;
  return o === "paid" || o === "failed" || o === "review" || o === "not_found" ? o : "pending";
}

/** What to tell the donor after the payment page closes, when the gift isn't confirmed as paid. */
export function afterPaymentMessage(outcome: Exclude<PaymentOutcome, "paid">): string {
  if (outcome === "failed") return "The payment didn't go through and nothing was charged. You can try again, or use another card.";
  if (outcome === "review") return "Something about this payment needs a person to look at it. Please don't pay again. We'll email you once it's sorted.";
  return "We haven't had word of this payment yet. If you didn't finish paying, nothing was charged and you can try again. If you did, please wait for your confirmation email before giving again.";
}

type PastGift = { charitySlug: string; cents: number; date: Date; label: string | null; monthly: boolean };

/**
 * One-tap amounts, taken only from the donor's own past gifts (we never suggest a figure of our
 * own): the last amount given to this charity first, then other recent amounts. At most three.
 */
export function quickAmounts(gifts: PastGift[], slug: string, max = 3): number[] {
  const recent = [...gifts].sort((a, b) => b.date.getTime() - a.date.getTime());
  const out: number[] = [];
  for (const g of [...recent.filter((g) => g.charitySlug === slug), ...recent]) {
    if (g.cents > 0 && !out.includes(g.cents)) out.push(g.cents);
    if (out.length === max) break;
  }
  return out;
}

/** The label of the donor's last gift to this charity, to start from. */
export function lastLabel(gifts: PastGift[], slug: string): string | null {
  const g = [...gifts].filter((x) => x.charitySlug === slug).sort((a, b) => b.date.getTime() - a.date.getTime())[0];
  return g?.label ?? null;
}

/** The donor's own details, kept on this phone only when they ask us to remember them. Never ID or tax numbers. */
export type RememberedDetails = { first_name: string; last_name: string; email: string; phone: string };

export function cleanRemembered(v: unknown): RememberedDetails | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string).slice(0, 200) : "");
  const r = { first_name: s("first_name"), last_name: s("last_name"), email: s("email"), phone: s("phone") };
  return r.first_name && r.last_name && r.email ? r : null;
}

/** Cents as the donor would type them in the amount box: 18000 is "180", 18050 is "180.50". Whole-number maths only. */
export function centsToInput(cents: number): string {
  const c = cents % 100;
  const whole = (cents - c) / 100;
  return c ? `${whole}.${String(c).padStart(2, "0")}` : String(whole);
}

/**
 * A random id (uuid v4) for one give attempt. Not a secret: the server only uses it to recognise the
 * same attempt asked twice, and checks it belongs to the same charity and email.
 */
export function newAttemptId(random: (n: number) => Uint8Array = defaultRandom): string {
  const b = random(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function defaultRandom(n: number): Uint8Array {
  const out = new Uint8Array(n);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) return c.getRandomValues(out);
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}
