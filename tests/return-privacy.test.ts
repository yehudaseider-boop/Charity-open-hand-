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
  donation_giving_kinds: { kind: "maaser" },
  charities: { name_en: "Northcliff Meals Fund", slug: "northcliff-meals-fund" },
};

let outcome = "paid";
let adminReads = 0;
let sessionRow: typeof row | null = null; // what row-level security lets the visitor read
vi.mock("@/lib/donations/confirm", () => ({ confirmPayment: async () => outcome }));
vi.mock("@/lib/donations/confirmation-access", () => ({
  confirmationTokenMatches: async (_id: string, t?: string) => t === "good-credential",
}));
const builder = (get: () => unknown) => {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: get(), error: null }) };
  return { from: () => q };
};
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => builder(() => (adminReads++, row)) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => builder(() => sessionRow) }));
vi.mock("next/link", () => ({ default: (p: { href: string; children: unknown }) => p.children }));
vi.mock("@/app/donate/return/keep-checking", () => ({ KeepChecking: () => null }));

async function page(search: Record<string, string>) {
  const { default: Page } = await import("@/app/donate/return/page");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ reference: ID, ...search }) } as any));
}
const privateBits = [/R23\.45/, /Contribution to Givezy/, /maaser/i, /Counted as/, /R180/, /NL-3F9A2C71/];

beforeEach(() => {
  outcome = "paid";
  adminReads = 0;
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
    expect(html).toContain("Counted as maaser");
  });

  it("a guest with the credential from their payment link sees their confirmation", async () => {
    const html = await page({ t: "good-credential" });
    expect(html).toContain("Contribution to Givezy");
    expect(html).toContain("R23.45");
    expect(html).toContain("NL-3F9A2C71");
  });

  it("the return-to-app button still shows without the credential", async () => {
    const html = await page({ from: "app" });
    expect(html).toContain("nedivlev://giving");
  });

  it("a failed or unknown payment shows no donation details either", async () => {
    outcome = "failed";
    expect(await page({})).not.toMatch(/maaser|R23\.45/i);
    outcome = "not_found";
    expect(await page({})).toContain("Donation not found");
  });
});
