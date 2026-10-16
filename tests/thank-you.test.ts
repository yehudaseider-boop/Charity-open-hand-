import { describe, expect, it } from "vitest";
import { checkThankYou, emailHash, monthLabel, monthPeriod, recentMonths, thankYouEmail } from "@/lib/charity/thank-you";

describe("thank-you emails", () => {
  it("names the month and the charity, greets by first name, and shows nothing else about the gift", () => {
    const m = thankYouEmail("sarah@x.co", { charityName: "Meals Fund", firstName: "Sarah", month: "2026-10-01", body: "Your gifts packed 40 parcels.", stopUrl: "https://g.test/thanks/stop?t=abc" });
    expect(m.subject).toBe("A thank-you from Meals Fund");
    expect(m.text).toMatch(/^Dear Sarah,/);
    expect(m.text).toContain("everyone who gave to them in October 2026");
    expect(m.text).toContain("Your gifts packed 40 parcels.");
    expect(m.text).toContain("https://g.test/thanks/stop?t=abc");
    expect(m.text).not.toMatch(/R\d/);
    expect(m.text + m.subject).not.toMatch(/!|—/);
  });
  it("says hello when there's no first name", () => {
    expect(thankYouEmail("a@x.co", { charityName: "M", firstName: null, month: "2026-10-01", body: "Thank you all.", stopUrl: "u" }).text).toMatch(/^Hello,/);
  });
  it("offers this month and the two before, in Johannesburg time", () => {
    expect(recentMonths(new Date("2026-01-31T23:30:00Z"))).toEqual(["2026-02-01", "2026-01-01", "2025-12-01"]);
    expect(recentMonths(new Date("2026-10-16T08:00:00Z"))).toEqual(["2026-10-01", "2026-09-01", "2026-08-01"]);
  });
  it("covers the whole month, December into January", () => {
    expect(monthPeriod("2026-12-01")).toEqual({ from: "2026-12-01T00:00:00+02:00", to: "2027-01-01T00:00:00+02:00" });
    expect(monthLabel("2026-12-01")).toBe("December 2026");
  });
  it("needs a few words and no more than 1 000 characters", () => {
    expect(checkThankYou("  thanks ").ok).toBe(false);
    expect(checkThankYou("a".repeat(1001)).ok).toBe(false);
    expect(checkThankYou("  Thank you for your gift.  ")).toEqual({ ok: true, body: "Thank you for your gift." });
  });
  it("keeps opt-outs by a hash of the address, the same whatever the case", () => {
    expect(emailHash("Sarah@X.co ")).toBe(emailHash("sarah@x.co"));
    expect(emailHash("sarah@x.co")).toMatch(/^[0-9a-f]{64}$/);
  });
});
