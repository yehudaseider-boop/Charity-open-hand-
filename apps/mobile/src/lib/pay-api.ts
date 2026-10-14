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
