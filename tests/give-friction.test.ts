/**
 * Faster giving (decided 04/11/2026): give links that preselect the amount and monthly, the live total that equals
 * the server's, the single agreement tick, "Add my details after paying", and the receipt run holding back a gift
 * whose s18A details are missing.
 */
import { describe, expect, it } from "vitest";
import { platformConfig } from "@/config/platform";
import { giveLink, linkAmountCents, readGiveLink } from "@/lib/donations/give-link";
import { preselectedAmount } from "@/lib/charity/suggested-amounts";
import { quoteFromTyped } from "@/lib/donations/quote";
import { agreementErrors, applyAgreementTick, AGREEMENT_ERROR, checkDonorDetails, checkoutSchema, s18aDetailsLater } from "@/lib/donations/validation";
import { canCompleteS18a, checkS18aCompletion, completionWindow, inCompletionWindow, missingWords, monthlyGiftsToComplete, s18aDetailsMissing, type CompletableGift, type S18aDetailsRow } from "@/lib/donations/s18a-details";
import { planReceipts, type PlanCharity, type PlanDonation } from "@/lib/receipts/plan";
import { runReceiptsJob, type ReceiptStore } from "@/lib/receipts/issue";

const limits = { minDonationCents: platformConfig.minDonationCents, maxDonationCents: platformConfig.maxDonationCents };

describe("give links: ?amount= and &monthly=", () => {
  it("preselects a whole-Rand amount and monthly", () => {
    expect(readGiveLink({ amount: "250", monthly: "1" }, limits)).toEqual({ amountCents: 25_000, monthly: true });
    expect(readGiveLink({ amount: "1250" }, limits)).toEqual({ amountCents: 125_000, monthly: false });
    expect(readGiveLink({ amount: ["300", "400"], monthly: "yes" }, limits)).toEqual({ amountCents: 30_000, monthly: true });
  });
  it("ignores silly values quietly, never an error", () => {
    for (const bad of ["-5", "abc", "5", "0", "", "1e5", "99999999", "250;drop", "1,250", " ", "R"]) {
      expect(readGiveLink({ amount: bad }, limits).amountCents).toBeUndefined();
    }
    expect(readGiveLink({ amount: undefined, monthly: "0" }, limits)).toEqual({ amountCents: undefined, monthly: false });
    expect(readGiveLink({ monthly: "please" }, limits).monthly).toBe(false);
    expect(linkAmountCents("1".repeat(40), limits)).toBeUndefined();
  });
  it("checks the minimum and maximum from the platform config", () => {
    expect(linkAmountCents(String(platformConfig.minDonationCents / 100), limits)).toBe(platformConfig.minDonationCents);
    expect(linkAmountCents(String(platformConfig.minDonationCents / 100 - 1), limits)).toBeUndefined();
    expect(linkAmountCents(String(platformConfig.maxDonationCents / 100), limits)).toBe(platformConfig.maxDonationCents);
    expect(linkAmountCents(String(platformConfig.maxDonationCents / 100 + 1), limits)).toBeUndefined();
  });
  it("our own retry link's amount in cents still wins, and a bad one falls back to the amount", () => {
    expect(readGiveLink({ cents: "18050", amount: "250" }, limits).amountCents).toBe(18_050);
    expect(readGiveLink({ cents: "-1", amount: "250" }, limits).amountCents).toBe(25_000);
    expect(readGiveLink({ cents: "100" }, limits).amountCents).toBeUndefined();
  });
  it("builds a short link the page reads back, with the share tag; a campaign link is never monthly", () => {
    const url = giveLink("https://givezy.test/", "meals", { amountCents: 25_000, monthly: true, src: "qr" });
    expect(url).toBe("https://givezy.test/c/meals/donate?amount=250&monthly=1&src=qr");
    const q = new URL(url).searchParams;
    expect(readGiveLink({ amount: q.get("amount"), monthly: q.get("monthly") }, limits)).toEqual({ amountCents: 25_000, monthly: true });
    expect(giveLink("https://givezy.test", "meals", { amountCents: 18_050 })).toBe("https://givezy.test/c/meals/donate?amount=180.50");
    expect(giveLink("https://givezy.test", "meals", { monthly: true, campaign: "c-1" })).toBe("https://givezy.test/c/meals/donate?campaign=c-1");
    expect(giveLink("https://givezy.test", "meals")).toBe("https://givezy.test/c/meals/donate");
  });
});

