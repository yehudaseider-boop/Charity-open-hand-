import "server-only";
import { platformConfig } from "@/config/platform";
import { logAudit } from "@/lib/audit";
import { taxYearRange } from "@/lib/dates";
import { getEmailTransport, isErasedAddress } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildReceiptDetails, receiptDonorName, type ReceiptDetails } from "./details";
import { decidedPlan, openRun, type ReceiptRun } from "./runs";
import {
  buildDeclineEmail, certificateFingerprint, changedParts, checkCertificateEdit, editRows, fieldsFor,
  type DecidedReceipt, type EditableDetails, type EditableField,
} from "./review";
import { supabaseReceiptStore } from "./store";

/**
 * The charity's check of each planned s18A receipt (09/11/2026): open its preview, approve it, decline it, or
 * correct the donor's name and address. Every function here is called after the caller checked the signed-in
 * person manages the charity (loadCharityForManager), and only for a closed tax year. receipt_plan_decisions is
 * server-only, so this uses the service role.
 */

type DonorType = "individual" | "company" | "trust";
type GiftDetails = { donationId: string; paidAt: string; donorType: DonorType; email: string | null; current: EditableDetails };

export type Certificate = {
  receipt: DecidedReceipt;
  /** Built exactly as the receipt will be, from the gifts' recorded details. */
  details: ReceiptDetails;
  donorName: string;
  donorType: DonorType;
  /** What the form starts with: the latest gift's name and address (what the receipt prints). */
  current: EditableDetails;
  gifts: GiftDetails[];
  /** The list is with Givezy (waiting for sign-off, or being issued): nothing can change until it's taken back. */
  run: ReceiptRun | null;
  /** The next certificate still to check after this one, for "Check the next one". */
  next: { key: string; donorName: string } | null;
};

const EDIT_COLUMNS = "first_name, last_name, organisation_name, address_line1, address_line2, suburb, city, postal_code";

async function giftDetails(donationIds: string[]): Promise<GiftDetails[]> {
  const db = createAdminClient();
  const out: GiftDetails[] = [];
  for (let i = 0; i < donationIds.length; i += 200) {
    const { data, error } = await db
      .from("donations")
      .select(`id, paid_at, donation_checkout_details(donor_type, email, ${EDIT_COLUMNS})`)
      .in("id", donationIds.slice(i, i + 200));
    if (error) throw error;
    for (const d of data ?? []) {
      const det = (Array.isArray(d.donation_checkout_details) ? d.donation_checkout_details[0] : d.donation_checkout_details) as (Record<string, string | null> & { donor_type: DonorType }) | null;
      if (!det) continue;
      const current = Object.fromEntries(EDIT_COLUMNS.split(", ").map((c) => [c, det[c] ?? null])) as EditableDetails;
      out.push({ donationId: d.id as string, paidAt: String(d.paid_at ?? ""), donorType: det.donor_type, email: det.email ?? null, current });
    }
  }
  return out.sort((a, b) => b.paidAt.localeCompare(a.paidAt));
}

