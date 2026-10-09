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

import { cleanIncome, dateToIso, incomeBetween, owedFromIncome, parseDdMmYyyy, toElsewhere } from "../apps/mobile/src/lib/ledger";

describe("typed dates", () => {
  const today = "2026-10-09";
  it("accepts real dates up to today, in dd/mm/yyyy", () => {
    expect(parseDdMmYyyy("09/10/2026", today)).toBe("2026-10-09");
    expect(parseDdMmYyyy("1/2/2026", today)).toBe("2026-02-01");
    expect(parseDdMmYyyy(" 31-12-2025 ", today)).toBe("2025-12-31");
  });
  it("refuses impossible, future and badly formed dates", () => {
    for (const bad of ["31/02/2026", "10/10/2026", "09/10/2027", "2026-10-09", "9/10/26", "00/10/2026", "29/02/2027", "01/01/1999", ""]) {
      expect(parseDdMmYyyy(bad, today)).toBeNull();
    }
    expect(parseDdMmYyyy("29/02/2028", "2028-12-31")).toBe("2028-02-29");
  });
  it("writes a local date without shifting the day", () => {
    expect(dateToIso(new Date(2026, 0, 1))).toBe("2026-01-01");
  });
});

describe("income and maaser owed", () => {
  it("drops damaged entries and sorts newest first", () => {
    const out = cleanIncome([
      { id: "a", date: "2026-09-01", cents: 2_500_000, note: "Sept" },
      { id: "b", date: "2026-10-01", cents: 2_500_000, note: "Oct" },
      { id: "c", date: "bad", cents: 1, note: "" },
      { id: "d", date: "2026-10-02", cents: 1.5, note: "" },
      { id: "e", date: "2026-10-02", cents: -5, note: "" },
      null,
    ]);
    expect(out.map((e) => e.id)).toEqual(["b", "a"]);
    expect(cleanIncome("nonsense")).toEqual([]);
  });

  it("adds up income in a period, inclusive of both ends", () => {
    const entries = cleanIncome([
      { id: "1", date: "2026-10-01", cents: 2_500_000, note: "" },
      { id: "2", date: "2026-10-31", cents: 100_000, note: "" },
      { id: "3", date: "2026-11-01", cents: 999, note: "" },
      { id: "4", date: "2026-09-30", cents: 999, note: "" },
    ]);
    expect(incomeBetween(entries, "2026-10-01", "2026-10-31")).toBe(2_600_000);
  });

  it("works out a tenth for maaser and a further tenth for chomesh, to the cent", () => {
    expect(owedFromIncome(2_500_000, false)).toEqual({ maaserCents: 250_000, chomeshCents: 0 });
    expect(owedFromIncome(2_500_000, true)).toEqual({ maaserCents: 250_000, chomeshCents: 250_000 });
    expect(owedFromIncome(12_345, true)).toEqual({ maaserCents: 1_235, chomeshCents: 1_235 }); // 1 234.5 rounds half up
    expect(owedFromIncome(0, true)).toEqual({ maaserCents: 0, chomeshCents: 0 });
  });
});

describe("giving made elsewhere", () => {
  it("keeps the donor's own choice and ignores anything with an unknown one", () => {
    const out = toElsewhere([
      { id: "a", entry_date: "2026-06-10", recipient_text: "Shul appeal (cash)", amount_cents: "72000", kind: "maaser" },
      { id: "b", entry_date: "2026-07-01", recipient_text: "Other", amount_cents: 5000, kind: "gift" },
      { id: "c", entry_date: "2026-08-01", recipient_text: "Pushka", amount_cents: 1800, kind: "tzedaka" },
    ]);
    expect(out.map((e) => e.id)).toEqual(["c", "a"]);
    expect(out[1]).toMatchObject({ cents: 72_000, kind: "maaser", recipient: "Shul appeal (cash)" });
    expect(out[1].date.getFullYear()).toBe(2026);
    expect(out[1].date.getDate()).toBe(10);
  });
});

describe("monthly donations waiting for the payment provider", () => {
  it("shows a cancelled one only until the provider has stopped it", () => {
    const rows = toRecurring([
      { id: "r1", amount_cents: 100, status: "cancelled", needs_gateway_sync: true, next_charge_at: null, charities: charity },
      { id: "r2", amount_cents: 100, status: "cancelled", needs_gateway_sync: false, next_charge_at: null, charities: charity },
      { id: "r3", amount_cents: 100, status: "paused", needs_gateway_sync: true, next_charge_at: null, charities: charity },
    ]);
    expect(rows.map((r) => [r.id, r.syncing])).toEqual([["r1", true], ["r3", true]]);
  });
});
