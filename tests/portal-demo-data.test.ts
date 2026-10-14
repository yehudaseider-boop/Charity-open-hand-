import { describe, expect, it } from "vitest";
import { DEMO_CHARITIES } from "@/portal-demo/data/charities";
import { DEMO_START, DEMO_TODAY } from "@/portal-demo/data/demo-config";
import { feeFor, generateDataset } from "@/portal-demo/data/generate";
import {
  campaignStats,
  donorStats,
  financeSummary,
  monthlySeries,
  pendingSettlement,
  presetRange,
  recurringSummary,
  summarise,
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

      it("finance: gross minus refunds is what was raised, and net adds up", () => {
        const f = financeSummary(ds, ALL);
        expect(f.grossCents - f.refundsCents).toBe(summarise(ds, ALL).raisedCents);
        expect(f.netCents).toBe(f.grossCents - f.refundsCents - f.processingFeesCents - f.platformFeesCents);
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
        const monthly = paid.filter((d) => d.kind === "monthly" && d.donatedAt.slice(0, 10) >= presetRange("12m").from);
        expect(r.collectedCount).toBeGreaterThan(0);
        expect(r.collectedCents).toBeLessThanOrEqual(sum(monthly.map((d) => d.amountCents)) + 1);
        expect(r.active + r.paused + r.cancelled).toBe(ds.recurring.length);
      });

      it("no fee is taken when the charity does not pay it", () => {
        const free = generateDataset(charity.id, "not_charity");
        const f = financeSummary(free, ALL);
        expect(f.processingFeesCents).toBe(0);
        expect(f.netCents).toBe(f.grossCents - f.refundsCents);
      });
    });
  }
});
