/**
 * The app's calls to our own server to give a once-off gift. No card details pass through the
 * app: the server returns the payment provider's own page, which the donor pays on.
 * No imports on purpose: the website's tests run this file too.
 */

export type Pricing = { amountCents: number; contributionCents: number; totalCents: number };
export type QuoteReply = { ok: true; quote: Pricing } | { ok: false; message: string };
export type CheckoutReply =
  | { ok: true; redirectUrl: string; reference: string; token: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string>; quote?: Pricing };

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
  giving_kind: "maaser" | "chomesh" | "tzedaka";
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
  return { ok: false, message: NETWORK } as T;
}

const api = (site: string, path: string) => `${site.replace(/\/+$/, "")}/api/app/${path}`;

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
  args: { slug: string; giftCents: number; contributionCents: number; shownTotalCents: number; campaignId?: string; useSavedId?: boolean; details: DonorDetails },
  post: Post = fetchPost,
  token?: string | null,
) {
  return call<CheckoutReply>(post, api(site, "checkout"), args, token);
}

/** What the give screen needs to know before the donor fills anything in. */
export type ReadyReply =
  | { ok: true; accepting: boolean; receiptsAvailable: boolean; campaignOpen: boolean; minGiftCents: number; minContributionCents: number; savedIdLast4: string | null }
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
      return { ok: true, accepting: j.accepting === true, receiptsAvailable: j.receiptsAvailable === true, campaignOpen: j.campaignOpen === true, minGiftCents: j.minGiftCents, minContributionCents: j.minContributionCents, savedIdLast4: last4 };
    }
  } catch {
    // fall through
  }
  return { ok: false, message: NETWORK };
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

type PastGift = { charitySlug: string; cents: number; date: Date; kind: string; monthly: boolean };

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

/** What the donor's last gift to this charity counted as, to start from. */
export function lastKind(gifts: PastGift[], slug: string): "maaser" | "chomesh" | "tzedaka" | null {
  const g = [...gifts].filter((x) => x.charitySlug === slug).sort((a, b) => b.date.getTime() - a.date.getTime())[0];
  return g && (g.kind === "maaser" || g.kind === "chomesh" || g.kind === "tzedaka") ? g.kind : null;
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