/** One planned certificate, found by the key on the charity's list, with everything its page shows. */
export async function loadCertificate(charityId: string, taxYear: number, key: string, now = new Date()): Promise<Certificate | null> {
  if (!/^[0-9a-f]{32}$/.test(key)) return null;
  const { receipts } = await decidedPlan(charityId, taxYear);
  const receipt = receipts.find((r) => r.key === key);
  if (!receipt) return null;
  const store = supabaseReceiptStore(createAdminClient());
  const [charities, rows, gifts, run] = await Promise.all([
    store.listCharities([charityId]),
    store.donorDetailsFor(receipt.donationIds),
    giftDetails(receipt.donationIds),
    openRun(charityId, taxYear),
  ]);
  const charity = charities[0];
  if (!charity || !rows.length || !gifts.length) return null;
  const latest = [...rows].sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())[0];
  const { start, end } = taxYearRange(taxYear);
  const details = buildReceiptDetails({ charity, donor: latest.donor, donations: rows, taxYear, periodStart: start, periodEnd: end, issuedAt: now });

  // The next one to check, in the list's order (by name), for "what next".
  const names = new Map<string, string>();
  const others = receipts.filter((r) => r.status === "to_check" && r.key !== key);
  if (others.length) {
    const latestOf = await giftDetails(others.flatMap((r) => r.donationIds));
    for (const r of others) {
      const g = latestOf.find((x) => r.donationIds.includes(x.donationId));
      if (g) names.set(r.key, receiptDonorName({ donor_type: g.donorType, ...g.current }) || "Name missing");
    }
  }
  const nextKey = [...names.entries()].sort((a, b) => a[1].localeCompare(b[1], "en-ZA"))[0];
  return {
    receipt,
    details,
    donorName: details.donor.name || "Name missing",
    donorType: gifts[0].donorType,
    current: gifts[0].current,
    gifts,
    run,
    next: nextKey ? { key: nextKey[0], donorName: nextKey[1] } : null,
  };
}

export type ReviewFailure = "gone" | "run_open" | "already" | "no_contact" | "issued" | "changed" | "invalid";
type Row = { id: string; decided_at: string };

/** Write (or replace) the charity's decision on one certificate. */
async function saveDecision(charityId: string, r: DecidedReceipt, decision: "approved" | "edited" | "declined", userId: string, note?: string | null): Promise<Row & { previous: Record<string, unknown> | null }> {
  const db = createAdminClient();
  const { data: prev, error: prevError } = await db
    .from("receipt_plan_decisions")
    .select("*")
    .eq("charity_id", charityId).eq("tax_year", r.taxYear).eq("donor_id", r.donorId).eq("donor_identity", r.donorIdentity)
    .maybeSingle();
  if (prevError) throw prevError;
  const { data, error } = await db
    .from("receipt_plan_decisions")
    .upsert(
      {
        charity_id: charityId, tax_year: r.taxYear, donor_id: r.donorId, donor_identity: r.donorIdentity, decision,
        certificate_fingerprint: certificateFingerprint(r), decided_by: userId, decided_at: new Date().toISOString(),
        note: note ?? null, decline_emailed_at: null,
      },
      { onConflict: "charity_id,tax_year,donor_id,donor_identity" },
    )
    .select("id, decided_at")
    .single();
  if (error) throw error;
  return { id: data.id as string, decided_at: data.decided_at as string, previous: (prev as Record<string, unknown> | null) ?? null };
}

type Args = { charityId: string; taxYear: number; key: string; userId: string };

async function find(a: Args): Promise<{ ok: true; cert: Certificate } | { ok: false; why: ReviewFailure }> {
  const cert = await loadCertificate(a.charityId, a.taxYear, a.key);
  if (!cert) return { ok: false, why: "gone" };
  if (cert.run) return { ok: false, why: "run_open" };
  return { ok: true, cert };
}

export type DecisionDone = { ok: true; decisionId: string; decidedAt: string; previous: Record<string, unknown> | null; cert: Certificate };

/** Approve one certificate: it is issued with the list once Givezy signs it off. */
export async function approveCertificate(a: Args): Promise<DecisionDone | { ok: false; why: ReviewFailure }> {
  const f = await find(a);
  if (!f.ok) return f;
  if (f.cert.receipt.status === "approved" || f.cert.receipt.status === "edited") return { ok: false, why: "already" };
  const saved = await saveDecision(a.charityId, f.cert.receipt, "approved", a.userId);
  await logAudit({ actorUserId: a.userId, action: "receipts.certificate_approved", entityType: "charity", entityId: a.charityId, details: { taxYear: a.taxYear, certificate: a.key, gifts: f.cert.receipt.donationIds.length } });
  return { ok: true, decisionId: saved.id, decidedAt: saved.decided_at, previous: saved.previous, cert: f.cert };
}

