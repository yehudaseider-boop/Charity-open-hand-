/**
 * The app's calls to our own server to give a once-off gift. No card details pass through the
 * app: the server returns the payment provider's own page, which the donor pays on.
 * No imports on purpose: the website's tests run this file too.
 */

export type Pricing = { amountCents: number; contributionCents: number; totalCents: number };
export type QuoteReply = { ok: true; quote: Pricing } | { ok: false; message: string };
export type CheckoutReply =
  | { ok: true; redirectUrl: string }
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

type Post = (url: string, body: unknown) => Promise<{ status: number; json: unknown }>;

const NETWORK = "We couldn't reach Givezy. Please check your connection and try again.";

async function call<T extends { ok: boolean; message?: string }>(post: Post, url: string, body: unknown): Promise<T> {
  try {
    const { json } = await post(url, body);
    if (json && typeof json === "object" && typeof (json as { ok?: unknown }).ok === "boolean") return json as T;
  } catch {
    // fall through
  }
  return { ok: false, message: NETWORK } as T;
}

const api = (site: string, path: string) => `${site.replace(/\/+$/, "")}/api/app/${path}`;

export const fetchPost: Post = async (url, body) => {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => null) };
};

export function requestQuote(site: string, slug: string, giftCents: number, contributionCents: number, post: Post = fetchPost) {
  return call<QuoteReply>(post, api(site, "quote"), { slug, giftCents, contributionCents });
}

export function startPayment(
  site: string,
  args: { slug: string; giftCents: number; contributionCents: number; shownTotalCents: number; details: DonorDetails },
  post: Post = fetchPost,
) {
  return call<CheckoutReply>(post, api(site, "checkout"), args);
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
