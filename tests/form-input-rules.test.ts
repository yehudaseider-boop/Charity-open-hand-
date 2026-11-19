/**
 * What people type into the forms, read the same way the box lets them type it (review 18/11/2026): one phone rule
 * everywhere, a website with a space refused before the database refuses it, bank and ID numbers typed with spaces or
 * dashes, a full text box with line breaks, and the same limits in the box, the app and the server.
 */
import { describe, expect, it } from "vitest";
import { normaliseSaPhone, SA_PHONE } from "@/lib/phone";
import { cleanContactPhone } from "@/lib/charity/contacts";
import { checkGift } from "@/lib/charity/recorded-gifts";
import { bankSchema, contactSchema, normalisePhone, profileSchema, updateSchema } from "@/lib/charity/validation";
import { checkDonorDetails, checkoutSchema, cleanPhone } from "@/lib/donations/validation";
import { appCheckoutSchema, appFieldErrors, toCheckoutInput } from "@/lib/donations/app-api";
import { LABEL_MAX } from "@/lib/donations/labels";
import { checkFocus } from "@/lib/charity/focus-check";
import { FOCUS_MESSAGE_MAX } from "@/lib/charity/focus";
import { isValidSaIdNumber, saIdDigits } from "@/lib/sa-id";
import { normaliseLineBreaks } from "@/lib/text";

const ID = "8001015009087";

