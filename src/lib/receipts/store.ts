import type { SupabaseClient } from "@supabase/supabase-js";
import { isErasedAddress } from "@/lib/email";
import type { CharityRow, DonorRow, ReceiptDetails } from "./details";
import type { IssuedReceipt, ReceiptStore } from "./issue";
import { receiptableCents, type PlanCharity, type PlanDonation, type PlannedReceipt } from "./plan";
import type { StoredDecision } from "./review";
import { s18aDetailsMissing, type S18aDetailsRow } from "@/lib/donations/s18a-details";

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

/** The embedded checkout details' identity fingerprint, "" when there is none. */
function identityOf(embed: unknown): string {
  const row = Array.isArray(embed) ? embed[0] : embed;
  return ((row as { receipt_identity?: string | null } | null | undefined)?.receipt_identity ?? "") || "";
}

/** What a gift's s18A particulars still lack ("Add my details after paying", not yet added). */
function missingOf(embed: unknown): string[] {
  const row = (Array.isArray(embed) ? embed[0] : embed) as S18aDetailsRow | null | undefined;
  return row ? s18aDetailsMissing(row) : [];
}

/** A receipt_plan_decisions row as the review code uses it. */
export function decisionFromRow(r: Record<string, unknown>): StoredDecision {
  return {
    id: r.id as string,
    charityId: r.charity_id as string,
    taxYear: Number(r.tax_year),
    donorId: r.donor_id as string,
    donorIdentity: (r.donor_identity as string | null) ?? "",
    decision: r.decision as StoredDecision["decision"],
    certificateFingerprint: r.certificate_fingerprint as string,
    decidedAt: r.decided_at as string,
    declineEmailedAt: (r.decline_emailed_at as string | null) ?? null,
  };
}

/** How long a send may hold a receipt before another run may take it over. */
const EMAIL_CLAIM_MINUTES = 15;