describe("the preselected amount", () => {
  it("is one of the charity's own amounts, the middle of three; none when it set none", () => {
    expect(preselectedAmount([10_000, 25_000, 50_000])).toBe(25_000);
    expect(preselectedAmount([10_000, 25_000])).toBe(10_000);
    expect(preselectedAmount([18_000])).toBe(18_000);
    expect(preselectedAmount([])).toBeUndefined();
  });
  it("never an amount outside the platform's minimum and maximum", () => {
    const tooSmall = platformConfig.minDonationCents - 100;
    const tooBig = platformConfig.maxDonationCents + 100;
    expect(preselectedAmount([tooSmall, 25_000, tooBig], limits)).toBe(25_000);
    expect(preselectedAmount([tooSmall, tooBig], limits)).toBeUndefined();
    expect(preselectedAmount([platformConfig.minDonationCents], limits)).toBe(platformConfig.minDonationCents);
  });
});

describe("the live total, box by box", () => {
  it("says what is wrong, next to the right box, in plain words", () => {
    expect(quoteFromTyped("", false, "", false)).toMatchObject({ ok: false, field: "amount" });
    expect(quoteFromTyped("5", false, "", false)).toMatchObject({ ok: false, field: "amount", message: "The minimum donation is R30." });
    expect(quoteFromTyped("1,250", false, "", false)).toMatchObject({ ok: false, field: "amount" });
    expect(quoteFromTyped("2000000", false, "", false)).toMatchObject({ ok: false, field: "amount" });
    expect(quoteFromTyped("250", true, "", false)).toMatchObject({ ok: false, field: "contribution" });
    expect(quoteFromTyped("250", true, "5", false)).toMatchObject({ ok: false, field: "contribution", message: "The minimum contribution to Givezy is R10." });
    for (const r of [quoteFromTyped("", false, "", false), quoteFromTyped("abc", false, "", false), quoteFromTyped("250", true, "x", false)]) {
      if (!r.ok) expect(r.message).not.toMatch(/!/);
    }
  });
});

const person = { donor_type: "individual", email: "a@example.com", first_name: "Dana", last_name: "Dube" } as const;
const parse = (raw: Record<string, string | undefined>) => checkoutSchema.parse(raw);

describe("one agreement tick or two (platformConfig.checkout.singleAgreementTick)", () => {
  it("is off until the wording is approved", () => {
    expect(platformConfig.checkout.singleAgreementTick).toBe(false);
  });
  it("switched on, the one tick records both agreements; without it, one plain problem on the one box", () => {
    const on = applyAgreementTick({ ...person, agreement: "on" }, true);
    expect(on).toMatchObject({ age_confirmed: "on", popia_consent: "on" });
    expect(on).not.toHaveProperty("agreement");
    expect(checkDonorDetails(parse(on), true)).toEqual({});
    // Ticking the old boxes does not count when the single tick is on: only the box on screen does.
    const missing = applyAgreementTick({ ...person, age_confirmed: "on", popia_consent: "on" }, true);
    const e = agreementErrors(checkDonorDetails(parse(missing), true), true);
    expect(e).toEqual({ agreement: AGREEMENT_ERROR });
  });
  it("switched off, the two ticks are read as before and a stray single tick counts for nothing", () => {
    const off = applyAgreementTick({ ...person, age_confirmed: "on", popia_consent: "on" }, false);
    expect(checkDonorDetails(parse(off), true)).toEqual({});
    const stray = applyAgreementTick({ ...person, agreement: "on" }, false);
    const e = agreementErrors(checkDonorDetails(parse(stray), true), false);
    expect(Object.keys(e).sort()).toEqual(["age_confirmed", "popia_consent"]);
  });
});

