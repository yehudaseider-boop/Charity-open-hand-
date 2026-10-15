import { describe, expect, it } from "vitest";
import { DEMO_CHARITIES } from "@/portal-demo/data/charities";
import { DEMO_START, DEMO_TODAY, FOLLOW_UP_LARGE_DAYS, FOLLOW_UP_NEW_DAYS, GROUP_CONSISTENT_MIN } from "@/portal-demo/data/demo-config";
import { feeFor, generateDataset, localDay } from "@/portal-demo/data/generate";
import { taxYearFor, taxYearRange } from "@/lib/dates";
import {
  attentionItems,
  depositByFund,
  depositLines,
  givingWindows,
  GROUP_ORDER,
  groupFor,
  campaignPace,
  campaignStats,
  currentTaxYear,
  followUps,
  hasMarketingConsent,
  s18aReceipts,
  s18aSummary,
  donorStats,
  financeSummary,
  monthlySeries,
  pendingSettlement,
  presetRange,
  recurringSummary,
  sameDaysLastMonth,
  summarise,
  visibleToCharity,
} from "@/portal-demo/data/selectors";

const ALL = { from: DEMO_START, to: DEMO_TODAY };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("charity portal demo data", () => {
  it("is the same on every load", () => {
    const a = generateDataset("bright-futures");
    const b = generateDataset("bright-futures");
    expect(a.donations.length).toBe(b.donations.length);
    expect(a.donations[10]).toEqual(b.donations[10]);
  });

  it("gives each charity its own data", () => {
    const sizes = DEMO_CHARITIES.map((c) => generateDataset(c.id).donations.length);
    expect(new Set(sizes).size).toBe(3);
    expect(sizes[0]).toBeLessThan(sizes[1]);
    expect(sizes[1]).toBeLessThan(sizes[2]);
  });

  it("compares this month with the same calendar days last month", () => {
    expect(sameDaysLastMonth({ from: "2026-10-01", to: "2026-10-14" })).toEqual({ from: "2026-09-01", to: "2026-09-14" });
    expect(sameDaysLastMonth({ from: "2026-03-01", to: "2026-03-31" })).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(sameDaysLastMonth({ from: "2026-01-01", to: "2026-01-10" })).toEqual({ from: "2025-12-01", to: "2025-12-10" });
  });

  it("rounds the placeholder fee half up in whole cents", () => {
    expect(feeFor(10_000, 30_000)).toBe(300);
    expect(feeFor(1_650, 30_000)).toBe(50); // 49.5 cents rounds up
    expect(feeFor(1_649, 30_000)).toBe(49);
  });

  for (const charity of DEMO_CHARITIES) {
    describe(charity.shortName, () => {
      const ds = generateDataset(charity.id);
      const paid = ds.donations.filter((d) => d.status === "paid");

      it("uses whole cents only", () => {
        for (const d of ds.donations) {
          expect(Number.isSafeInteger(d.amountCents)).toBe(true);
          expect(Number.isSafeInteger(d.processingFeeCents)).toBe(true);
        }
      });

      it("overview total equals the donations table and the monthly chart", () => {
        const s = summarise(ds, ALL);
        expect(s.raisedCents).toBe(sum(paid.map((d) => d.amountCents)));
        expect(sum(monthlySeries(ds, ALL).map((m) => m.raisedCents))).toBe(s.raisedCents);
        expect(s.onceCents + s.monthlyCents).toBe(s.raisedCents);
        expect(s.newDonors + s.returningDonors).toBe(s.donorCount);
      });

      it("campaign totals plus the general fund equal the overview total", () => {
        const campaigns = sum(campaignStats(ds).map((c) => c.raisedCents));
        const general = sum(paid.filter((d) => !d.campaignId).map((d) => d.amountCents));
        expect(campaigns + general).toBe(summarise(ds, ALL).raisedCents);
      });

      it("donor totals equal the overview total", () => {
        expect(sum(donorStats(ds).map((d) => d.totalCents))).toBe(summarise(ds, ALL).raisedCents);
      });

      it("finance: gross minus refunds and chargebacks is what was raised, and net adds up", () => {
        const f = financeSummary(ds, ALL);
        expect(f.grossCents - f.refundsCents - f.chargebacksCents).toBe(summarise(ds, ALL).raisedCents);
        expect(f.netCents).toBe(f.grossCents - f.refundsCents - f.chargebacksCents - f.processingFeesCents - f.platformFeesCents);
        expect(f.paidOutCents + f.inTransitCents + f.awaitingCents).toBe(f.grossCents);
        expect(f.platformFeesCents).toBe(0);
      });

      it("payouts plus what is still to be paid out equal net donations", () => {
        const f = financeSummary(ds, ALL);
        const pending = pendingSettlement(ds);
        expect(sum(ds.payouts.map((p) => p.netCents)) + pending.netCents).toBe(f.netCents);
        for (const p of ds.payouts) expect(p.netCents).toBe(p.grossCents - p.feesCents - p.refundsCents);
      });

      it("settles after the donation and pays out after settling", () => {
        const payouts = new Map(ds.payouts.map((p) => [p.id, p]));
        for (const d of ds.donations) {
          if (d.settledAt) expect(d.settledAt.slice(0, 10) > d.donatedAt.slice(0, 10)).toBe(true);
          if (d.payoutId) expect(payouts.get(d.payoutId)!.payoutDate > d.settledAt!.slice(0, 10)).toBe(true);
          if (d.status === "failed" || d.status === "pending") expect(d.settledAt).toBeNull();
        }
      });

      it("monthly giving: collected equals paid monthly donations", () => {
        const r = recurringSummary(ds, presetRange("12m"));
        const monthly = paid.filter((d) => d.kind === "monthly" && localDay(d.donatedAt) >= presetRange("12m").from);
        expect(r.collectedCount).toBe(monthly.length);
        expect(r.collectedCents).toBe(sum(monthly.map((d) => d.amountCents)));
        expect(r.active + r.paused + r.cancelled + r.failedPlans).toBe(ds.recurring.length);
      });

      it("no fee is taken when the charity does not pay it", () => {
        const free = generateDataset(charity.id, "not_charity");
        const f = financeSummary(free, ALL);
        expect(f.processingFeesCents).toBe(0);
        expect(f.netCents).toBe(f.grossCents - f.refundsCents - f.chargebacksCents);
      });
    });
  }

  describe("s18A receipts", () => {
    it("charities without s18A approval have no receipts", () => {
      const ds = generateDataset("sunrise-table");
      expect(s18aReceipts(ds, currentTaxYear())).toEqual([]);
      expect(ds.donations.some((d) => d.wants18a)).toBe(false);
    });

    for (const id of ["bright-futures", "ezra-medical"]) {
      describe(id, () => {
        const ds = generateDataset(id);
        for (const taxYear of [currentTaxYear() - 1, currentTaxYear()]) {
          it(`tax year ${taxYear}: one receipt per donor, gift amounts only, paid donations that asked`, () => {
            const receipts = s18aReceipts(ds, taxYear);
            expect(receipts.length).toBeGreaterThan(0);
            expect(new Set(receipts.map((r) => r.donorId)).size).toBe(receipts.length);
            const expected = ds.donations.filter((d) => d.status === "paid" && d.wants18a && taxYearFor(d.donatedAt) === taxYear);
            expect(receipts.reduce((s, r) => s + r.totalCents, 0)).toBe(sum(expected.map((d) => d.amountCents)));
            expect(receipts.reduce((s, r) => s + r.donationIds.length, 0)).toBe(expected.length);
            for (const r of receipts) {
              const rows = ds.donations.filter((d) => r.donationIds.includes(d.id));
              expect(rows.every((d) => d.status === "paid" && d.donorId === r.donorId)).toBe(true);
              expect(r.totalCents).toBe(sum(rows.map((d) => d.amountCents)));
            }
          });
        }

        it("issues only after the tax year closes", () => {
          const closed = s18aReceipts(ds, currentTaxYear() - 1);
          const open = s18aReceipts(ds, currentTaxYear());
          expect(taxYearRange(currentTaxYear() - 1).end < DEMO_TODAY).toBe(true);
          expect(closed.some((r) => r.status === "issued")).toBe(true);
          expect(closed.every((r) => r.status !== "after_year_end")).toBe(true);
          expect(closed.every((r) => r.status === "issued" && r.number !== null)).toBe(true);
          expect(open.every((r) => r.status === "after_year_end" && r.number === null)).toBe(true);
        });

        it("numbers are unique and run without gaps", () => {
          const numbers = s18aReceipts(ds, currentTaxYear() - 1).map((r) => r.number).filter((n): n is string => !!n);
          expect(new Set(numbers).size).toBe(numbers.length);
          expect(numbers[0]).toMatch(/^[A-Z]{2}-\d{4}-0001$/);
          expect(numbers.at(-1)).toMatch(new RegExp(`-${String(numbers.length).padStart(4, "0")}$`));
        });

        it("summary matches the receipts", () => {
          const sm = s18aSummary(ds, currentTaxYear());
          const receipts = s18aReceipts(ds, currentTaxYear());
          expect(sm.donors).toBe(receipts.length);
          expect(sm.issued + sm.afterYearEnd).toBe(sm.donors);
          expect(sm.totalCents).toBe(sum(receipts.map((r) => r.totalCents)));
          expect(sm.end).toBe("2027-02-28");
        });
      });
    }
  });

  describe("campaign pace", () => {
    const base = { status: "active" as const, goalCents: 1_000_000, startDate: "2026-09-14", endDate: "2026-10-24" };
    it("is not measured for campaigns that are not active or have no end date", () => {
      expect(campaignPace({ ...base, status: "paused", raisedCents: 0 })).toBeNull();
      expect(campaignPace({ ...base, endDate: null, raisedCents: 0 })).toBeNull();
    });
    it("compares raised with an even pace (day 31 of 41, 10 days left)", () => {
      // expected at an even pace: 1 000 000 x 31 / 41 = 756 098 cents
      expect(campaignPace({ ...base, raisedCents: 900_000 })?.state).toBe("ahead");
      expect(campaignPace({ ...base, raisedCents: 760_000 })?.state).toBe("on_track");
      const behind = campaignPace({ ...base, raisedCents: 400_000 })!;
      expect(behind.state).toBe("behind");
      expect(behind.remainingDays).toBe(10);
      expect(behind.neededPerDayCents).toBe(60_000);
    });
    it("reached once the goal is met", () => {
      expect(campaignPace({ ...base, raisedCents: 1_000_000 })?.state).toBe("reached");
    });
  });

  describe("follow-ups and attention", () => {
    for (const charity of DEMO_CHARITIES) {
      const ds = generateDataset(charity.id);
      const large = 500_000;
      it(`${charity.shortName}: lists only the right people`, () => {
        const fu = followUps(ds, large);
        expect(fu.new.length).toBeGreaterThan(0);
        expect(fu.winback.length).toBeGreaterThan(0);
        expect(fu.winbackHiddenNoConsent).toBeGreaterThan(0);
        if (ds.charity.size !== "small") expect(fu.large.length).toBeGreaterThan(0);
        for (const r of fu.new) expect(r.donor.firstDay! >= "2026-09-30").toBe(true);
        expect(FOLLOW_UP_NEW_DAYS).toBe(14);
        for (const r of fu.large) {
          expect(r.amountCents).toBeGreaterThanOrEqual(large);
          expect(r.day >= "2026-09-14").toBe(true);
        }
        expect(FOLLOW_UP_LARGE_DAYS).toBe(30);
        for (const r of fu.winback) {
          expect(r.donor.group).toBe("inactive");
          expect(r.donor.giftCount).toBeGreaterThanOrEqual(2);
          expect(hasMarketingConsent(r.donor)).toBe(true);
        }
        for (const r of fu.checkin) {
          expect(r.donor.group).toBe("decreasing");
          expect(hasMarketingConsent(r.donor)).toBe(true);
        }
      });

      it(`${charity.shortName}: attention items agree with the screens`, () => {
        const items = attentionItems(ds, { largeCents: large, handled: {} });
        expect(items.map((i) => i.priority)).toEqual([...items.map((i) => i.priority)].sort());
        const fu = followUps(ds, large);
        expect(items.find((i) => i.kind === "large_donation")?.count ?? 0).toBe(fu.large.length);
        expect(items.find((i) => i.kind === "new_donors")?.count ?? 0).toBe(fu.new.length);
        expect(items.find((i) => i.kind === "giving_less")?.count ?? 0).toBe(fu.checkin.length);
        const handled = Object.fromEntries(fu.new.map((r) => [r.key, DEMO_TODAY]));
        expect(attentionItems(ds, { largeCents: large, handled }).some((i) => i.kind === "new_donors")).toBe(false);
        const stopped = ds.recurring.filter((p) => p.status === "failed" && p.failedAt! >= "2026-09-14");
        expect(items.find((i) => i.kind === "monthly_stopped")?.count ?? 0).toBe(stopped.length);
      });
    }
  });

  describe("giving groups", () => {
    it("follows the rules in order: new, inactive, consistent, decreasing, occasional", () => {
      expect(groupFor("2026-10-01", 1, 0)).toBe("new");
      expect(groupFor("2025-05-01", 0, 6)).toBe("inactive");
      expect(groupFor("2025-05-01", GROUP_CONSISTENT_MIN, 0)).toBe("consistent");
      expect(groupFor("2025-05-01", GROUP_CONSISTENT_MIN - 1, GROUP_CONSISTENT_MIN)).toBe("decreasing");
      expect(groupFor("2025-05-01", 2, 2)).toBe("occasional");
      expect(groupFor(null, 0, 0)).toBe("inactive");
    });

    it("counts 30-day windows back from the demo's today", () => {
      // 14/10/2026 is in window 0; 15/09/2026 (29 days back) too; 14/09/2026 (30 back) is window 1.
      expect(givingWindows(["2026-10-14", "2026-09-15"])).toEqual([1, 0]);
      expect(givingWindows(["2026-10-14", "2026-09-14"])).toEqual([2, 0]);
      // 180 days back is the first window of the earlier six.
      expect(givingWindows(["2026-04-17"])).toEqual([0, 1]);
    });

    for (const charity of DEMO_CHARITIES) {
      it(`${charity.shortName}: every donor is in exactly one group, and monthly donors are mostly consistent`, () => {
        const stats = donorStats(generateDataset(charity.id)).filter((d) => d.giftCount > 0);
        for (const d of stats) expect(GROUP_ORDER).toContain(d.group);
        // Donors whose active monthly donation began before April have had six months of payments.
        const longPlans = new Set(generateDataset(charity.id).recurring.filter((p) => p.status === "active" && p.startedAt < "2026-04-01").map((p) => p.donorId));
        const monthly = stats.filter((d) => longPlans.has(d.id));
        expect(monthly.filter((d) => d.group === "consistent").length / monthly.length).toBeGreaterThan(0.8);
        for (const d of stats.filter((x) => x.group === "inactive")) expect(d.lastDay! <= "2026-04-17").toBe(true);
      });
    }
  });

  describe("bank deposits", () => {
    for (const charity of DEMO_CHARITIES) {
      for (const feeModel of ["charity", "not_charity"] as const) {
        it(`${charity.shortName} (${feeModel}): every deposit's lines and campaign split add up to it`, () => {
          const ds = generateDataset(charity.id, feeModel);
          let refundLines = 0;
          for (const p of ds.payouts) {
            const lines = depositLines(ds, p);
            expect(sum(lines.map((l) => l.netCents))).toBe(p.netCents);
            expect(sum(lines.map((l) => l.grossCents))).toBe(p.grossCents);
            expect(sum(lines.map((l) => l.feeCents))).toBe(p.feesCents);
            expect(sum(lines.map((l) => l.refundCents))).toBe(p.refundsCents);
            expect(lines.filter((l) => l.kind === "donation").length).toBe(p.donationCount);
            const funds = depositByFund(lines);
            expect(sum(funds.map((f) => f.netCents))).toBe(p.netCents);
            expect(new Set(funds.map((f) => f.campaignId)).size).toBe(funds.length);
            refundLines += lines.filter((l) => l.kind === "refund").length;
          }
          expect(refundLines).toBeGreaterThan(0);
        });
      }
    }
  });

  describe("what a charity may see (decided 08/10/2026)", () => {
    for (const charity of DEMO_CHARITIES) {
      const ds = generateDataset(charity.id);
      it(`${charity.shortName}: the demo has pending, failed and charged-back payments to hide or show`, () => {
        const statuses = new Set(ds.donations.map((d) => d.status));
        for (const st of ["paid", "failed", "refunded", "charged_back"]) expect(statuses.has(st as never)).toBe(true);
      });
      it(`${charity.shortName}: finance figures count only paid, refunded and charged-back donations`, () => {
        const f = financeSummary(ds, ALL);
        const visible = ds.donations.filter(visibleToCharity);
        expect(f.grossCents).toBe(sum(visible.map((d) => d.amountCents)));
        expect(f.chargebacksCents).toBe(sum(ds.donations.filter((d) => d.status === "charged_back").map((d) => d.amountCents)));
        expect(f.chargebacksCents).toBeGreaterThan(0);
        expect(f.grossCents - f.refundsCents - f.chargebacksCents).toBe(summarise(ds, ALL).raisedCents);
      });
      it(`${charity.shortName}: no pending or failed payment is in a deposit, a receipt or a total`, () => {
        const hidden = new Set(ds.donations.filter((d) => !visibleToCharity(d)).map((d) => d.id));
        for (const p of ds.payouts) for (const l of depositLines(ds, p)) expect(hidden.has(l.donationId)).toBe(false);
        for (const r of s18aReceipts(ds, currentTaxYear() - 1)) for (const id of r.donationIds) expect(hidden.has(id)).toBe(false);
        for (const d of ds.donations) if (hidden.has(d.id)) expect(d.payoutId).toBeNull();
      });
      it(`${charity.shortName}: chargebacks come off the deposit of their week, as a chargeback line`, () => {
        let lines = 0;
        for (const p of ds.payouts) lines += depositLines(ds, p).filter((l) => l.kind === "chargeback").length;
        expect(lines).toBeGreaterThan(0);
      });
    }
  });

  describe("monthly donations that stop after failed payments", () => {
    for (const charity of DEMO_CHARITIES) {
      const ds = generateDataset(charity.id);
      it(`${charity.shortName}: a failed monthly donation has a stop date and no payments after it`, () => {
        const failed = ds.recurring.filter((p) => p.status === "failed");
        expect(failed.length).toBeGreaterThan(0);
        for (const p of failed) {
          expect(p.failedAt).not.toBeNull();
          expect(p.cancelledAt).toBeNull();
          const later = ds.donations.filter((d) => d.recurringId === p.id && d.donatedAt > p.failedAt!);
          expect(later).toEqual([]);
        }
      });
      it(`${charity.shortName}: "still giving" never counts more plans than were active at the start`, () => {
        const r = recurringSummary(ds, presetRange("90d"));
        expect(r.retentionPermille).not.toBeNull();
        expect(r.retentionPermille!).toBeLessThanOrEqual(1000);
        expect(r.failedPlans).toBe(ds.recurring.filter((p) => p.status === "failed").length);
      });
    }
  });
});
