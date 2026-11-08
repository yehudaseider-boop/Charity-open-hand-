/**
 * The website address, set with EXPO_PUBLIC_SITE_URL when we have a domain.
 * Payments happen on our website's payment page only. The app has no card fields
 * and never handles card details: it opens that page (in the phone's browser, or in
 * an in-app sheet when the in-app giving switch is on, see give-flow.ts).
 */
export const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL;

/**
 * The charity's donation page, with the donor's label (and campaign, if any) carried over, and the amount and
 * monthly choice when the donor chose them in the app (the website preselects them, 04/11/2026; a campaign gift is
 * once-off). Whole Rand go as `amount=250`, an amount with cents as `cents=` (the website reads both).
 */
export function donateUrl(site: string | undefined, slug: string, label: string | null, campaign?: string, chosen: { amountCents?: number | null; monthly?: boolean } = {}): string | null {
  if (!site || !site.startsWith("https://")) return null;
  const c = chosen.amountCents && Number.isSafeInteger(chosen.amountCents) && chosen.amountCents > 0 ? chosen.amountCents : null;
  const amount = c === null ? "" : c % 100 === 0 ? `amount=${c / 100}` : `cents=${c}`;
  const q = [label ? `label=${encodeURIComponent(label)}` : "", campaign ? `campaign=${encodeURIComponent(campaign)}` : "", amount, chosen.monthly && !campaign ? "monthly=1" : "", "from=app"].filter(Boolean).join("&");
  return `${site.replace(/\/+$/, "")}/c/${encodeURIComponent(slug)}/donate?${q}`;
}

/** Any page on the website (privacy, terms, account), or null until the site is live. */
export function siteUrl(site: string | undefined, path: string): string | null {
  if (!site || !site.startsWith("https://") || !path.startsWith("/")) return null;
  return `${site.replace(/\/+$/, "")}${path}`;
}
