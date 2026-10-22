/**
 * The confirmation page must not hand the donor's private details to someone
 * who only knows the donation id (charity admins can see it).
 * Rendered to HTML, so we check what the server actually sends.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));

const ID = "3f9a2c71-0b1d-4e5f-9a8b-123456789abc";
const row = {
  id: ID,
  amount_cents: 18_000,
  contribution_cents: 2_345,
  total_charged_cents: 20_345,
  paid_at: "2026-10-11T10:00:00Z",
  wants_18a: true,
  donation_giving_kinds: { kind: null, label: "Maaser" },
  charities: { name_en: "Northcliff Meals Fund", slug: "northcliff-meals-fund", impact_en: "R180 feeds a family of four for a week." as string | null },
};

let outcome = "paid";
let adminReads = 0;
let confirmCalls = 0;
let overLimit = false;
let sessionRow: typeof row | null = null; // what row-level security lets the visitor read
let askedRef = "";
vi.mock("@/lib/donations/confirm", () => ({
  confirmPayment: async (ref: string) => ((askedRef = ref), confirmCalls++, outcome),
  // Without the donor's credential the page shows only what is saved, and never asks the provider.
  savedOutcome: async () => outcome,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }) }));
vi.mock("@/lib/rate-limit", () => ({ hitRateLimit: async () => overLimit, ipKeys: (ip: string) => [`ip:${ip}`] }));
vi.mock("@/lib/donations/confirmation-access", () => ({
  confirmationTokenMatches: async (_id: string, t?: string) => t === "good-credential",
}));
const builder = (get: () => unknown) => {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: get(), error: null }) };
  return { from: () => q };
};
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => builder(() => (adminReads++, row)) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => builder(() => sessionRow) }));
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: (p: { href: string; children: React.ReactNode }) => createElement("a", { href: p.href }, p.children) };
});
vi.mock("@/app/donate/return/keep-checking", () => ({ KeepChecking: () => null }));

async function page(search: Record<string, string | string[]>) {
  const { default: Page } = await import("@/app/donate/return/page");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ reference: ID, ...search }) } as any));
}
const privateBits = [/R23\.45/, /Contribution to Givezy/, /maaser/i, /Labelled/, /R180/, /GZ-3F9A2C71/];

beforeEach(() => {
  outcome = "paid";
  adminReads = 0;
  confirmCalls = 0;
  overLimit = false;
  sessionRow = null;
});

describe("confirmation page privacy", () => {
  it("a known donation id alone shows no private details", async () => {
    const html = await page({});
    for (const bit of privateBits) expect(html).not.toMatch(bit);
    expect(html).toContain("Your payment went through");
    expect(adminReads).toBe(0);
  });

  it("a wrong credential shows no private details and never reads with the service role", async () => {
    const html = await page({ t: "guess" });
    for (const bit of privateBits) expect(html).not.toMatch(bit);
    expect(adminReads).toBe(0);
  });

  it("a signed-in visitor who is not the donor (charity admin, other user) sees nothing private", async () => {
    sessionRow = null; // row-level security returns no row for them
    const html = await page({});
    for (const bit of privateBits) expect(html).not.toMatch(bit);
  });

  it("the donor, signed in, sees their confirmation", async () => {
    sessionRow = row;
    const html = await page({});
    expect(html).toContain("R23.45");
    expect(html).toContain("Labelled &quot;Maaser&quot;");
  });

  it("a guest with the credential from their payment link sees their confirmation", async () => {
    const html = await page({ t: "good-credential" });
    expect(html).toContain("Contribution to Givezy");
    expect(html).toContain("R23.45");
    expect(html).toContain("GZ-3F9A2C71");
  });

  it("the donor sees what their gift does, in the charity's words, and nothing when it has none", async () => {
    sessionRow = row;
    expect(await page({})).toContain("R180 feeds a family of four for a week.");
    sessionRow = { ...row, charities: { ...row.charities, impact_en: "  " } };
    expect(await page({})).not.toContain("What your gift does");
  });

  it("the impact line is never shown without the donor's details either", async () => {
    expect(await page({})).not.toContain("What your gift does");
  });

  it("the return-to-app button still shows without the credential", async () => {
    const html = await page({ from: "app" });
    expect(html).toContain("nedivlev://giving");
  });

  it("the payment provider adding its own reference to the address still finds the donation", async () => {
    // Paystack sends the donor to callback_url?trxref=<ref>&reference=<ref>, so our own key arrives twice.
    const html = await page({ reference: [ID, ID], trxref: ID, t: "good-credential" });
    expect(html).toContain("Thank you");
    expect(html).toContain("R23.45");
    expect(html).not.toContain("Donation not found");
  });

  it("a refunded donation says so instead of 'not found'", async () => {
    outcome = "reversed";
    expect(await page({})).toContain("This donation was refunded");
  });

  it("a failed or unknown payment shows no donation details either", async () => {
    outcome = "failed";
    expect(await page({})).not.toMatch(/maaser|R23\.45/i);
    outcome = "not_found";
    expect(await page({})).toContain("Donation not found");
  });
});

describe("checking with the payment provider", () => {
  it("a visitor over the limit gets 'still confirming' without the provider being asked", async () => {
    overLimit = true;
    const html = await page({ t: "good-credential" });
    expect(confirmCalls).toBe(0);
    expect(html).toContain("We&#x27;re confirming your payment");
  });

  it("under the limit, the donor's own visit checks the payment", async () => {
    await page({ t: "good-credential" });
    expect(confirmCalls).toBe(1);
  });

  it("without the credential the provider is never asked: a donation id alone shows the saved state only", async () => {
    outcome = "pending";
    const html = await page({});
    expect(confirmCalls).toBe(0);
    expect(html).toContain("We&#x27;re confirming your payment");
    outcome = "paid";
    expect(await page({})).toContain("Your payment went through");
    expect(confirmCalls).toBe(0);
  });

  it("the provider adding its own reference to our address still finds the donation", async () => {
    // Paystack sends the donor back to our address plus "&trxref=…&reference=…".
    const html = await page({ reference: [ID, ID], trxref: ID, t: ["good-credential"], from: ["app", "app"] });
    expect(askedRef).toBe(ID);
    expect(html).toContain("R23.45");
    expect(html).toContain("nedivlev://giving");
  });
});

describe("trying again", () => {
  it("a declined campaign gift tries again for the same campaign , giving choice and amount", async () => {
    outcome = "failed";
    sessionRow = { ...row, campaign_id: "c0ffee00-0000-4000-8000-000000000001" } as typeof row;
    const html = await page({});
    expect(html).toContain('href="/c/northcliff-meals-fund/donate?label=Maaser&amp;campaign=c0ffee00-0000-4000-8000-000000000001&amp;amount=18000"');
  });
});