describe("one phone rule everywhere", () => {
  const same: [string, string][] = [
    ["082 123 4567", "0821234567"],
    ["082.123.4567", "0821234567"],
    ["(082) 123-4567", "0821234567"],
    ["+27 82 123 4567", "+27821234567"],
    ["27821234567", "+27821234567"],
    ["0027 82 123 4567", "+27821234567"],
    ["+27 (0)82 123 4567", "+27821234567"],
    ["+27(0)821234567", "+27821234567"],
    ["0027 (0)82 123 4567", "+27821234567"],
    ["+27 082 123 4567", "+27821234567"],
  ];
  it("reads every way of typing the same number into one kept form", () => {
    for (const [typed, kept] of same) {
      expect(normaliseSaPhone(typed)).toBe(kept);
      expect(SA_PHONE.test(normaliseSaPhone(typed))).toBe(true);
    }
  });
  it("still refuses what isn't a South African number", () => {
    for (const typed of ["12345", "+44 20 7946 0958", "082 123 456", "0821234567890"]) expect(SA_PHONE.test(normaliseSaPhone(typed))).toBe(false);
  });

  const gift = { date: "05/03/2026", amount: "500", method: "eft", first_name: "Sarah", last_name: "Levin", email: "sarah@example.co.za" };
  it("the gift import and the donor import accept the same numbers, kept the same way", () => {
    for (const [typed, kept] of same) {
      const r = checkGift({ ...gift, phone: typed }, { today: "2026-10-21" });
      expect(r.ok, typed).toBe(true);
      if (r.ok) expect(r.gift.phone).toBe(kept);
      expect(cleanContactPhone(typed)).toEqual({ phone: kept });
    }
    const bad = checkGift({ ...gift, phone: "12345" }, { today: "2026-10-21" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.phone).toMatch(/South African number/);
  });

  it("the donate form, the app and the charity's contact form accept them too", () => {
    for (const [typed, kept] of same) {
      expect(cleanPhone(typed)).toBe(kept);
      const parsed = checkoutSchema.parse({ donor_type: "individual", email: "a@b.co", first_name: "A", last_name: "B", phone: cleanPhone(typed), age_confirmed: "on", popia_consent: "on" });
      expect(checkDonorDetails(parsed, true).phone, typed).toBeUndefined();
      const app = toCheckoutInput({ donor_type: "individual", email: "a@b.co", first_name: "A", last_name: "B", phone: typed, age_confirmed: true, popia_consent: true });
      expect(app.ok && app.input.phone).toBe(kept);
      expect(contactSchema.safeParse({ contact_name: "Ann", contact_email: "ann@x.co", contact_phone: normalisePhone(typed) }).success, typed).toBe(true);
    }
    expect(contactSchema.safeParse({ contact_name: "Ann", contact_email: "ann@x.co", contact_phone: normalisePhone("12345") }).success).toBe(false);
  });
});

describe("the charity's website address", () => {
  const website = (w: string) => profileSchema.safeParse({ name_en: "Meals Fund", website: w });
  it("refuses a space with a plain message, before the database would", () => {
    for (const w of ["example .org.za", "example.org.za/give now", "https://example.org.za/a b"]) {
      const r = website(w);
      expect(r.success, w).toBe(false);
      expect(r.error?.issues[0].message).toMatch(/Take out the spaces/);
    }
  });
  it("still adds https:// for the person, and refuses what isn't a web address", () => {
    expect(website("example.org.za").data?.website).toBe("https://example.org.za");
    expect(website("http://example.org.za/donate").data?.website).toBe("http://example.org.za/donate");
    expect(website("ftp://example.org.za").success).toBe(false);
  });
});

describe("bank details typed as on the letter", () => {
  const bank = (o: Record<string, string>) => bankSchema.safeParse({ bank_name: "FNB", bank_account_holder: "Meals Fund NPC", ...o });
  it("takes out spaces and dashes before checking", () => {
    expect(bank({ bank_account_number: "6234 5678 901", bank_branch_code: "250 655" }).data).toMatchObject({ bank_account_number: "62345678901", bank_branch_code: "250655" });
    expect(bank({ bank_account_number: "62-3456-78901", bank_branch_code: "250-655" }).data).toMatchObject({ bank_account_number: "62345678901", bank_branch_code: "250655" });
  });
  it("still needs 6 to 16 digits and a 6-digit branch code", () => {
    expect(bank({ bank_account_number: "123 45", bank_branch_code: "250655" }).error?.issues[0].message).toBe("Account number is 6 to 16 digits");
    expect(bank({ bank_account_number: "62345678901", bank_branch_code: "250 65" }).error?.issues[0].message).toBe("Branch code is 6 digits");
    expect(bank({ bank_account_number: "12345678901234567", bank_branch_code: "250655" }).success).toBe(false);
    expect(bank({ bank_account_number: " - ", bank_branch_code: "250655" }).error?.issues[0].message).toBe("Enter the account number");
  });
});

describe("SA ID numbers with spaces or dashes", () => {
  it("are checked and kept as 13 digits", () => {
    expect(isValidSaIdNumber("800101 5009 087")).toBe(true);
    expect(isValidSaIdNumber("800101-5009-08-7")).toBe(true);
    expect(saIdDigits("800101-5009 087")).toBe(ID);
    expect(isValidSaIdNumber("800101-5009-086")).toBe(false);
  });
  it("the donate form keeps the digits only", () => {
    const parsed = checkoutSchema.parse({ donor_type: "individual", email: "a@b.co", first_name: "A", last_name: "B", wants_18a: "on", id_number: "800101-5009-087" });
    expect(parsed.id_number).toBe(ID);
    expect(checkoutSchema.parse({ donor_type: "individual", email: "a@b.co", id_number: " - " }).id_number).toBeUndefined();
  });
  it("the gift import keeps the digits only", () => {
    const r = checkGift(
      { date: "05/03/2026", amount: "500", method: "eft", first_name: "Sarah", last_name: "Levin", email: "s@x.co", wants_18a: "yes", id_number: "800101-5009-087", address_line1: "1 Main Rd", city: "Durban", postal_code: "4001" },
      { today: "2026-10-21" },
    );
    expect(r.ok && r.gift.idNumber).toBe(ID);
  });
});

describe("a full text box with line breaks", () => {
  // The browser counts a line break as 1 towards maxLength and sends it as \r\n.
  const full = (max: number) => `${"a\r\n".repeat(Math.floor((max - 1) / 2))}a`;
  it("counts a line break as one character", () => {
    expect(normaliseLineBreaks("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
  });
  it("the donate message", () => {
    const parsed = checkoutSchema.safeParse({ donor_type: "individual", email: "a@b.co", message: full(500) });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.message).not.toContain("\r");
    expect(checkoutSchema.safeParse({ donor_type: "individual", email: "a@b.co", message: "a".repeat(501) }).success).toBe(false);
  });
  it("a charity update", () => {
    expect(updateSchema.safeParse({ body_en: full(500) }).success).toBe(true);
    expect(updateSchema.safeParse({ body_en: "a".repeat(501) }).success).toBe(false);
    expect(updateSchema.safeParse({}).error?.issues[0].message).toBe("Write your update");
  });
  it("the featured message", () => {
    const r = checkFocus({ title: "Winter blankets", message: full(FOCUS_MESSAGE_MAX), starts_on: "10/11/2026", ends_on: "30/11/2026" }, "2026-11-10", []);
    expect(r.ok).toBe(true);
  });
});

describe("the same limits in the box, the app and the server", () => {
  const details = { donor_type: "individual" as const, email: "a@b.co", first_name: "A", last_name: "B" };
  it("a donor's own label is at most 40 characters, as it is kept", () => {
    expect(LABEL_MAX).toBe(40);
    expect(checkoutSchema.safeParse({ ...details, giving_label: "a".repeat(40) }).success).toBe(true);
    expect(checkoutSchema.safeParse({ ...details, giving_label: "a".repeat(41) }).error?.issues[0].message).toMatch(/40 characters/);
  });
  const body = (d: Record<string, unknown>) => ({ slug: "meals", giftCents: 10_000, contributionCents: 0, shownTotalCents: 10_000, details: { ...details, ...d } });
  it("the app takes an email up to 254 characters, like the website", () => {
    const long = `${"a".repeat(240)}@example.co.za`;
    expect(long.length).toBe(254);
    expect(appCheckoutSchema.safeParse(body({ email: long })).success).toBe(true);
    expect(appCheckoutSchema.safeParse(body({ email: `a${long}` })).success).toBe(false);
  });
  it("tells the app what is wrong with a detail, where it can", () => {
    const r = appCheckoutSchema.safeParse(body({ first_name: "a".repeat(81), giving_label: "a".repeat(41), donor_type: "club", phone: 5 }));
    expect(r.success).toBe(false);
    expect(appFieldErrors(r.error!.issues)).toEqual({
      first_name: "Please keep this to 80 characters or fewer",
      giving_label: "Please keep this to 40 characters or fewer",
      donor_type: "Choose one of the options",
      phone: "Check this detail",
    });
    const big = appCheckoutSchema.safeParse({ ...body({}), giftCents: 10 ** 12 });
    expect(appFieldErrors(big.error!.issues)).toEqual({ amount: "That amount is above the most we can take in the app" });
  });
});
