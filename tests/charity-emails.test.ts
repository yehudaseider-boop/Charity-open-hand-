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
