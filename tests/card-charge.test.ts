/** "Cover the card charge": the charity gets the full gift, never a cent short, and the box only shows with real rates. */
import { describe, expect, it } from "vitest";
import { cardChargeToCover, priceDonation, providerCharge, type CardChargeRates } from "@/lib/fees";
import { cardChargeRates } from "@/lib/donations/card-charge";

// Example rates for the tests only. Real rates come from the provider's rate sheet in src/config/platform.ts.
const R: CardChargeRates = { percentPpm: 29_000, fixedCents: 100, vatOnTopPpm: 150_000 };
const m = { minDonationCents: 3_000, minContributionCents: 1_000, maxDonationCents: 100_000_000 };

describe("the card charge to cover", () => {
  it("leaves the charity at least the full gift after the provider's charge on the whole payment", () => {
    for (const base of [3_000, 3_001, 18_000, 99_999, 1_000_000, 100_000_000]) {
      const cover = cardChargeToCover(base, R);
      expect(base + cover - providerCharge(base + cover, R)).toBeGreaterThanOrEqual(base);
      // And never more than a cent or so over: the smallest such cover.
      expect(base + (cover - 1) - providerCharge(base + cover - 1, R)).toBeLessThan(base);
    }
  });
  it("works out the provider's charge in whole cents, rounded up, with VAT on top when the rates exclude it", () => {
    // R180: 2.9% = 522c, + 100c = 622c, + 15% VAT = 715.3c, rounded up to 716c.
    expect(providerCharge(18_000, R)).toBe(716);
    expect(providerCharge(18_000, { ...R, vatOnTopPpm: 0 })).toBe(622);
  });
  it("adds to the total and keeps the gift and contribution as they were", () => {
    const p = priceDonation(18_000, 1_000, m, R);
    expect(p.amountCents).toBe(18_000);
    expect(p.contributionCents).toBe(1_000);
    expect(p.cardChargeCents).toBe(cardChargeToCover(19_000, R));
    expect(p.totalCents).toBe(19_000 + p.cardChargeCents);
  });
  it("is nothing when the box isn't ticked or there are no rates", () => {
    expect(priceDonation(18_000, 0, m)).toMatchObject({ cardChargeCents: 0, totalCents: 18_000 });
    expect(priceDonation(18_000, 0, m, null)).toMatchObject({ cardChargeCents: 0, totalCents: 18_000 });
  });
});

describe("whether the box shows", () => {
  const base = { gatewayChargePaidBy: "charity" as const, gatewayPercent: "2.9", gatewayFixedCents: 100, gatewayRatesIncludeVat: false };
  it("only once every rate is filled in, and only while the charity bears the charge", () => {
    expect(cardChargeRates(base, "15")).toEqual({ percentPpm: 29_000, fixedCents: 100, vatOnTopPpm: 150_000 });
    expect(cardChargeRates({ ...base, gatewayRatesIncludeVat: true }, "15")?.vatOnTopPpm).toBe(0);
    expect(cardChargeRates({ ...base, gatewayPercent: null }, "15")).toBeNull();
    expect(cardChargeRates({ ...base, gatewayFixedCents: null }, "15")).toBeNull();
    expect(cardChargeRates({ ...base, gatewayRatesIncludeVat: null }, "15")).toBeNull();
    expect(cardChargeRates({ ...base, gatewayChargePaidBy: "givezy" }, "15")).toBeNull();
  });
  it("stays hidden today: the provider's rates have not been supplied yet", () => {
    expect(cardChargeRates()).toBeNull();
  });
});

describe("monthly donations and the app", async () => {
  const { runMonthlyCharges } = await import("@/lib/donations/monthly-job");
  const { monthlyCardCharge } = await import("@/lib/donations/card-charge");
  const { cleanRates } = await import("../apps/mobile/src/lib/pay-api");

  it("a monthly collection charges the gift, the contribution and that month's cover, and the charity's line carries the cover", async () => {
    const cover = monthlyCardCharge(18_000, 1_000, true, R);
    expect(cover).toBe(cardChargeToCover(19_000, R));
    expect(monthlyCardCharge(18_000, 1_000, false, R)).toBe(0);
    expect(monthlyCardCharge(18_000, 1_000, true, null)).toBe(0);

    const charged: number[] = [];
    const created: number[] = [];
    const now = new Date("2026-11-15T08:00:00Z");
    await runMonthlyCharges({
      now,
      store: {
        due: async () => ({ rows: [{ id: "6f52c335-dd9e-4ee2-8843-7eee93fceb76", charitySlug: "meals", charityName: "Meals Fund", amountCents: 18_000, contributionCents: 1_000, cardChargeCents: cover, chargeDay: 15, authorizationCode: "AUTH", email: "d@example.co.za", cardLast4: "4081", lastPaidPeriod: "2026-10", attemptPeriod: null, failedAttempts: 0, nextChargeAt: new Date("2026-11-15T04:00:00Z") }], unreadable: [] }),
        claim: async () => true,
        attemptStatus: async () => null,
        stillActive: async () => true,
        createAttempt: async (_r, _id, total) => void created.push(total),
        reschedule: async () => {},
        recordPaid: async () => {},
        recordFailure: async () => {},
        failAttempt: async () => {},
        newCardPending: async () => false,
      },
      charge: async ({ totalCents }) => void charged.push(totalCents),
      confirm: async () => "paid",
      charityState: async () => ({ accepting: true }),
      isNotFound: () => false,
      isRefused: () => false,
      notifyFailed: async () => {},
    });
    expect(created).toEqual([19_000 + cover]);
    expect(charged).toEqual([19_000 + cover]);
  });

  it("the app only accepts sensible rates from the server, and hides the box otherwise", () => {
    expect(cleanRates({ percentPpm: 29_000, fixedCents: 100, vatOnTopPpm: 150_000 })).toEqual({ percentPpm: 29_000, fixedCents: 100, vatOnTopPpm: 150_000 });
    expect(cleanRates(null)).toBeNull();
    expect(cleanRates({ percentPpm: "2.9", fixedCents: 100, vatOnTopPpm: 0 })).toBeNull();
    expect(cleanRates({ percentPpm: 900_000, fixedCents: 100, vatOnTopPpm: 0 })).toBeNull();
    expect(cleanRates({ percentPpm: 29_000, fixedCents: -1, vatOnTopPpm: 0 })).toBeNull();
  });
});
