/**
 * Typographic punctuation made plain where names and addresses are typed and saved (20/11/2026): an iPhone's
 * O’Brien (U+2019) would otherwise block the charity's SARS IT3(d) file, which holds Latin-1 only.
 */
import { describe, expect, it } from "vitest";
import { plainPunctuation } from "@/lib/plain-text";
import { checkoutSchema } from "@/lib/donations/validation";
import { checkCertificateEdit } from "@/lib/receipts/review";
import { checkS18aCompletion } from "@/lib/donations/s18a-details";
import { checkGift } from "@/lib/charity/recorded-gifts";

describe("plainPunctuation", () => {
  it("makes curly and low quotes, primes, dashes, the ellipsis and odd spaces plain", () => {
    expect(plainPunctuation("O’Brien")).toBe("O'Brien");
    expect(plainPunctuation("‘Sipho’ ‚ok‛ 5′")).toBe("'Sipho' 'ok' 5'");
    expect(plainPunctuation("“The Oaks” „Haus‟ 6″")).toBe('"The Oaks" "Haus" 6"');
    expect(plainPunctuation("Smith–Jones—Ndlovu − Unit‐4 ‑ ‒ ―")).toBe("Smith-Jones-Ndlovu - Unit-4 - - -");
    expect(plainPunctuation("Wait…")).toBe("Wait...");
    expect(plainPunctuation("12 Main Road Flat　4 x")).toBe("12 Main Road Flat 4 x");
    expect(plainPunctuation("Thandi​we⁠﻿")).toBe("Thandiwe");
  });

  it("leaves letters as typed, accents and all, and plain text untouched", () => {
    expect(plainPunctuation("Zoë Müller-Péréz, 5 Rue de l'Église")).toBe("Zoë Müller-Péréz, 5 Rue de l'Église");
    expect(plainPunctuation("Nguyễn")).toBe("Nguyễn");
    expect(plainPunctuation("")).toBe("");
    expect(plainPunctuation('Plain "quotes" and - dashes')).toBe('Plain "quotes" and - dashes');
  });
});

describe("where names and addresses are saved", () => {
  it("checkout", () => {
    const v = checkoutSchema.parse({ donor_type: "individual", email: "a@b.co", first_name: "Seán", last_name: "O’Brien–Smith", address_line1: "12 Main Road", city: "Cape Town" });
    expect(v).toMatchObject({ first_name: "Seán", last_name: "O'Brien-Smith", address_line1: "12 Main Road", city: "Cape Town" });
  });

  it("checks the length after making it plain, so a name of 80 ending in an ellipsis is refused", () => {
    const r = checkoutSchema.safeParse({ donor_type: "individual", email: "a@b.co", first_name: `${"a".repeat(79)}…` });
    expect(r.success).toBe(false);
  });

  it("the charity's correction to a receipt's details", () => {
    const r = checkCertificateEdit({ first_name: "Thandi", last_name: "D’Souza", address_line1: "“The Oaks”, 5 Rissik Street", city: "Johannesburg", postal_code: "2001" }, "individual");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.values).toMatchObject({ last_name: "D'Souza", address_line1: '"The Oaks", 5 Rissik Street' });
  });

  it("the details a donor adds after paying", () => {
    const r = checkS18aCompletion({ id_number: "8001015009087", address_line1: "5 O’Reilly Street", city: "Johannesburg", postal_code: "2001" }, "individual");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.address?.address_line1).toBe("5 O'Reilly Street");
  });

  it("a gift the charity records itself", () => {
    const r = checkGift({ date: "05/03/2026", amount: "500", method: "eft", first_name: "Sarah", last_name: "O’Neil", email: "sarah@example.co.za" }, { today: "2026-10-21" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.gift.lastName).toBe("O'Neil");
  });
});