describe("s18A details now or after paying", () => {
  const agreed = { ...person, age_confirmed: "on", popia_consent: "on" };
  it("after paying: a person's gift goes ahead without the ID number and address", () => {
    const v = parse({ ...agreed, wants_18a: "on", s18a_when: "later" });
    expect(s18aDetailsLater(v, true)).toBe(true);
    expect(checkDonorDetails(v, true)).toEqual({});
  });
  it("now: the ID number (required since 03/11/2026) and the address are still checked", () => {
    const e = checkDonorDetails(parse({ ...agreed, wants_18a: "on", s18a_when: "now" }), true);
    expect(Object.keys(e).sort()).toEqual(["address_line1", "city", "id_number", "postal_code"]);
    // An old form without the choice works as before: details now.
    expect(Object.keys(checkDonorDetails(parse({ ...agreed, wants_18a: "on" }), true))).toContain("id_number");
  });
  it("a company after paying needs no registration number now, but a wrong one typed is still refused", () => {
    const company = { ...agreed, donor_type: "company", organisation_name: "Acme (Pty) Ltd", contact_person: "Dana", first_name: undefined, last_name: undefined, wants_18a: "on", s18a_when: "later" };
    expect(checkDonorDetails(parse(company), true)).toEqual({});
    expect(checkDonorDetails(parse({ ...company, registration_number: "12345" }), true)).toHaveProperty("registration_number");
    expect(checkDonorDetails(parse({ ...company, s18a_when: "now" }), true)).toHaveProperty("registration_number");
  });
  it("only counts when the charity can issue s18A receipts and the donor asked for one", () => {
    expect(s18aDetailsLater(parse({ ...agreed, wants_18a: "on", s18a_when: "later" }), false)).toBe(false);
    expect(s18aDetailsLater(parse({ ...agreed, s18a_when: "later" }), true)).toBe(false);
  });
});

const none: S18aDetailsRow = { donor_type: "individual", id_number_encrypted: null, tax_reference_encrypted: null, registration_number: null, address_line1: null, erased_at: null };
const full: S18aDetailsRow = { ...none, id_number_encrypted: "v1.a.b.c", address_line1: "5 Rissik Street" };

describe("what an s18A gift still lacks", () => {
  it("a person: the SA ID number (an old gift with only a tax number still counts) and the address", () => {
    expect(s18aDetailsMissing(none)).toEqual(["id_number", "address"]);
    expect(s18aDetailsMissing(full)).toEqual([]);
    expect(s18aDetailsMissing({ ...none, tax_reference_encrypted: "v1.t", address_line1: "1 Road" })).toEqual([]);
    expect(missingWords(["id_number", "address"])).toBe("your SA ID number and address");
  });
  it("a company or trust: the registration number and the address", () => {
    expect(s18aDetailsMissing({ ...none, donor_type: "trust" })).toEqual(["registration_number", "address"]);
    expect(s18aDetailsMissing({ ...none, donor_type: "company", registration_number: "2015/123456/07" })).toEqual(["address"]);
  });
});

