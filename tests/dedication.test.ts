import { describe, expect, it } from "vitest";
import { confirmationEmail } from "@/lib/donations/confirmation-email";
import { cleanDedicationName, dedicationFrom, dedicationLine, parseDedication } from "@/lib/donations/dedication";
import { checkDonorDetails, checkoutSchema } from "@/lib/donations/validation";

describe("dedications", () => {
  it("is optional: no kind, or 'none', means no dedication", () => {
    expect(parseDedication(undefined, "Anyone")).toBeNull();
    expect(parseDedication("none", "Anyone")).toBeNull();
  });

  it("needs a name once honour or memory is chosen, of at most 80 characters", () => {
    expect(parseDedication("memory", "  ")).toEqual({ error: "Enter the name of the person" });
    expect(parseDedication("honour", "x".repeat(81))).toEqual({ error: "Keep the name to 80 characters" });
    expect(parseDedication("honour", "x".repeat(80))).toEqual({ kind: "honour", name: "x".repeat(80) });
    expect(parseDedication("other", "Chaim")).toEqual({ error: "Choose in honour of or in memory of" });
  });

  it("cleans the name: trims, joins spaces, drops control characters", () => {
    expect(cleanDedicationName("  Chaim\n\t  Cohen \u0007")).toBe("Chaim Cohen");
    expect(parseDedication("memory", " Chaim   Cohen ")).toEqual({ kind: "memory", name: "Chaim Cohen" });
  });

  it("reads back from the stored columns only when both are there", () => {
    expect(dedicationFrom("memory", "Chaim Cohen")).toEqual({ kind: "memory", name: "Chaim Cohen" });
    expect(dedicationFrom(null, "Chaim Cohen")).toBeNull();
    expect(dedicationFrom("honour", null)).toBeNull();
    expect(dedicationLine({ kind: "honour", name: "Rivka Levin" })).toBe("In honour of Rivka Levin");
    expect(dedicationLine({ kind: "memory", name: "Chaim Cohen" })).toBe("In memory of Chaim Cohen");
  });

  it("is checked with the rest of the checkout form", () => {
    const base = {
      donor_type: "individual", email: "sarah@example.co.za", first_name: "Sarah", last_name: "Levin",
      giving_kind: "maaser", age_confirmed: "on", popia_consent: "on",
    };
    const missing = checkoutSchema.parse({ ...base, dedication_kind: "memory" });
    expect(checkDonorDetails(missing, false).dedication_name).toBe("Enter the name of the person");
    const fine = checkoutSchema.parse({ ...base, dedication_kind: "memory", dedication_name: "Chaim Cohen" });
    expect(checkDonorDetails(fine, false).dedication_name).toBeUndefined();
    expect(checkoutSchema.safeParse({ ...base, dedication_kind: "birthday" }).success).toBe(false);
  });

  it("appears in the donor's confirmation email", () => {
    const m = confirmationEmail({
      id: "3f9a2c71-0000-4000-8000-000000000000", charityName: "Northcliff Meals Fund", amountCents: 18_000, contributionCents: 0,
      totalCents: 18_000, paidAt: "2026-10-15T08:00:00Z", wants18a: true, dedication: "In memory of Chaim Cohen",
    });
    expect(m.text).toContain("In memory of Chaim Cohen");
  });
});

describe("dedication names with hidden characters", () => {
  it("drops direction overrides and other invisible control characters", () => {
    expect(cleanDedicationName("‮Chaim‬ Cohen‏")).toBe("Chaim Cohen");
    expect(cleanDedicationName("\u0085Rivka⁦ Levin")).toBe("Rivka Levin");
    expect(cleanDedicationName("חיים כהן")).toBe("חיים כהן");
  });
});
