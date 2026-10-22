import { describe, expect, it } from "vitest";
import { confirmationEmail } from "@/lib/donations/confirmation-email";
import { monthlyFailedEmail } from "@/lib/donations/monthly-email";

const base = { id: "3f9a2c71-0b1d-4e5f-9a8b-123456789abc", charityName: "Meals Fund", amountCents: 18_000, contributionCents: 2_000, totalCents: 20_000, paidAt: "2026-10-15T08:00:00Z", wants18a: true };

describe("monthly donation emails", () => {
  it("the first payment says what will be collected, when, from which card, and how to cancel", () => {
    const m = confirmationEmail({ ...base, monthly: { kind: "first", chargeDay: 31, cardLast4: "4081" }, manageUrl: "https://example.co.za/account" });
    expect(m.text).toContain("first payment of your monthly donation");
    expect(m.text).toContain("R200 on day 31 of each month");
    expect(m.text).toContain("we collect on its last day");
    expect(m.text).toContain("card ending 4081");
    expect(m.text).toContain("pause or cancel at any time");
    expect(m.text).toContain("https://example.co.za/account");
  });

  it("a later payment says it is the monthly donation and how to stop it", () => {
    const m = confirmationEmail({ ...base, monthly: { kind: "repeat" } });
    expect(m.text).toContain("This was your monthly donation.");
    expect(m.text).toContain("pause or cancel");
  });

  it("a card that cannot be charged again says the monthly donation was not set up", () => {
    const m = confirmationEmail({ ...base, monthly: { kind: "not_started" } });
    expect(m.text).toContain("has not been set up");
    expect(m.text).not.toContain("every month");
  });

  it("a once-off donation says nothing about monthly", () => {
    expect(confirmationEmail(base).text).not.toMatch(/monthly/i);
  });

  it("a failed collection says it will be tried again; the last says it has stopped", () => {
    const again = monthlyFailedEmail({ charityName: "Meals Fund", totalText: "R200", cardLast4: "4081", final: false });
    expect(again.text).toContain("We will try the same card again");
    expect(again.text).toContain("Nothing was charged");
    expect(again.subject).toContain("could not collect");
    const stop = monthlyFailedEmail({ charityName: "Meals Fund", totalText: "R200", cardLast4: null, final: true, manageUrl: "https://example.co.za/account" });
    expect(stop.text).toContain("stopped your monthly donation");
    expect(stop.text).toContain("your card");
    expect(stop.subject).toContain("has stopped");
  });

  it("offers the donor's own new-card link and a person to ask, and never says to cancel and start again", () => {
    const link = "https://example.co.za/monthly/new-card?m=x&e=1&s=y";
    for (const final of [false, true]) {
      const m = monthlyFailedEmail({ charityName: "Meals Fund", totalText: "R200", cardLast4: "4081", final, newCardUrl: link, helpEmail: "help@example.co.za" });
      expect(m.text).toContain(link);
      expect(m.text).toContain("This month's R200 is paid with it");
      expect(m.text).toContain("help@example.co.za");
      expect(m.text).not.toMatch(/charged twice|first cancel/i);
    }
    // Without a link (no website address yet), the stopped email still says how to carry on.
    expect(monthlyFailedEmail({ charityName: "Meals Fund", totalText: "R200", cardLast4: null, final: true }).text).toContain("start a new monthly donation");
  });

  it("uses no exclamation marks or em dashes", () => {
    const all = [
      confirmationEmail({ ...base, monthly: { kind: "first", chargeDay: 15, cardLast4: "4081" } }).text,
      monthlyFailedEmail({ charityName: "Meals Fund", totalText: "R200", cardLast4: "4081", final: true }).text,
      monthlyFailedEmail({ charityName: "Meals Fund", totalText: "R200", cardLast4: "4081", final: false }).text,
    ].join("\n");
    expect(all).not.toMatch(/[!—]/);
  });
});
