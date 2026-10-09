/** The app's mapping from the donor's own database rows to what the Giving and Receipts screens show. */
import { describe, expect, it } from "vitest";
import { cleanCode, looksLikeEmail, toGifts, toReceipts, toRecurring, type DonationRow } from "../apps/mobile/src/lib/live-giving";

const charity = { slug: "meals", name_en: "Meals Fund" };
const row = (o: Partial<DonationRow>): DonationRow => ({
  id: "d1", paid_at: "2026-10-01T08:00:00Z", status: "paid", amount_cents: "18000", wants_18a: true, recurring_id: null, charities: charity, ...o,
});

describe("toGifts", () => {
  it("counts paid donations only, with the donor's own maaser/chomesh/tzedaka choice", () => {
    const gifts = toGifts(
      [row({ id: "a" }), row({ id: "b", status: "refunded" }), row({ id: "c", status: "pending", paid_at: null }), row({ id: "d", amount_cents: 5000, recurring_id: "r1", charities: [charity] })],
      [{ donation_id: "a", kind: "chomesh" }],
    );
    expect(gifts.map((g) => g.id).sort()).toEqual(["a", "d"]);
    const a = gifts.find((g) => g.id === "a")!;
    expect(a).toMatchObject({ cents: 18_000, kind: "chomesh", charityName: "Meals Fund", charitySlug: "meals", monthly: false, with18a: true });
    // No recorded choice (older donation) counts as general tzedaka, never as maaser.
    expect(gifts.find((g) => g.id === "d")).toMatchObject({ kind: "tzedaka", monthly: true, cents: 5_000 });
  });

  it("puts the newest first", () => {
    const gifts = toGifts([row({ id: "old", paid_at: "2026-01-01T08:00:00Z" }), row({ id: "new", paid_at: "2026-09-01T08:00:00Z" })], []);
    expect(gifts.map((g) => g.id)).toEqual(["new", "old"]);
  });
});

describe("toRecurring and toReceipts", () => {
  it("shows active and paused monthly donations, and issued receipts only", () => {
    const rec = toRecurring([
      { id: "r1", amount_cents: 50_000, status: "active", next_charge_at: "2026-11-01T00:00:00Z", charities: charity },
      { id: "r2", amount_cents: 1_000, status: "cancelled", next_charge_at: null, charities: charity },
      { id: "r3", amount_cents: 2_000, status: "paused", next_charge_at: null, charities: null },
    ]);
    expect(rec.map((r) => r.id)).toEqual(["r1", "r3"]);
    expect(rec[1].nextDate).toBeNull();
    const rcp = toReceipts([
      { id: "x", tax_year: 2026, amount_cents: "100000", issued_at: "2026-03-09T00:00:00Z", status: "issued", reference: "NMF-2026-0001", charity_name: "Meals NPC" },
      { id: "y", tax_year: 2026, amount_cents: "5000", issued_at: "2026-03-09T00:00:00Z", status: "void", reference: "NMF-2026-0002", charity_name: "Meals NPC" },
    ]);
    expect(rcp).toHaveLength(1);
    expect(rcp[0]).toMatchObject({ cents: 100_000, number: "NMF-2026-0001", charityName: "Meals NPC" });
  });
});

describe("sign-in helpers", () => {
  it("checks the email and the 6-digit code", () => {
    expect(looksLikeEmail(" sarah@example.co.za ")).toBe(true);
    expect(looksLikeEmail("sarah@")).toBe(false);
    expect(cleanCode("123 456")).toBe("123456");
    expect(cleanCode("12345")).toBeNull();
    expect(cleanCode("12a456")).toBeNull();
  });
});