export type DeclineResult =
  | { ok: true; decisionId: string; emailed: "sent" | "not_sent" | "failed" | "no_address"; cert: Certificate }
  | { ok: false; why: ReviewFailure };

/**
 * Decline one certificate: left out of the run, and the donor is emailed to contact the charity, with the
 * charity's phone and email. The email can't be taken back (the page asks first). Pressed again on a declined
 * one whose email didn't go, it sends the email again; never twice once it went.
 */
export async function declineCertificate(a: Args & { contact: { phone: string | null; email: string | null }; note?: string | null }): Promise<DeclineResult> {
  const phone = a.contact.phone?.trim();
  const email = a.contact.email?.trim();
  if (!phone || !email) return { ok: false, why: "no_contact" };
  const f = await find(a);
  if (!f.ok) return f;
  const r = f.cert.receipt;
  if (r.status === "declined" && r.decision?.declineEmailedAt) return { ok: false, why: "already" };
  const db = createAdminClient();
  let decisionId = r.decision?.id ?? "";
  if (r.status !== "declined") {
    decisionId = (await saveDecision(a.charityId, r, "declined", a.userId, a.note)).id;
    await logAudit({ actorUserId: a.userId, action: "receipts.certificate_declined", entityType: "charity", entityId: a.charityId, details: { taxYear: a.taxYear, certificate: a.key, gifts: r.donationIds.length } });
  }

  const to = f.cert.gifts.find((g) => g.email)?.email ?? null;
  const siteUrl = process.env.SITE_URL ?? "";
  let emailed: "sent" | "not_sent" | "failed" | "no_address" = "not_sent";
  if (!to || isErasedAddress(to)) emailed = "no_address";
  else {
    const { data: c, error } = await db.from("charities").select("name_en").eq("id", a.charityId).single();
    if (error) throw error;
    const mail = buildDeclineEmail({
      donorName: f.cert.donorName, donorType: f.cert.donorType, charityName: c.name_en as string, taxYear: a.taxYear, totalCents: r.totalCents,
      contactPhone: phone, contactEmail: email, siteUrl, platformName: platformConfig.appName,
    });
    try {
      const sent = await getEmailTransport().send({ to, ...mail, replyTo: email });
      emailed = sent === "sent" ? "sent" : "not_sent";
    } catch (e) {
      console.error("[receipts] could not email a declined certificate's donor:", e instanceof Error ? e.message : e);
      emailed = "failed";
    }
  }
  if (emailed === "sent") {
    const { error } = await db.from("receipt_plan_decisions").update({ decline_emailed_at: new Date().toISOString() }).eq("id", decisionId).eq("decision", "declined");
    if (error) console.error("[receipts] the decline email went, but could not be marked sent:", error.message);
  }
  await logAudit({ actorUserId: a.userId, action: "receipts.certificate_decline_email", entityType: "charity", entityId: a.charityId, details: { taxYear: a.taxYear, certificate: a.key, outcome: emailed } });
  return { ok: true, decisionId, emailed, cert: f.cert };
}

/** Back to "to check", from any decision. The removed row is returned so Undo can put it back. */
export async function reopenCertificate(a: Args): Promise<{ ok: true; removed: Record<string, unknown>; cert: Certificate } | { ok: false; why: ReviewFailure }> {
  const f = await find(a);
  if (!f.ok) return f;
  const d = f.cert.receipt.decision;
  if (!d) return { ok: false, why: "already" };
  const { data, error } = await createAdminClient().from("receipt_plan_decisions").delete().eq("id", d.id).eq("charity_id", a.charityId).select("*");
  if (error) throw error;
  if (!data?.length) return { ok: false, why: "changed" };
  await logAudit({ actorUserId: a.userId, action: "receipts.certificate_reopened", entityType: "charity", entityId: a.charityId, details: { taxYear: a.taxYear, certificate: a.key, was: d.decision } });
  return { ok: true, removed: data[0] as Record<string, unknown>, cert: f.cert };
}