describe("who may complete which gift", () => {
  const gift: CompletableGift = { id: "g1", status: "paid", wants_18a: true, tax_year: 2027, donor_id: "donor-1", recurring_id: null };
  const scope = { window: { taxYear: 2027, closedYearOpen: true }, onIssuedReceipt: new Set<string>() };
  it("a paid s18A gift of this tax year, or of the one just closed until 31 May, with details missing", () => {
    expect(canCompleteS18a(gift, none, scope)).toBe(true);
    expect(canCompleteS18a({ ...gift, tax_year: 2026 }, none, scope)).toBe(true);
    expect(canCompleteS18a({ ...gift, tax_year: 2026 }, none, { ...scope, window: { taxYear: 2027, closedYearOpen: false } })).toBe(false);
  });
  it("the window closes at the end of 31 May in Johannesburg, not in UTC", () => {
    expect(completionWindow(new Date("2026-05-31T23:59:59+02:00"))).toEqual({ taxYear: 2027, closedYearOpen: true });
    expect(completionWindow(new Date("2026-05-31T22:30:00Z"))).toEqual({ taxYear: 2027, closedYearOpen: false });
    expect(completionWindow(new Date("2026-06-01T00:00:00+02:00"))).toEqual({ taxYear: 2027, closedYearOpen: false });
    expect(completionWindow(new Date("2026-03-01T00:00:00+02:00"))).toEqual({ taxYear: 2027, closedYearOpen: true });
    expect(completionWindow(new Date("2027-02-28T23:59:00+02:00"))).toEqual({ taxYear: 2027, closedYearOpen: false });
    expect(inCompletionWindow(2025, { taxYear: 2027, closedYearOpen: true })).toBe(false);
  });
  it("never a gift that is not paid, did not ask for s18A, is older, is on an issued receipt, is erased or is complete", () => {
    expect(canCompleteS18a({ ...gift, status: "pending" }, none, scope)).toBe(false);
    expect(canCompleteS18a({ ...gift, wants_18a: false }, none, scope)).toBe(false);
    expect(canCompleteS18a({ ...gift, tax_year: 2025 }, none, scope)).toBe(false);
    expect(canCompleteS18a(gift, none, { ...scope, onIssuedReceipt: new Set(["g1"]) })).toBe(false);
    expect(canCompleteS18a(gift, { ...none, erased_at: "2026-11-01T00:00:00Z" }, scope)).toBe(false);
    expect(canCompleteS18a(gift, full, scope)).toBe(false);
    expect(canCompleteS18a(gift, null, scope)).toBe(false);
  });
  it("signed in, only the person's own gift", () => {
    expect(canCompleteS18a(gift, none, { ...scope, donorIds: new Set(["donor-1"]) })).toBe(true);
    expect(canCompleteS18a(gift, none, { ...scope, donorIds: new Set(["someone-else"]) })).toBe(false);
  });
  it("a monthly donation: its first gift and its other paid or pending gifts lacking details, in the same window only", () => {
    const m = (id: string, o: Partial<typeof gift> = {}, details: S18aDetailsRow | null = none) => ({ ...gift, id, recurring_id: "r1", ...o, details });
    const gifts = [
      m("first", { tax_year: 2026 }),
      m("this-month"),
      m("done", {}, full),
      m("receipted", { tax_year: 2026 }),
      m("pending", { status: "pending", tax_year: null }),
      m("failed", { status: "failed", tax_year: null }),
      m("refunded", { status: "refunded" }),
      m("older", { tax_year: 2025 }),
      m("other-donor", { donor_id: "donor-2" }),
      m("other-monthly", { recurring_id: "r2" }),
    ];
    const at = (closedYearOpen: boolean) =>
      monthlyGiftsToComplete(gifts, { recurringId: "r1", donorId: "donor-1", firstDonationId: "first", window: { taxYear: 2027, closedYearOpen }, onIssuedReceipt: new Set(["receipted"]) }).sort();
    expect(at(true)).toEqual(["first", "pending", "this-month"]);
    // After 31 May the first gift of the closed year is no longer taken: no older years.
    expect(at(false)).toEqual(["pending", "this-month"]);
  });
});

