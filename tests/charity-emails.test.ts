import { describe, expect, it } from "vitest";
import { applicationReceivedEmail, approvedEmail, inviteEmail, newApplicationEmail, sentBackEmail } from "@/lib/charity/emails";

const base = "https://givezy.test";
const all = [
  applicationReceivedEmail("c@x.co", "Meals Fund", base),
  newApplicationEmail("me@x.co", "Meals Fund", "id-1", base),
  approvedEmail("c@x.co", "Meals Fund", "id-1", "ready", base),
  approvedEmail("c@x.co", "Meals Fund", "id-1", "mandate", base),
  approvedEmail("c@x.co", "Meals Fund", "id-1", "none", base),
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
    expect(all[5].text).toContain("The bank letter is older than 3 months.");
    expect(all[5].text).toContain(`${base}/charity-admin/id-1/application`);
  });
  it("only promise s18A receipts when the charity can issue them", () => {
    expect(all[2].text).toMatch(/s18A receipt will get one/);
    expect(all[4].text).toMatch(/can't issue s18A receipts/);
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

import { adminRemovedEmail, connectedEmail, receiptsReadyEmail, reinstatedEmail, secondStepResetEmail, suspendedEmail } from "@/lib/charity/emails";

describe("emails after approval", () => {
  const later = [
    suspendedEmail("c@x.co", "Meals Fund", "id-1", "Your bank letter has expired.", base),
    reinstatedEmail("c@x.co", "Meals Fund", "id-1", true, base),
    reinstatedEmail("c@x.co", "Meals Fund", "id-1", false, base),
    connectedEmail("c@x.co", "Meals Fund", "id-1", base),
    receiptsReadyEmail("c@x.co", "Meals Fund", "id-1", base),
  ];
  it("name the charity, link to its dashboard, and follow the house style", () => {
    for (const m of later) {
      expect(m.subject).toContain("Meals Fund");
      expect(m.text).toContain(`${base}/charity-admin/id-1`);
      expect(m.text + m.subject).not.toMatch(/!|—/);
    }
  });
  it("a suspension gives the reason and what it means for donors", () => {
    expect(later[0].text).toContain("Your bank letter has expired.");
    expect(later[0].text).toMatch(/donors can't give to you/);
  });
  it("tell people about changes to their own access", () => {
    for (const m of [adminRemovedEmail("p@x.co", "Meals Fund"), secondStepResetEmail("p@x.co")]) {
      expect(m.text).toMatch(/reply to this email/);
      expect(m.text + m.subject).not.toMatch(/!|—/);
    }
  });
});

import { contactChangedEmail, publicChangeEmail } from "@/lib/charity/emails";

describe("change alerts", () => {
  it("tell the old contact address where our emails go now", () => {
    const m = contactChangedEmail("old@x.co", "Meals Fund", "new@x.co");
    expect(m.to).toBe("old@x.co");
    expect(m.text).toContain("new@x.co");
    expect(m.text + m.subject).not.toMatch(/!|—/);
  });
  it("tell the reviewer what an approved charity changed, with a link to check it", () => {
    const m = publicChangeEmail("me@x.co", "Meals Fund", "id-1", 'its name, from "A" to "B"', base);
    expect(m.text).toContain(`${base}/admin/charities/id-1`);
    expect(m.text).toContain('from "A" to "B"');
  });
});

describe("what the approval and related emails promise about donations (18/11/2026 reading pass)", () => {
  const text = (m: { text: string }) => m.text;

  it("the approval email never says donors can give now: giving starts once the bank account is connected", async () => {
    const { approvedEmail } = await import("@/lib/charity/emails");
    for (const r of ["ready", "mandate", "none"] as const) {
      const t = text(approvedEmail("c@x.co", "Meals Fund", "id-1", r, "https://s.test"));
      expect(t).not.toMatch(/donors can give to you now/i);
      expect(t).toMatch(/Online donations start once we have connected your bank account/);
    }
  });

  it("says the right thing about receipts for each state", async () => {
    const { approvedEmail } = await import("@/lib/charity/emails");
    expect(text(approvedEmail("c@x.co", "M", "i", "ready", ""))).toMatch(/will get one in your name/);
    expect(text(approvedEmail("c@x.co", "M", "i", "mandate", ""))).toMatch(/signed receipting mandate/);
    // The application page is locked once approved: never send them there to upload it.
    expect(text(approvedEmail("c@x.co", "M", "i", "mandate", ""))).toMatch(/reply to this email with it/);
    expect(text(approvedEmail("c@x.co", "M", "i", "mandate", ""))).not.toMatch(/application page/);
    expect(text(approvedEmail("c@x.co", "M", "i", "mandate", ""))).not.toMatch(/tell us once you have s18A approval/);
    expect(text(approvedEmail("c@x.co", "M", "i", "none", ""))).toMatch(/tell us once you have s18A approval/);
  });

  it("the reinstated email promises giving only when the charity is connected", async () => {
    const { reinstatedEmail } = await import("@/lib/charity/emails");
    expect(text(reinstatedEmail("c@x.co", "M", "i", true, ""))).toMatch(/donors can give to you/);
    const unconnected = text(reinstatedEmail("c@x.co", "M", "i", false, ""));
    expect(unconnected).not.toMatch(/donors can give to you/);
    expect(unconnected).toMatch(/once your bank account is connected/);
  });

  it("the connected email says a donor can cover the card fee", async () => {
    const { connectedEmail } = await import("@/lib/charity/emails");
    expect(text(connectedEmail("c@x.co", "M", "i", ""))).toMatch(/unless the donor chooses to cover it/);
  });

  it("the bank-changed email says giving is paused only when the old account was connected", async () => {
    const { bankChangedEmail } = await import("@/lib/charity/emails");
    const was = bankChangedEmail("c@x.co", "Meals Fund", "19/11/2026", "4321", true).text;
    const wasNot = bankChangedEmail("c@x.co", "Meals Fund", "19/11/2026", "4321", false).text;
    expect(was).toMatch(/Online donations are paused until we have connected the new account/);
    expect(wasNot).not.toMatch(/paused/);
    for (const t of [was, wasNot]) {
      expect(t).toContain("ends in 4321");
      expect(t).toContain("19/11/2026");
      expect(t).not.toMatch(/[!—]/);
    }
  });
});
