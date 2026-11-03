import "server-only";
import { decrypt } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLegalForm, type It3dCharity, type It3dDonor, type It3dReceipt } from "./it3d";

/**
 * Gathers what the IT3(d) builder needs for one charity and tax year, on the server only (service role: check
 * the person is the charity's owner first). ID and tax numbers are decrypted here, kept in memory for the file,
 * and never logged or sent to the page.
 *
 * Which donations: those on the charity's ISSUED s18A receipts (withdrawn ones are left out) for that tax year,
 * still paid (refunded and charged-back gifts are left out). The builder keeps those paid inside the period.
 * Names, address and contact details come from the gift's own checkout details, the same record the receipt
 * snapshot was printed from (the snapshot joins the name and address into lines, which SARS wants apart).
 */

const PAGE = 1000;

async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

export async function loadIt3dCharity(charityId: string): Promise<It3dCharity> {
  const db = createAdminClient();
  const [{ data: c, error }, { data: p, error: pError }] = await Promise.all([
    db.from("charities").select("id, name_en, legal_name_en, pbo_number, address_line1, address_line2, suburb, city, postal_code").eq("id", charityId).single(),
    db.from("charity_private").select("contact_name, contact_email, contact_phone, tax_reference_number, legal_form, registration_number").eq("charity_id", charityId).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  if (pError) throw new Error(pError.message);
  return {
    id: c.id as string,
    legalName: (c.legal_name_en as string) ?? "",
    tradingName: (c.name_en as string) ?? "",
    legalForm: isLegalForm(p?.legal_form) ? p.legal_form : null,
    registrationNumber: (p?.registration_number as string | null) ?? null,
    taxReference: (p?.tax_reference_number as string | null) ?? null,
    pboNumber: (c.pbo_number as string | null) ?? null,
    address: { line1: c.address_line1, line2: c.address_line2, suburb: c.suburb, city: c.city, postalCode: c.postal_code },
    contactName: (p?.contact_name as string | null) ?? null,
    contactPhone: (p?.contact_phone as string | null) ?? null,
    contactEmail: (p?.contact_email as string | null) ?? null,
  };
}

/**
 * A stable key for the donor on a receipt, for the DE unique number (field 404): the receipt's donor identity
 * fingerprint (a keyed hash of the donor type and ID, tax or registration number, never the number), written in
 * hex so the number holds letters, digits and dashes only. A receipt from before fingerprints has none: its donor
 * record's id stands in. The same donor gets the same key in every file, so SARS recognises a re-send.
 */
export function donorKeyOf(identity: string | null, donorId: string): string {
  if (identity) {
    const hex = Buffer.from(identity, "base64url").toString("hex");
    if (hex.length >= 40) return hex.slice(0, 40);
  }
  return donorId;
}

export type Gift = { id: string; status: string; paid_at: string | null; amount_cents: number; recorded_method: string | null; details: DetailsRow | null };

/**
 * The donor as the receipt shows them: the newest gift's details (name, address, contact, tax number), the same
 * record the receipt was printed from. Every gift on one receipt shares one donor identity, so the ID number is
 * the one every gift carries; two different ones is a problem the builder reports. `open` decrypts a number.
 */
export function receiptDonor(own: Gift[], open: (v: string | null) => string | null): It3dDonor {
  const newest = [...own].sort((a, b) => (b.paid_at ?? "").localeCompare(a.paid_at ?? ""))[0];
  const det = newest?.details;
  const ids = [...new Set(own.map((g) => open(g.details?.id_number_encrypted ?? null)).filter((x): x is string => Boolean(x)))];
  return {
    type: det?.donor_type ?? "individual",
    firstName: det?.first_name ?? null,
    lastName: det?.last_name ?? null,
    organisationName: det?.organisation_name ?? null,
    registrationNumber: det?.registration_number ?? null,
    idNumber: ids[0] ?? null,
    taxReference: open(det?.tax_reference_encrypted ?? null),
    phone: det?.phone ?? null,
    email: det?.email ?? null,
    address: { line1: det?.address_line1 ?? null, line2: det?.address_line2 ?? null, suburb: det?.suburb ?? null, city: det?.city ?? null, postalCode: det?.postal_code ?? null },
    erased: !det || Boolean(det.erased_at),
    idNumbersDiffer: ids.length > 1,
  };
}

type DetailsRow = {
  donor_type: "individual" | "company" | "trust";
  first_name: string | null;
  last_name: string | null;
  organisation_name: string | null;
  registration_number: string | null;
  phone: string | null;
  email: string | null;
  id_number_encrypted: string | null;
  tax_reference_encrypted: string | null;
  address_line1: string | null;
  address_line2: string | null;
  suburb: string | null;
  city: string | null;
  postal_code: string | null;
  erased_at: string | null;
};

export async function loadIt3dReceipts(charityId: string, taxYear: number): Promise<It3dReceipt[]> {
  const db = createAdminClient();
  const receipts = await all<{ id: string; donor_id: string; donor_identity: string | null; details: { receipt_reference?: string } }>((from, to) =>
    db
      .from("s18a_receipts")
      .select("id, donor_id, donor_identity, details")
      .eq("charity_id", charityId)
      .eq("tax_year", taxYear)
      .eq("status", "issued")
      .order("receipt_number")
      .range(from, to),
  );
  if (!receipts.length) return [];

  const links: { receipt_id: string; donation_id: string }[] = [];
  for (let i = 0; i < receipts.length; i += 200) {
    const ids = receipts.slice(i, i + 200).map((r) => r.id);
    links.push(...(await all<{ receipt_id: string; donation_id: string }>((from, to) =>
      db.from("s18a_receipt_donations").select("receipt_id, donation_id").in("receipt_id", ids).order("donation_id").range(from, to),
    )));
  }

  const gifts = new Map<string, Gift>();
  const donationIds = [...new Set(links.map((l) => l.donation_id))];
  for (let i = 0; i < donationIds.length; i += 200) {
    const { data, error } = await db
      .from("donations")
      .select(
        "id, status, paid_at, amount_cents, recorded_method, donation_checkout_details(donor_type, first_name, last_name, organisation_name, registration_number, phone, email, id_number_encrypted, tax_reference_encrypted, address_line1, address_line2, suburb, city, postal_code, erased_at)",
      )
      .eq("charity_id", charityId)
      .in("id", donationIds.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const d of data ?? []) {
      const det = Array.isArray(d.donation_checkout_details) ? d.donation_checkout_details[0] : d.donation_checkout_details;
      gifts.set(d.id as string, {
        id: d.id as string,
        status: d.status as string,
        paid_at: d.paid_at as string | null,
        amount_cents: Number(d.amount_cents),
        recorded_method: (d.recorded_method as string | null) ?? null,
        details: (det as DetailsRow | undefined) ?? null,
      });
    }
  }

  // A number that can't be decrypted means the encryption key is wrong: an error to fix, never a quiet gap.
  const open = (v: string | null) => (v ? decrypt(v).replace(/\s/g, "") : null);

  return receipts.map((r) => {
    const own = links.filter((l) => l.receipt_id === r.id).map((l) => gifts.get(l.donation_id)).filter((g): g is Gift => Boolean(g));
    return {
      receiptId: r.id,
      receiptNumber: r.details?.receipt_reference ?? null,
      donorKey: donorKeyOf(r.donor_identity, r.donor_id),
      donor: receiptDonor(own, open),
      // Refunded and charged-back gifts stay linked to the receipt but are not reported.
      donations: own
        .filter((g) => g.status === "paid" && g.paid_at)
        .map((g) => ({ id: g.id, paidAt: g.paid_at!, amountCents: g.amount_cents, recordedMethod: g.recorded_method })),
    };
  });
}

/** Tax years with issued receipts for this charity, newest first. */
export async function it3dTaxYears(charityId: string): Promise<number[]> {
  const db = createAdminClient();
  const rows = await all<{ tax_year: number }>((from, to) =>
    db.from("s18a_receipts").select("tax_year").eq("charity_id", charityId).eq("status", "issued").order("tax_year", { ascending: false }).range(from, to),
  );
  return [...new Set(rows.map((r) => r.tax_year))];
}