export function supabaseReceiptStore(db: SupabaseClient): ReceiptStore {
  return {
    async listDonations(taxYear, charityId) {
      const rows = await all<Record<string, unknown>>((from, to) => {
        const q = db
          .from("donations")
          // A donor whose information was erased can no longer be given a receipt (their details are gone), so they are left out.
          .select("id, charity_id, donor_id, tax_year, amount_cents, refunded_cents, receipt_hold, status, wants_18a, paid_at, donation_checkout_details!inner(receipt_identity, erased_at, donor_type, id_number_encrypted, tax_reference_encrypted, registration_number, address_line1)")
          .is("donation_checkout_details.erased_at", null)
          .eq("tax_year", taxYear)
          .eq("status", "paid")
          .eq("wants_18a", true);
        return (charityId ? q.eq("charity_id", charityId) : q).order("id").range(from, to);
      });
      return rows.map(
        (r): PlanDonation => ({
          id: r.id as string,
          charityId: r.charity_id as string,
          donorId: r.donor_id as string,
          donorIdentity: identityOf(r.donation_checkout_details),
          taxYear: r.tax_year as number,
          amountCents: Number(r.amount_cents),
          // Planning leaves out a held gift and counts what is left of each one, as issue_s18a_receipt does.
          refundedCents: Number(r.refunded_cents ?? 0),
          receiptHold: (r.receipt_hold as string | null) ?? null,
          status: r.status as string,
          wants18a: r.wants_18a as boolean,
          paidAt: r.paid_at as string | null,
          detailsMissing: missingOf(r.donation_checkout_details),
        }),
      );
    },

    async listCharities(ids) {
      if (ids.length === 0) return [];
      const { data, error } = await db
        .from("charities")
        .select(
          "id, is_s18a, mandate_signed_at, quickgive_code, legal_name_en, npo_number, pbo_number, s18a_reference, address_line1, address_line2, suburb, city, postal_code",
        )
        .in("id", ids);
      if (error) throw new Error(error.message);
      // When each charity could issue s18A receipts: a gift paid outside these never goes on one (23/11/2026).
      const periods = await db.from("charity_s18a_periods").select("charity_id, started_at, ended_at").in("charity_id", ids);
      if (periods.error) throw new Error(periods.error.message);
      const periodsOf = (id: string) =>
        (periods.data ?? []).filter((p) => p.charity_id === id).map((p) => ({ startedAt: p.started_at as string, endedAt: (p.ended_at as string | null) ?? null }));
      return (data ?? []).map((c) => ({ ...(c as unknown as CharityRow), id: c.id, isS18a: c.is_s18a, mandateSignedAt: c.mandate_signed_at, s18aPeriods: periodsOf(c.id) }) as PlanCharity & CharityRow);
    },

    async receiptedDonationIds(taxYear, charityId) {
      const rows = await all<{ donation_id: string }>((from, to) => {
        const q = db
          .from("s18a_receipt_donations")
          .select("donation_id, s18a_receipts!inner(tax_year, status)")
          .eq("s18a_receipts.tax_year", taxYear)
          .eq("s18a_receipts.status", "issued");
        // One charity's page only needs that charity's (24/11/2026): without this, every charity waiting for a sign-off
        // read every receipted gift of every charity again.
        return (charityId ? q.eq("s18a_receipts.charity_id", charityId) : q).order("donation_id").range(from, to);
      });
      return new Set(rows.map((r) => r.donation_id));
    },

    async listDecisions(taxYear, charityId) {
      const rows = await all<Record<string, unknown>>((from, to) => {
        const q = db
          .from("receipt_plan_decisions")
          .select("id, charity_id, tax_year, donor_id, donor_identity, decision, certificate_fingerprint, decided_at, decline_emailed_at")
          .eq("tax_year", taxYear);
        return (charityId ? q.eq("charity_id", charityId) : q).order("id").range(from, to);
      });
      return rows.map(decisionFromRow);
    },

    async donorDetailsFor(donationIds) {
      const out: { id: string; paidAt: string; amountCents: number; recordedMethod: string | null; paymentChannel: string | null; donor: DonorRow }[] = [];
      for (let i = 0; i < donationIds.length; i += 200) {
        const chunk = donationIds.slice(i, i + 200);
        const { data, error } = await db
          .from("donations")
          .select(
            "id, paid_at, amount_cents, refunded_cents, recorded_method, payment_channel, donation_checkout_details(donor_type, first_name, last_name, organisation_name, registration_number, address_line1, address_line2, suburb, city, postal_code, id_number_last4, tax_reference_last4)",
          )
          .in("id", chunk);
        if (error) throw new Error(error.message);
        for (const d of data ?? []) {
          const details = (Array.isArray(d.donation_checkout_details) ? d.donation_checkout_details[0] : d.donation_checkout_details) as DonorRow | undefined;
          if (!details) throw new Error(`Donation ${d.id} has no donor details`);
          // Each line shows what is left of the gift after partial refunds, so the lines add up to the receipt's total.
          out.push({ id: d.id as string, paidAt: d.paid_at as string, amountCents: receiptableCents({ amountCents: Number(d.amount_cents), refundedCents: Number(d.refunded_cents ?? 0) }), recordedMethod: (d.recorded_method as string | null) ?? null, paymentChannel: (d.payment_channel as string | null) ?? null, donor: details });
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
        p_donor_identity: r.donorIdentity,
      });
      if (error) throw new Error(`Could not issue receipt: ${error.message}`);
      const row = (data as { receipt_id: string; receipt_reference: string }[])[0];
      return { id: row.receipt_id, reference: row.receipt_reference, charityId: r.charityId, details, pdfPath: null };
    },

    async listIssuedWithoutPdf(taxYear, charityId) {
      const rows = await all<{ id: string; charity_id: string; details: ReceiptDetails }>((from, to) => {
        const q = db.from("s18a_receipts").select("id, charity_id, details").eq("tax_year", taxYear).eq("status", "issued").is("pdf_path", null);
        return (charityId ? q.eq("charity_id", charityId) : q).order("id").range(from, to);
      });
      return rows.map((r) => ({
        id: r.id,
        charityId: r.charity_id,
        details: r.details,
        reference: (r.details as unknown as { receipt_reference: string }).receipt_reference,
        pdfPath: null,
      }));
    },

    async listToEmail(taxYear, charityId, receiptId) {
      type Row = {
        id: string;
        charity_id: string;
        details: ReceiptDetails;
        pdf_path: string;
        s18a_receipt_donations: { donations: { status: string; receipt_hold: string | null; paid_at: string; donation_checkout_details: { email: string } | { email: string }[] | null } | null }[];
      };
      const rows = await all<Row>((from, to) => {
        const q = db
          .from("s18a_receipts")
          .select("id, charity_id, details, pdf_path, s18a_receipt_donations(donations(status, receipt_hold, paid_at, donation_checkout_details(email)))")
          .eq("tax_year", taxYear)
          .eq("status", "issued")
          .not("pdf_path", "is", null)
          .is("emailed_at", null);
        const one = receiptId ? q.eq("id", receiptId) : q;
        return (charityId ? one.eq("charity_id", charityId) : one).order("id").range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;
      });
      const out: (IssuedReceipt & { email: string })[] = [];
      for (const r of rows) {
        const donations = r.s18a_receipt_donations.map((l) => l.donations).filter((d): d is NonNullable<typeof d> => d !== null);
        // A gift refunded or charged back since issue makes the receipt wrong: a person voids and
        // re-issues it (receipt.needs_reissue in the audit log). It is never emailed as it stands.
        if (donations.some((d) => d.status !== "paid")) continue;
        // A gift held since issue (a dispute opened, a refund to check) waits for a person: the receipt is emailed
        // once the hold is released, or withdrawn if the gift was refunded (review 20/11/2026).
        if (donations.some((d) => d.receipt_hold)) continue;
        // The donor's email as typed with their most recent donation on the receipt.
        donations.sort((a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime());
        const raw = donations[0]?.donation_checkout_details;
        const email = (Array.isArray(raw) ? raw[0] : raw)?.email;
        // A donor erased since the receipt was issued has no address left to send to; the receipt is
        // not counted as emailed, so the admin page does not say it was.
        if (!email || isErasedAddress(email)) continue;
        out.push({
          id: r.id,
          charityId: r.charity_id,
          details: r.details,
          reference: (r.details as unknown as { receipt_reference: string }).receipt_reference,
          pdfPath: r.pdf_path,
          email,
        });
      }
      return out;
    },

    async readPdf(receipt) {
      const { data, error } = await db.storage.from("receipts").download(receipt.pdfPath ?? `${receipt.charityId}/${receipt.id}.pdf`);
      if (error || !data) throw new Error(`Could not read the PDF for ${receipt.reference}`);
      return Buffer.from(await data.arrayBuffer());
    },

    async claimEmail(receipt) {
      // A send that may already have gone (cut off or dropped mid-way, 13/11/2026) is never sent again by a run: it is
      // flagged for a person (email_retries "unknown", in Givezy's daily email), whatever the age of its claim.
      const { data: maybeSent, error: retryError } = await db
        .from("email_retries")
        .select("id")
        .eq("kind", "s18a_receipt")
        .eq("ref_id", receipt.id)
        .eq("status", "unknown")
        .limit(1);
      if (retryError) throw new Error(retryError.message);
      if (maybeSent?.length) return false;
      // Only an issued receipt: one withdrawn since it was listed (a refund, or Withdraw in Admin) is left alone, as
      // guard_receipt_immutable refuses any change to a void row (review 23/11/2026). The same for the writes below.
      const { data, error } = await db
        .from("s18a_receipts")
        .update({ email_claimed_at: new Date().toISOString() })
        .eq("id", receipt.id)
        .eq("status", "issued")
        .is("emailed_at", null)
        .is("email_claimed_at", null)
        .select("id");
      if (error) throw new Error(error.message);
      if (data?.length) return true;
      // The claim is a lock for the minutes a send takes. One older than that was cut off mid-send, so the email may have
      // gone: it is never taken over and sent again by a run (23/11/2026). It is flagged for a person ("It arrived" or
      // "Send again" on the receipts page), as a cut-off send is, and left alone.
      const stale = new Date(Date.now() - EMAIL_CLAIM_MINUTES * 60_000).toISOString();
      const { data: old, error: oldError } = await db
        .from("s18a_receipts")
        .select("id")
        .eq("id", receipt.id)
        .eq("status", "issued")
        .is("emailed_at", null)
        .lt("email_claimed_at", stale);
      if (oldError) throw new Error(oldError.message);
      if (old?.length) {
        const now = new Date().toISOString();
        const { error: flagError } = await db.from("email_retries").upsert(
          { kind: "s18a_receipt", ref_id: receipt.id, payload: {}, tries: 1, status: "unknown", next_try_at: now, claimed_at: null, last_error: "A run that was sending this stopped part-way; it may have gone.", updated_at: now },
          { onConflict: "kind,ref_id" },
        );
        // A table not there yet (before its migration) or a failed write must not stop the other receipts: it is flagged on the next run.
        if (flagError) console.error(`[receipts] could not flag ${receipt.reference} as maybe sent: ${flagError.message}`);
      }
      return false;
    },

    async markEmailed(receipt) {
      const { error } = await db.from("s18a_receipts").update({ emailed_at: new Date().toISOString() }).eq("id", receipt.id).eq("status", "issued");
      if (error) throw new Error(error.message);
    },

    async releaseEmail(receipt) {
      const { error } = await db.from("s18a_receipts").update({ email_claimed_at: null }).eq("id", receipt.id).eq("status", "issued").is("emailed_at", null);
      if (error) throw new Error(error.message);
    },

    async savePdf(receipt, pdf) {
      const path = `${receipt.charityId}/${receipt.id}.pdf`;
      const up = await db.storage.from("receipts").upload(path, pdf, { contentType: "application/pdf", upsert: false });
      if (up.error && !/already exists|Duplicate/i.test(up.error.message)) throw new Error(`Upload failed: ${up.error.message}`);
      const { error } = await db.from("s18a_receipts").update({ pdf_path: path }).eq("id", receipt.id).eq("status", "issued").is("pdf_path", null);
      if (error) throw new Error(error.message);
    },
  };
}
