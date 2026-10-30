/** The app's mapping from the donor's own database rows to what the Giving and Receipts screens show. */
import { describe, expect, it } from "vitest";
import { cleanCode, fromCache, looksLikeEmail, newArrivals, seenFrom, toCache, toGifts, toReceipts, toRecurring, type DonationRow } from "../apps/mobile/src/lib/live-giving";

const charity = { slug: "meals", name_en: "Meals Fund" };
const row = (o: Partial<DonationRow>): DonationRow => ({
  id: "d1", paid_at: "2026-10-01T08:00:00Z", status: "paid", amount_cents: "18000", wants_18a: true, recurring_id: null, charities: charity, ...o,
});

describe("toGifts", () => {
  it("counts paid donations only, with the donor's own label (old fixed choices read as labels)", () => {
    const gifts = toGifts(
      [row({ id: "a" }), row({ id: "b", status: "refunded" }), row({ id: "c", status: "pending", paid_at: null }), row({ id: "d", amount_cents: 5000, recurring_id: "r1", charities: [charity] }), row({ id: "e" })],
      [{ donation_id: "a", kind: "chomesh", label: null }, { donation_id: "e", kind: null, label: "Work giving" }],
    );
    expect(gifts.map((g) => g.id).sort()).toEqual(["a", "d", "e"]);
    expect(gifts.find((g) => g.id === "a")).toMatchObject({ cents: 18_000, label: "Chomesh", charityName: "Meals Fund", charitySlug: "meals", monthly: false, with18a: true });
    expect(gifts.find((g) => g.id === "e")?.label).toBe("Work giving");
    // No label: none is made up.
    expect(gifts.find((g) => g.id === "d")).toMatchObject({ label: null, monthly: true, cents: 5_000 });
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

import { cleanIncome, dateToIso, incomeBetween, parseDdMmYyyy, toElsewhere } from "../apps/mobile/src/lib/ledger";

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

describe("income", () => {
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

});

describe("giving made elsewhere", () => {
  it("keeps the donor's own label; old fixed choices read as labels, anything else as none", () => {
    const out = toElsewhere([
      { id: "a", entry_date: "2026-06-10", recipient_text: "School fun run (cash)", amount_cents: "72000", kind: "maaser" },
      { id: "b", entry_date: "2026-07-01", recipient_text: "Other", amount_cents: 5000, kind: "gift" },
      { id: "c", entry_date: "2026-08-01", recipient_text: "Collection box", amount_cents: 1800, label: "Family" },
    ]);
    expect(out.map((e) => [e.id, e.label])).toEqual([["c", "Family"], ["b", null], ["a", "Maaser"]]);
    expect(out[2]).toMatchObject({ cents: 72_000, recipient: "School fun run (cash)" });
    expect(out[2].date.getFullYear()).toBe(2026);
    expect(out[2].date.getDate()).toBe(10);
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

import { glossary } from "../src/lib/glossary";

describe("glossary", () => {
  it("explains every term in plain sentences, with no guessed tax figures", () => {
    for (const [key, entry] of Object.entries(glossary)) {
      expect(entry.title, key).toBeTruthy();
      expect(entry.body.length, key).toBeGreaterThan(0);
      for (const p of entry.body) {
        expect(p.trim().endsWith("."), `${key}: ${p}`).toBe(true);
        expect(p, key).not.toMatch(/\d+%/); // limits come from SARS, never typed in here
        expect(p, key).not.toMatch(/—/);
      }
    }
  });
});


describe("thanking for new donations", () => {
  const g = (id: string, day: number) => toGifts([row({ id, paid_at: `2026-10-${String(day).padStart(2, "0")}T08:00:00Z` })], [])[0];

  it("celebrates nothing the first time, so history isn't treated as new", () => {
    expect(newArrivals([g("a", 1), g("b", 2)], null)).toEqual([]);
  });

  it("finds only donations that arrived since last time, oldest first", () => {
    const seen = seenFrom([g("a", 1), g("b", 2)]);
    expect(newArrivals([g("a", 1), g("b", 2), g("d", 5), g("c", 4)], seen).map((x) => x.id)).toEqual(["c", "d"]);
    expect(newArrivals([g("a", 1), g("b", 2)], seen)).toEqual([]);
  });

  it("remembers only the newest 200, without re-thanking older ones", () => {
    const many = Array.from({ length: 250 }, (_, i) => g(`x${i}`, 1 + (i % 28)));
    const seen = seenFrom(many);
    expect(seen.ids).toHaveLength(200);
    expect(newArrivals(many, seen)).toEqual([]);
  });

  it("carries the charity's own thank-you note", () => {
    const [gift] = toGifts([row({ charities: { slug: "m", name_en: "Meals Fund", thank_you_en: "Thank you from all of us." } })], []);
    expect(gift.thankYou).toBe("Thank you from all of us.");
  });
});

describe("giving saved on the phone for offline use", () => {
  const live = {
    gifts: [{ id: "a", date: new Date("2026-09-01T08:00:00Z"), charitySlug: "meals", charityName: "Meals Fund", cents: 18000, monthly: false, with18a: true, label: "Work giving" as string | null, thankYou: "Thank you" }],
    recurring: [{ id: "r", charitySlug: "meals", charityName: "Meals Fund", cents: 5000, nextDate: null, status: "paused" as const, syncing: true }],
    receipts: [{ id: "x", taxYear: 2027, charityName: "Meals Fund", number: "MF-1", cents: 18000, issued: new Date("2026-09-02T08:00:00Z") }],
    elsewhere: [{ id: "e", date: new Date("2026-08-01T00:00:00Z"), recipient: "Collection box", cents: 3600, label: null as string | null }],
    loadedAt: new Date("2026-09-03T10:15:00Z"),
  };

  it("comes back exactly as it went in, dates included", () => {
    // Thank-you notes aren't kept in the saved copy (they're only shown for new donations).
    const gift: Partial<(typeof live.gifts)[0]> = { ...live.gifts[0] };
    delete gift.thankYou;
    expect(fromCache(toCache(live))).toEqual({ ...live, gifts: [gift] });
  });

  it("treats anything missing, old or tampered with as no cache", () => {
    expect(fromCache(null)).toBeNull();
    expect(fromCache("not json")).toBeNull();
    expect(fromCache(JSON.stringify({ ...JSON.parse(toCache(live)), v: 0 }))).toBeNull();
    const bad = JSON.parse(toCache(live));
    bad.gifts[0].cents = 180.5;
    expect(fromCache(JSON.stringify(bad))).toBeNull();
    const badDate = JSON.parse(toCache(live));
    badDate.receipts[0].issued = "yesterday";
    expect(fromCache(JSON.stringify(badDate))).toBeNull();
  });
});

describe("saved copy size", () => {
  it("keeps the newest 500 donations", () => {
    const many = Array.from({ length: 600 }, (_, i) => ({ id: `g${i}`, date: new Date(2026, 0, 1, 0, i), charitySlug: "m", charityName: "M", cents: 100, monthly: false, with18a: false, label: null }));
    const back = fromCache(toCache({ gifts: many, recurring: [], receipts: [], elsewhere: [], loadedAt: new Date() }))!;
    expect(back.gifts).toHaveLength(500);
    expect(back.gifts[0].id).toBe("g599");
  });
});

describe("monthly donations (collected by our own job)", () => {
  it("keeps the monthly gift and the contribution to Givezy apart, as the charity sees them", () => {
    const [r] = toRecurring([{ id: "r1", amount_cents: 18_000, contribution_cents: "2000", status: "active", next_charge_at: "2026-11-15T06:00:00Z", charities: charity }]);
    expect(r.cents).toBe(18_000);
    expect(r.contributionCents).toBe(2_000);
  });

  it("an older row with no contribution still shows its amount", () => {
    const [r] = toRecurring([{ id: "r1", amount_cents: 18_000, status: "active", next_charge_at: null, charities: charity }]);
    expect(r.cents).toBe(18_000);
  });

  it("a monthly donation that stopped after failed attempts stays visible, and one still waiting for its first payment does not", () => {
    const rows = toRecurring([
      { id: "f", amount_cents: 100, status: "failed", next_charge_at: null, charities: charity },
      { id: "p", amount_cents: 100, status: "pending", next_charge_at: null, charities: charity },
    ]);
    expect(rows.map((r) => [r.id, r.status])).toEqual([["f", "failed"]]);
  });

  it("a failed one survives being saved for offline use", () => {
    const cached = toCache({
      gifts: [], receipts: [], elsewhere: [], loadedAt: new Date("2026-10-13T08:00:00Z"),
      recurring: toRecurring([{ id: "f", amount_cents: 100, status: "failed", next_charge_at: null, charities: charity }]),
    });
    expect(fromCache(cached)?.recurring[0].status).toBe("failed");
  });
});

describe("dates follow Johannesburg time", () => {
  it("a payment at 00:30 on 01/11 in Johannesburg is on 01/11 (and in November), wherever the phone is", async () => {
    const { ddmmyyyy, jhbDay } = await import("../apps/mobile/src/lib/format");
    const [gift] = toGifts([row({ paid_at: "2026-10-31T22:30:00Z" })], []);
    expect(ddmmyyyy(gift.date)).toBe("01/11/2026");
    expect(gift.date.getMonth()).toBe(10);
    expect(gift.at?.toISOString()).toBe("2026-10-31T22:30:00.000Z");
    expect(ddmmyyyy(jhbDay(new Date("2027-02-28T22:01:00Z")))).toBe("01/03/2027");
  });

  it("the time of day is Johannesburg time", async () => {
    const { hhmm } = await import("../apps/mobile/src/lib/format");
    expect(hhmm(new Date("2026-10-15T12:05:00Z"))).toBe("14:05");
  });

  it("a saved copy from before this change is not used (it gets loaded again)", () => {
    expect(fromCache(JSON.stringify({ v: 1, gifts: [], recurring: [], receipts: [], elsewhere: [], loadedAt: new Date().toISOString() }))).toBeNull();
  });
});
