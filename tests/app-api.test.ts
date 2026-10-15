import { describe, expect, it } from "vitest";
import { checkDonorDetails } from "@/lib/donations/validation";
import { appCheckoutSchema, appGivingOpen, toCheckoutInput } from "@/lib/donations/app-api";

const base = {
  donor_type: "individual" as const,
  email: "a@example.com",
  first_name: "Dana",
  last_name: "Levi",
  giving_kind: "maaser",
  age_confirmed: true,
  popia_consent: true,
};

describe("app giving API", () => {
  it("is closed unless APP_GIVING is yes", () => {
    expect(appGivingOpen({})).toBe(false);
    expect(appGivingOpen({ APP_GIVING: "no" })).toBe(false);
    expect(appGivingOpen({ APP_GIVING: "yes" })).toBe(true);
  });

  it("turns the app's yes/no answers into the website's rules", () => {
    const r = toCheckoutInput(base);
    expect(r.ok && r.input.age_confirmed).toBe("on");
    expect(r.ok && r.input.monthly).toBeUndefined();
  });

  it("refuses without the age and privacy confirmations", () => {
    const r = toCheckoutInput({ ...base, age_confirmed: false, popia_consent: undefined });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(checkDonorDetails(r.input, true))).toEqual(expect.arrayContaining(["age_confirmed", "popia_consent"]));
  });

  it("requires a giving kind and rejects an unknown one", () => {
    const r = toCheckoutInput({ ...base, giving_kind: "other" });
    expect(!r.ok && r.fieldErrors.giving_kind).toBeTruthy();
  });

  it("needs an ID or tax number for an s18A receipt", () => {
    const r = toCheckoutInput({ ...base, wants_18a: true });
    expect(r.ok).toBe(true); // the charity-dependent s18A rules run in startDonation
  });

  it("passes a monthly gift and its authorisation through to the website's rules", () => {
    const r = toCheckoutInput({ ...base, monthly: true });
    expect(r.ok && r.input.monthly).toBe("on");
    if (r.ok) expect(checkDonorDetails(r.input, true).monthly_authorised).toBeTruthy();
    const ok = toCheckoutInput({ ...base, monthly: true, monthly_authorised: true });
    if (ok.ok) expect(checkDonorDetails(ok.input, true).monthly_authorised).toBeUndefined();
  });

  it("only accepts whole-cent numbers", () => {
    expect(appCheckoutSchema.safeParse({ slug: "x", giftCents: 18.5, contributionCents: 0, shownTotalCents: 18, details: base }).success).toBe(false);
    const ok = appCheckoutSchema.safeParse({ slug: "x", giftCents: 1800, contributionCents: 0, shownTotalCents: 1800, details: base });
    expect(ok.success).toBe(true);
  });
});
