/**
 * The Payments page renders from real-shaped rows. The database is a stand-in.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));

const NOW = Date.now();
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
let tables: Record<string, unknown[]>;

vi.mock("@/lib/auth", () => ({ requirePlatformAdmin: async () => ({ userId: "admin1" }) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is", "gte", "order", "limit"]) q[m] = () => q;
      q.then = (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: tables[table] ?? [], error: null });
      return q;
    },
  }),
}));

async function page() {
  const { default: Page } = await import("@/app/admin/payments/page");
  return renderToStaticMarkup(await Page());
}

beforeEach(() => {
  tables = {};
});

describe("the Payments page", () => {
  it("says nothing is stuck when nothing is", async () => {
    const html = await page();
    expect(html).toContain("Nothing is stuck");
    expect(html).toContain("No confirmed payments in the last 30 days.");
  });

  it("shows stuck payments, unfinished gateway messages, held payments, failed monthly donations and the totals", async () => {
    tables = {
      donations: [
        { id: "3f9a2c71-0b1d-4e5f-9a8b-123456789abc", created_at: ago(90), total_charged_cents: "18000", charity_id: "a", amount_cents: "18000", contribution_cents: "2000", charities: { name_en: "Meals Fund" } },
      ],
      gateway_events: [{ id: "e1", gateway: "paystack", event_type: "payment_succeeded", received_at: ago(45), payload: { data: { reference: "3f9a2c71-0b1d-4e5f-9a8b-123456789abc", customer: { email: "secret@example.co.za" } } } }],
      audit_log: [{ id: 1, action: "donation.amount_mismatch", created_at: ago(500), entity_id: "x" }],
      recurring_donations: [
        { id: "r1", status: "failed", next_charge_at: null, last_attempt_at: ago(30), amount_cents: 18000, contribution_cents: 2000, charities: [{ name_en: "Meals Fund" }] },
        { id: "r2", status: "active", next_charge_at: ago(60 * 30), last_attempt_at: null, amount_cents: 100, contribution_cents: 0, charities: { name_en: "Shul Fund" } },
      ],
    };
    const html = await page();
    expect(html).toContain("NL-3F9A2C71");
    expect(html).toContain("Payments still pending");
    expect(html).toContain("payment_succeeded");
    expect(html).toContain("Amount did not match");
    expect(html).toContain("Stopped: Meals Fund");
    expect(html).toContain("R200 a month");
    expect(html).toContain("more than 24 hours late");
    expect(html).toContain("Meals Fund · 1 payment");
    expect(html).toContain("R180 + R20");
    expect(html).toMatch(/things need a look/);
  });

  it("never prints the customer details held in a gateway record", async () => {
    tables = { gateway_events: [{ id: "e1", gateway: "paystack", event_type: "payment_succeeded", received_at: ago(45), payload: { data: { reference: "3f9a2c71-0b1d-4e5f-9a8b-123456789abc", customer: { email: "secret@example.co.za" } } } }] };
    expect(await page()).not.toContain("secret@example.co.za");
  });
});