describe("the completion form", () => {
  const address = { address_line1: "5 Rissik Street", city: "Johannesburg", postal_code: "2001" };
  it("a person: a valid SA ID number and the address", () => {
    const r = checkS18aCompletion({ id_number: "8001 0150 09087", ...address, suburb: " Marshalltown " }, "individual");
    expect(r).toEqual({ ok: true, value: { idNumber: "8001015009087", address: { address_line1: "5 Rissik Street", address_line2: null, suburb: "Marshalltown", city: "Johannesburg", postal_code: "2001" } } });
  });
  it("refuses empty or wrong boxes, each in plain words", () => {
    const r = checkS18aCompletion({ id_number: "8001015009088", postal_code: "20" }, "individual");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.fieldErrors).sort()).toEqual(["address_line1", "city", "id_number", "postal_code"]);
      for (const m of Object.values(r.fieldErrors)) expect(m).not.toMatch(/!/);
    }
    const blank = checkS18aCompletion({}, "individual");
    expect(blank.ok).toBe(false);
  });
  it("a company: its CIPC number; a trust: its trust number", () => {
    expect(checkS18aCompletion({ registration_number: "2015/123456/07", ...address }, "company")).toMatchObject({ ok: true, value: { registrationNumber: "2015/123456/07" } });
    expect(checkS18aCompletion({ registration_number: "12345", ...address }, "company").ok).toBe(false);
    expect(checkS18aCompletion({ registration_number: "IT1234/2015", ...address }, "trust")).toMatchObject({ ok: true, value: { registrationNumber: "IT1234/2015" } });
    expect(checkS18aCompletion({ ...address }, "trust").ok).toBe(false);
  });
  it("asks only for what is missing; a number typed although one is on file is still checked, for comparing", () => {
    expect(checkS18aCompletion({ ...address }, "individual", new Date(), ["address"])).toEqual({ ok: true, value: { address: { address_line1: "5 Rissik Street", address_line2: null, suburb: null, city: "Johannesburg", postal_code: "2001" } } });
    expect(checkS18aCompletion({ id_number: "8001015009087" }, "individual", new Date(), ["id_number"])).toEqual({ ok: true, value: { idNumber: "8001015009087" } });
    expect(checkS18aCompletion({ id_number: "8001015009087", ...address }, "individual", new Date(), ["address"])).toMatchObject({ ok: true, value: { idNumber: "8001015009087" } });
    expect(checkS18aCompletion({ id_number: "123", ...address }, "individual", new Date(), ["address"]).ok).toBe(false);
    expect(checkS18aCompletion({ ...address }, "company", new Date(), ["address"])).toMatchObject({ ok: true });
  });
  it("spaces in an SA ID number are ignored exactly as at checkout", () => {
    const typed = " 8001 0150 09087 ";
    expect(checkDonorDetails(parse({ ...person, age_confirmed: "on", popia_consent: "on", wants_18a: "on", s18a_when: "now", id_number: typed, ...address }), true)).toEqual({});
    expect(checkS18aCompletion({ id_number: typed, ...address }, "individual")).toMatchObject({ ok: true, value: { idNumber: "8001015009087" } });
  });
  it("a line break typed into the address becomes a space (it is printed on the receipt)", () => {
    const r = checkS18aCompletion({ id_number: "8001015009087", ...address, address_line1: "5 Rissik\nStreet" }, "individual");
    expect(r.ok && r.value.address?.address_line1).toBe("5 Rissik Street");
  });
});

describe("the receipt run never receipts a gift whose s18A details are missing", () => {
  const charity: PlanCharity = { id: "c1", isS18a: true, mandateSignedAt: "2026-03-09T00:00:00+02:00" };
  const don = (o: Partial<PlanDonation>): PlanDonation => ({
    id: "d1", charityId: "c1", donorId: "u1", donorIdentity: "", taxYear: 2027, amountCents: 50_000, status: "paid", wants18a: true, paidAt: "2026-10-01T10:00:00Z", ...o,
  });
  it("holds it back as details missing, and receipts the donor's complete gifts", () => {
    const { receipts, skipped } = planReceipts({
      taxYear: 2027,
      charities: [charity],
      alreadyReceipted: new Set(),
      donations: [don({ id: "complete", donorIdentity: "id-a" }), don({ id: "later", detailsMissing: ["id_number", "address"] }), don({ id: "older", detailsMissing: [] })],
    });
    expect(receipts.flatMap((r) => r.donationIds).sort()).toEqual(["complete", "older"]);
    expect(skipped).toEqual([{ donationId: "later", reason: "details_missing" }]);
  });
  it("lists it for a person in the run's summary, as details missing", async () => {
    const store = {
      listDonations: async () => [don({ id: "later", detailsMissing: ["address"] }), don({ id: "complete" })],
      listCharities: async () => [{ ...charity }],
      receiptedDonationIds: async () => new Set<string>(),
    } as unknown as ReceiptStore;
    const s = await runReceiptsJob({ store, render: async () => Buffer.from(""), taxYear: 2027, today: "2027-03-05", now: new Date("2027-03-05T10:00:00Z"), mode: "dry-run" });
    expect(s.planned).toBe(1);
    expect(s.skippedByReason).toEqual({ details_missing: 1 });
    expect(s.needsAttention).toEqual([{ donationId: "later", reason: "details_missing" }]);
  });
});