export type EditResult =
  | { ok: true; decisionId: string; decidedAt: string; changed: ("name" | "address")[]; restore: { donationId: string; before: Partial<EditableDetails>; after: Partial<EditableDetails> }[]; previous: Record<string, unknown> | null; cert: Certificate; name: string }
  | { ok: false; why: ReviewFailure; fieldErrors?: Record<string, string> };

/**
 * Correct the donor's name and street address on this certificate, then approve it. Written to the recorded
 * details of each of its gifts (which the receipt and the IT3(d) file both read), only while none is on an
 * issued receipt. Never an amount, a date, an ID or tax number, a registration number or the s18A identity:
 * only the columns in fieldsFor() reach the database function, which refuses any other.
 */
export async function editCertificate(a: Args & { input: Record<string, string | undefined> }): Promise<EditResult> {
  const f = await find(a);
  if (!f.ok) return f;
  const check = checkCertificateEdit(a.input, f.cert.donorType);
  if (!check.ok) return { ok: false, why: "invalid", fieldErrors: check.fieldErrors };
  const fields: EditableField[] = fieldsFor(f.cert.donorType);
  const rows = editRows(f.cert.gifts.map((g) => ({ donationId: g.donationId, current: g.current })), check.values, fields);
  if (rows.length) {
    const { error } = await createAdminClient().rpc("correct_receipt_donor_details", {
      p_charity_id: a.charityId,
      p_tax_year: a.taxYear,
      p_rows: rows.map((r) => ({ donation_id: r.donationId, expect: r.before, set: r.after })),
    });
    if (error) return { ok: false, why: rpcFailure(error.message) };
  }
  const changed = changedParts(rows);
  // Nothing actually differed: it is an approval.
  const saved = await saveDecision(a.charityId, f.cert.receipt, rows.length ? "edited" : "approved", a.userId);
  await logAudit({
    actorUserId: a.userId, action: rows.length ? "receipts.certificate_edited" : "receipts.certificate_approved", entityType: "charity", entityId: a.charityId,
    // What changed, never the personal data itself (POPIA): the old and new values stay on the gifts only.
    details: { taxYear: a.taxYear, certificate: a.key, changed, gifts: rows.length },
  });
  const name = receiptDonorName({ donor_type: f.cert.donorType, ...check.values }) || f.cert.donorName;
  return { ok: true, decisionId: saved.id, decidedAt: saved.decided_at, changed, restore: rows, previous: saved.previous, cert: f.cert, name };
}

/** The database function's refusal, in our words. */
export function rpcFailure(message: string): ReviewFailure {
  if (/receipt_details_issued/.test(message)) return "issued";
  if (/receipt_details_changed/.test(message)) return "changed";
  if (/receipt_details_not_found/.test(message)) return "gone";
  throw new Error(message);
}

/** What went wrong, in plain words, with what was kept and what to do now. */
export function reviewFailureText(why: ReviewFailure): string {
  switch (why) {
    case "gone": return "That s18A receipt isn't on your list any more (a gift was refunded, or the receipt was issued). Nothing was changed. Your list below is up to date.";
    case "run_open": return "You've sent this list to Givezy, so it can't change now. Nothing was changed. To change a receipt, take back your approval first (s18A receipts), then try again.";
    case "already": return "That's already done. Nothing was changed.";
    case "no_contact": return "Add your charity's contact phone number and email first (Application, Contact person), so the donor knows how to reach you. Nothing was sent.";
    case "issued": return "A gift on this receipt is already on an issued s18A receipt, so its details can't be changed here. Nothing was changed. Tell us if something is wrong: only we can withdraw and re-issue a receipt.";
    case "changed": return "Someone changed this receipt's details a moment ago. Nothing was changed. The page now shows the latest: check it and try again.";
    case "invalid": return "Please fix the highlighted fields. Nothing was saved yet.";
  }
}
