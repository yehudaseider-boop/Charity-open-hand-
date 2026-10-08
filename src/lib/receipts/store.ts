import type { SupabaseClient } from "@supabase/supabase-js";
import type { CharityRow, DonorRow, ReceiptDetails } from "./details";
import type { ReceiptStore } from "./issue";
import type { PlanCharity, PlanDonation, PlannedReceipt } from "./plan";

const PAGE = 1000;

/** Read every row of a query, a page at a time (the API returns at most 1000 at once). */
async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

export function supabaseReceiptStore(db: SupabaseClient): ReceiptStore {
  return {
    async listDonations(taxYear) {
      const rows = await all<Record<string, unknown>>((from, to) =>
        db
          .from("donations")
          .select("id, charity_id, donor_id, tax_year, amount_cents, status, wants_18a, paid_at")
          .eq("tax_year", taxYear)
          .eq("status", "paid")
          .eq("wants_18a", true)
          .order("id")
          .range(from, to),
      );
      return rows.map(
        (r): PlanDonation => ({
          id: r.id as string,
          charityId: r.charity_id as string,
          donorId: r.donor_id as string,
          taxYear: r.tax_year as number,
          amountCents: Number(r.amount_cents),
          status: r.status as string,
          wants18a: r.wants_18a as boolean,
          paidAt: r.paid_at as string | null,
        }),
      );
    },

    async listCharities(ids) {
      if (ids.length === 0) return [];
      const { data, error } = await db
        .from("charities")
        .select(
          "id, is_s18a, mandate_signed_at, quickgive_code, legal_name_en, legal_name_he, npo_number, pbo_number, s18a_reference, address_line1, address_line2, suburb, city, postal_code",
        )
        .in("id", ids);
      if (error) throw new Error(error.message);
      return (data ?? []).map((c) => ({ ...(c as unknown as CharityRow), id: c.id, isS18a: c.is_s18a, mandateSignedAt: c.mandate_signed_at }) as PlanCharity & CharityRow);
    },

    async receiptedDonationIds(taxYear) {
      const rows = await all<{ donation_id: string }>((from, to) =>
        db
          .from("s18a_receipt_donations")
          .select("donation_id, s18a_receipts!inner(tax_year, status)")
          .eq("s18a_receipts.tax_year", taxYear)
          .eq("s18a_receipts.status", "issued")
          .order("donation_id")
          .range(from, to),
      );
      return new Set(rows.map((r) => r.donation_id));
    },

    async donorDetailsFor(donationIds) {
      const out: { paidAt: string; amountCents: number; donor: DonorRow }[] = [];
      for (let i = 0; i < donationIds.length; i += 200) {
        const chunk = donationIds.slice(i, i + 200);
        const { data, error } = await db
          .from("donations")
          .select(
            "id, paid_at, amount_cents, donation_checkout_details(donor_type, first_name, last_name, organisation_name, registration_number, address_line1, address_line2, suburb, city, postal_code, id_number_last4, tax_reference_last4)",
          )
          .in("id", chunk);
        if (error) throw new Error(error.message);
        for (const d of data ?? []) {
          const details = (Array.isArray(d.donation_checkout_details) ? d.donation_checkout_details[0] : d.donation_checkout_details) as DonorRow | undefined;
          if (!details) throw new Error(`Donation ${d.id} has no donor details`);
          out.push({ paidAt: d.paid_at as string, amountCents: Number(d.amount_cents), donor: details });
        }
      }
      return out;
    },

    async issue(r: PlannedReceipt, charity: CharityRow, details: ReceiptDetails) {
      const { data, error } = await db.rpc("issue_s18a_receipt", {
        p_charity_id: r.charityId,
        p_donor_id: r.donorId,
        p_tax_year: r.taxYear,
        p_donation_ids: r.donationIds,
        p_number_prefix: charity.quickgive_code,
        p_details: details,
      });
      if (error) throw new Error(`Could not issue receipt: ${error.message}`);
      const row = (data as { receipt_id: string; receipt_reference: string }[])[0];
      return { id: row.receipt_id, reference: row.receipt_reference, charityId: r.charityId, details, pdfPath: null };
    },

    async listIssuedWithoutPdf(taxYear) {
      const rows = await all<{ id: string; charity_id: string; details: ReceiptDetails }>((from, to) =>
        db.from("s18a_receipts").select("id, charity_id, details").eq("tax_year", taxYear).eq("status", "issued").is("pdf_path", null).order("id").range(from, to),
      );
      return rows.map((r) => ({
        id: r.id,
        charityId: r.charity_id,
        details: r.details,
        reference: (r.details as unknown as { receipt_reference: string }).receipt_reference,
        pdfPath: null,
      }));
    },

    async savePdf(receipt, pdf) {
      const path = `${receipt.charityId}/${receipt.id}.pdf`;
      const up = await db.storage.from("receipts").upload(path, pdf, { contentType: "application/pdf", upsert: false });
      if (up.error && !/already exists|Duplicate/i.test(up.error.message)) throw new Error(`Upload failed: ${up.error.message}`);
      const { error } = await db.from("s18a_receipts").update({ pdf_path: path }).eq("id", receipt.id).is("pdf_path", null);
      if (error) throw new Error(error.message);
    },
  };
}
