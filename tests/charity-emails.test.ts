import { describe, expect, it } from "vitest";
import { applicationReceivedEmail, approvedEmail, inviteEmail, newApplicationEmail, sentBackEmail } from "@/lib/charity/emails";

const base = "https://givezy.test";
const all = [
  applicationReceivedEmail("c@x.co", "Meals Fund", base),
  newApplicationEmail("me@x.co", "Meals Fund", "id-1", base),
  approvedEmail("c@x.co", "Meals Fund", "id-1", true, base),
  approvedEmail("c@x.co", "Meals Fund", "id-1", false, base),
  sentBackEmail("c@x.co", "Meals Fund", "id-1", "The bank letter is older than 3 months.", base),
  inviteEmail("c@x.co", "Meals Fund", `${base}/apply?invite=abc`),
];

describe("charity sign-up emails", () => {
  it("name the charity, link to the right page, and follow the house style", () => {
    for (const m of all) {
      expect(m.subject).toContain("Meals Fund");
      expect(m.text).toContain(base);
      expect(m.text + m.subject).not.toMatch(/!|—|Nadiv Lev/);
    }
    expect(all[1].text).toContain(`${base}/admin/charities/id-1`);
    expect(all[4].text).toContain("The bank letter is older than 3 months.");
    expect(all[4].text).toContain(`${base}/charity-admin/id-1/application`);
  });
  it("only promise s18A receipts when the charity can issue them", () => {
    expect(all[2].text).toMatch(/s18A receipt will get one/);
    expect(all[3].text).toMatch(/can't issue s18A receipts/);
  });
});

import { donationReceivedEmail } from "@/lib/charity/emails";

describe("donation received email to the charity", () => {
  it("gives the amount and campaign, links to the dashboard and the off switch, and names no donor", () => {
    const m = donationReceivedEmail("c@x.co", { charityName: "Meals Fund", charityId: "id-1", amountCents: 1_234_550, monthly: false, campaignTitle: "Pesach parcels" }, base);
    expect(m.subject).toBe("Meals Fund received R12 345.50 on Givezy");
    expect(m.text).toContain('for your campaign "Pesach parcels"');
    expect(m.text).toContain(`${base}/charity-admin/id-1/donations`);
    expect(m.text).toContain(`${base}/charity-admin/id-1/profile`);
    expect(m.text + m.subject).not.toMatch(/!|—/);
  });
  it("says when it is a monthly donation", () => {
    expect(donationReceivedEmail("c@x.co", { charityName: "M", charityId: "i", amountCents: 18_000, monthly: true, campaignTitle: null }, base).text).toMatch(/a monthly donation of R180/);
  });
});
