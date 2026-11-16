import "server-only";
import { logAudit } from "@/lib/audit";
import { legalConfig } from "@/config/legal";
import { decrypt, encrypt, last4, receiptIdentity } from "@/lib/crypto";
import { taxYearName, taxYearRange } from "@/lib/dates";
import { hitRateLimit, ipKeys } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/ids";
import type { FormState } from "@/lib/form";
import { confirmationTokenMatches } from "./confirmation-access";
import {
  canCompleteS18a,
  checkS18aCompletion,
  completionWindow,
  lateDetailsDeadline,
  monthlyGiftsToComplete,
  s18aDetailsMissing,
  sameRegistration,
  waitingForS18aDetails,
  type S18aCompletion,
  type S18aDetailsRow,
} from "./s18a-details";

const NOTHING_CHANGED = "We couldn't save your details just now. Nothing has changed. Please try again.";
const DETAILS_COLUMNS =
  "donation_id, donor_type, id_number_encrypted, id_number_last4, tax_reference_encrypted, registration_number, receipt_identity, address_line1, address_line2, suburb, city, postal_code, erased_at";

type Db = ReturnType<typeof createAdminClient>;
type DetailsRow = S18aDetailsRow & {
  donation_id?: string;
  id_number_last4?: string | null;
  receipt_identity?: string | null;
  address_line2?: string | null;
  suburb?: string | null;
  city?: string | null;
  postal_code?: string | null;
};

/** How a donor reaches a person: the support address once there is one, until then a reply to our emails. */
export function contactUs(): string {
  const email = legalConfig.supportEmail;
  return email ? `contact us at ${email}` : "reply to any email we've sent you";
}

/** Which of these gifts are on an issued s18A receipt (never changed afterwards: the receipt is what it was issued as). */
export async function onIssuedReceipt(db: Db, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data, error } = await db.from("s18a_receipt_donations").select("donation_id, s18a_receipts!inner(status)").in("donation_id", ids).eq("s18a_receipts.status", "issued");
  if (error) throw error;
  return new Set((data ?? []).map((l) => l.donation_id as string));
}

/** Who is completing: the visitor holding the gift's confirmation credential (the thank-you page), or the signed-in donor. */
export type Completer = { token: string } | { userId: string };

/** What the form shows once saved: what is now on the gift, and how to have a mistake put right. */
export type S18aSaved = { idLast4?: string; registrationNumber?: string; address?: string; correction: string };
export type S18aFormState = FormState & { saved?: S18aSaved };

const addressLine = (a: { address_line1?: string | null; address_line2?: string | null; suburb?: string | null; city?: string | null; postal_code?: string | null }) =>
  [a.address_line1, a.address_line2, a.suburb, a.city, a.postal_code].map((x) => x?.trim()).filter(Boolean).join(", ");

/**
 * What one gift's checkout details take from the completion: only what that gift is missing (never a value already
 * there), and the columns that must still be empty for the write to apply, so two saves at once cannot both write.
 */
function patchFor(row: DetailsRow, v: S18aCompletion): { patch: Record<string, string | null>; mustBeEmpty: string[] } | null {
  const missing = s18aDetailsMissing(row);
  const patch: Record<string, string | null> = {};
  const mustBeEmpty: string[] = [];
  if (missing.includes("id_number") && v.idNumber) {
    Object.assign(patch, { id_number_encrypted: encrypt(v.idNumber), id_number_last4: last4(v.idNumber), receipt_identity: receiptIdentity({ donorType: "individual", idNumber: v.idNumber }) });
    mustBeEmpty.push("id_number_encrypted", "tax_reference_encrypted");
  }
  if (missing.includes("registration_number") && v.registrationNumber) {
    Object.assign(patch, { registration_number: v.registrationNumber, receipt_identity: receiptIdentity({ donorType: row.donor_type, registrationNumber: v.registrationNumber }) });
    mustBeEmpty.push("registration_number");
  } else if (row.donor_type !== "individual" && row.registration_number?.trim() && !row.receipt_identity) {
    // A company's or trust's number typed at checkout with "after paying": its receipt identity, which checkout left for now.
    patch.receipt_identity = receiptIdentity({ donorType: row.donor_type, registrationNumber: row.registration_number });
    mustBeEmpty.push("receipt_identity");
  }
  if (missing.includes("address") && v.address) {
    Object.assign(patch, v.address);
    mustBeEmpty.push("address_line1");
  }
  return Object.keys(patch).length ? { patch, mustBeEmpty } : null;
}

/** One conditional write: the gifts' details change only where the target columns are still empty and not erased. */
async function writeDetails(db: Db, ids: string[], donorType: string, p: { patch: Record<string, string | null>; mustBeEmpty: string[] }): Promise<{ ok: true; updated: string[] } | { ok: false }> {
  let q = db.from("donation_checkout_details").update(p.patch).in("donation_id", ids).is("erased_at", null).eq("donor_type", donorType);
  for (const c of p.mustBeEmpty) q = q.is(c, null);
  const { data, error } = await q.select("donation_id");
  if (error) return { ok: false };
  return { ok: true, updated: (data ?? []).map((w) => w.donation_id as string) };
}

type ShapedGift = Parameters<typeof canCompleteS18a>[0] & { details: DetailsRow | null };
const shape = (s: Record<string, unknown>): ShapedGift => {
  const d = s.donation_checkout_details as DetailsRow | DetailsRow[] | null;
  return { ...(s as unknown as Parameters<typeof canCompleteS18a>[0]), details: Array.isArray(d) ? (d[0] ?? null) : d };
};

/**
 * Add the s18A details a donor chose to give after paying (decided 04/11/2026). Written server-only, exactly as
 * checkout writes them: the encrypted SA ID number, its last four digits and the receipt identity fingerprint (or
 * a company's or trust's registration number and its fingerprint), and the address, onto this gift's checkout
 * details. For a monthly donation also onto its first gift (every new monthly gift is copied from it, so future
 * gifts carry them) and its other gifts in the same window that still lack them, paid or still waiting for the
 * payment provider.
 *
 * Only what is missing is written, never over a value already there: an ID or registration number typed that
 * differs from the one on file is refused with a way to reach a person. Every write applies only while the target
 * columns are still empty, and a gift on an issued s18A receipt is never changed (checked again right before
 * writing). Every read is done first, and a failed read changes nothing. Rate-limited, and audit-logged without
 * the ID number.
 *
 * A monthly gift being created at the very moment of saving may still copy the first gift's details from just
 * before: it then shows on the account page as needing details (and the receipt run holds it as "details
 * missing"), so it is never receipted without them.
 */
export async function completeS18aDetails(args: { donationId: string; who: Completer; form: Record<string, unknown>; ip: string; now?: Date }): Promise<S18aFormState> {
  const now = args.now ?? new Date();
  if (!isUuid(args.donationId)) return { ok: false, message: NOTHING_CHANGED };
  const db = createAdminClient();
  const window = completionWindow(now);

  // Only the person who made the donation: the credential from their payment link, or their own account.
  let donorIds: Set<string> | undefined;
  if ("token" in args.who) {
    if (!(await confirmationTokenMatches(args.donationId, args.who.token))) {
      return { ok: false, message: "This link can't be used to add details. Sign in with the email you gave with, and add them from your account. Nothing has changed." };
    }
  } else {
    const { data: donors, error } = await db.from("donors").select("id").eq("user_id", args.who.userId);
    if (error) return { ok: false, message: NOTHING_CHANGED };
    donorIds = new Set((donors ?? []).map((d) => d.id as string));
  }

  const { data: gift, error: giftError } = await db
    .from("donations")
    .select("id, status, wants_18a, tax_year, donor_id, recurring_id, charity_id")
    .eq("id", args.donationId)
    .maybeSingle();
  if (giftError) return { ok: false, message: NOTHING_CHANGED };
  const { data: details, error: detailsError } = await db.from("donation_checkout_details").select(DETAILS_COLUMNS).eq("donation_id", args.donationId).maybeSingle();
  if (detailsError) return { ok: false, message: NOTHING_CHANGED };
  const issued = gift ? await onIssuedReceipt(db, [gift.id as string]).catch(() => null) : new Set<string>();
  if (!issued) return { ok: false, message: NOTHING_CHANGED };
  if (!gift || !canCompleteS18a(gift as Parameters<typeof canCompleteS18a>[0], details as DetailsRow | null, { window, onIssuedReceipt: issued, donorIds })) {
    return { ok: false, message: "This donation doesn't need s18A details added. Nothing has changed. Refresh the page to see it as it is now." };
  }
  const row = details as DetailsRow;
  const missing = s18aDetailsMissing(row);

  const checked = checkS18aCompletion(args.form, row.donor_type, now, missing);
  if (!checked.ok) {
    const n = Object.keys(checked.fieldErrors).length;
    return { ok: false, message: n === 1 ? "Please fix the field marked in red." : `Please fix the ${n} fields marked in red.`, fieldErrors: checked.fieldErrors };
  }
  const keys = "token" in args.who ? [`donation:${args.donationId}`, ...ipKeys(args.ip)] : [`user:${args.who.userId}`];
  if (await hitRateLimit("s18a-details", keys, 10, 60)) {
    return { ok: false, message: "You've tried this several times in the last hour. Nothing has changed. Please wait a while and try again." };
  }
  const v = checked.value;

  // Never over what is on file: a different number typed is refused, with a person to put it right.
  if (v.idNumber && row.id_number_encrypted) {
    let stored: string | null = null;
    try {
      stored = decrypt(row.id_number_encrypted).replace(/\s/g, "");
    } catch (e) {
      console.error(e);
      return { ok: false, message: NOTHING_CHANGED };
    }
    if (stored !== v.idNumber) {
      const msg = `This gift already has an ID number ending in ${row.id_number_last4 || last4(stored)}. If that's wrong, ${contactUs()} and we'll correct it. Nothing has changed.`;
      return { ok: false, message: msg, fieldErrors: { id_number: "This doesn't match the ID number we have for this gift" } };
    }
  }
  if (v.registrationNumber && row.registration_number?.trim() && !sameRegistration(v.registrationNumber, row.registration_number)) {
    const msg = `This gift already has the registration number ${row.registration_number}. If that's wrong, ${contactUs()} and we'll correct it. Nothing has changed.`;
    return { ok: false, message: msg, fieldErrors: { registration_number: "This doesn't match the registration number we have for this gift" } };
  }

  // A monthly donation: its first gift (the source of every new gift) and its other gifts still lacking details.
  // All of it is read before anything is written; any failed read changes nothing.
  const others: ShapedGift[] = [];
  let firstId: string | null = null;
  let firstComplete = false;
  let stillMonthly = false;
  if (gift.recurring_id) {
    const { data: rec, error: recError } = await db.from("recurring_donations").select("id, donor_id, first_donation_id, status").eq("id", gift.recurring_id).maybeSingle();
    if (recError) return { ok: false, message: NOTHING_CHANGED };
    if (rec && rec.donor_id === gift.donor_id) {
      stillMonthly = rec.status === "active" || rec.status === "paused";
      firstId = (rec.first_donation_id as string | null) ?? null;
      const { data: siblings, error: siblingsError } = await db
        .from("donations")
        .select(`id, status, wants_18a, tax_year, donor_id, recurring_id, donation_checkout_details(${DETAILS_COLUMNS})`)
        .eq("recurring_id", rec.id)
        .eq("donor_id", gift.donor_id);
      if (siblingsError) return { ok: false, message: NOTHING_CHANGED };
      const shaped = (siblings ?? []).map((x) => shape(x as Record<string, unknown>));
      const issuedSiblings = await onIssuedReceipt(db, shaped.map((x) => x.id)).catch(() => null);
      if (!issuedSiblings) return { ok: false, message: NOTHING_CHANGED };
      const chosen = new Set(monthlyGiftsToComplete(shaped, { recurringId: rec.id as string, donorId: gift.donor_id as string, firstDonationId: firstId, window, onIssuedReceipt: issuedSiblings }));
      for (const x of shaped) if (x.id !== args.donationId && chosen.has(x.id)) others.push(x);
      // Already complete, the first gift passes its details on as they are.
      const first = shaped.find((x) => x.id === firstId);
      firstComplete = Boolean(first?.details && !first.details.erased_at && s18aDetailsMissing(first.details).length === 0);
    }
  }
  const { data: donor, error: donorError } = await db.from("donors").select("id, id_number_last4, address_line1, address_line2, suburb, city, postal_code").eq("id", gift.donor_id).maybeSingle();
  if (donorError) return { ok: false, message: NOTHING_CHANGED };

  // Right before writing: still not on an issued receipt (a receipt run may have finished since the first look).
  const allIds = [args.donationId, ...others.map((o) => o.id)];
  const issuedNow = await onIssuedReceipt(db, allIds).catch(() => null);
  if (!issuedNow) return { ok: false, message: NOTHING_CHANGED };
  if (issuedNow.has(args.donationId)) {
    return { ok: false, message: "This donation is now on an issued s18A receipt, so its details can't be changed here. Nothing has changed. Refresh the page to see it as it is now." };
  }

  // This gift first: nothing else is written unless it is.
  const mine = patchFor(row, v);
  if (!mine) return { ok: false, message: "This donation doesn't need s18A details added. Nothing has changed. Refresh the page to see it as it is now." };
  const own = await writeDetails(db, [args.donationId], row.donor_type, mine);
  if (!own.ok) return { ok: false, message: NOTHING_CHANGED };
  if (!own.updated.includes(args.donationId)) {
    return { ok: false, message: "These details were added already, perhaps in another window. Nothing has changed here. Refresh the page to see what is on file." };
  }

  // Then the first gift (future gifts), then the others, each only where its own fields are still empty.
  const writable = others.filter((o) => !issuedNow.has(o.id) && o.details);
  const ordered = [...writable.filter((o) => o.id === firstId), ...writable.filter((o) => o.id !== firstId)];
  const updatedOthers: string[] = [];
  let othersFailed = false;
  let firstFailed = false;
  const groups = new Map<string, { ids: string[]; p: NonNullable<ReturnType<typeof patchFor>> }>();
  for (const o of ordered) {
    const p = patchFor(o.details!, v);
    if (!p) continue;
    if (o.id === firstId) {
      const w = await writeDetails(db, [o.id], row.donor_type, p);
      if (!w.ok) firstFailed = othersFailed = true;
      else updatedOthers.push(...w.updated);
      continue;
    }
    const key = p.mustBeEmpty.join(",") + "|" + Object.keys(p.patch).join(",");
    const g = groups.get(key) ?? { ids: [], p };
    g.ids.push(o.id);
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    const w = await writeDetails(db, g.ids, row.donor_type, g.p);
    if (!w.ok) othersFailed = true;
    else updatedOthers.push(...w.updated);
  }
  // Future monthly gifts copy the first gift: only said to be covered when it now has them.
  const futureCovered = Boolean(gift.recurring_id) && (firstComplete || (firstId !== null && (firstId === args.donationId || updatedOthers.includes(firstId))));

  // The donor record, like checkout: only empty fields are filled, never an existing one overwritten.
  if (donor) {
    const fill: Record<string, string> = {};
    const wanted: Record<string, string | null> = { ...(v.idNumber && missing.includes("id_number") ? { id_number_last4: last4(v.idNumber) } : {}), ...(v.address ?? {}) };
    for (const [k, val] of Object.entries(wanted)) if (val && (donor as Record<string, unknown>)[k] == null) fill[k] = val;
    if (Object.keys(fill).length) {
      let q = db.from("donors").update(fill).eq("id", donor.id);
      for (const k of Object.keys(fill)) q = q.is(k, null);
      const { error } = await q;
      // The gift's own details are what the receipt uses; the donor record is a convenience for their next gift.
      if (error) console.error(error);
    }
  }

  await logAudit({
    actorUserId: "userId" in args.who ? args.who.userId : null,
    action: "donor.s18a_details_added",
    entityType: "donation",
    entityId: args.donationId,
    details: {
      via: "token" in args.who ? "thank_you_page" : "account",
      ...(v.idNumber && missing.includes("id_number") ? { id_last4: last4(v.idNumber) } : {}),
      was_missing: missing,
      other_gifts_updated: updatedOthers.length,
      other_gifts_failed: othersFailed,
      future_gifts_covered: futureCovered,
    },
  });

  // What the donor now sees, accurate for this gift's tax year.
  const closed = gift.tax_year !== window.taxYear;
  const when = closed ? `for ${taxYearName(gift.tax_year as number)}` : `after the tax year closes on ${taxYearRange(window.taxYear).end.split("-").reverse().join("/")}`;
  const parts = [`Saved. This gift will be on your s18A receipt ${when}.`];
  if (gift.recurring_id && stillMonthly) {
    if (futureCovered) parts.push("Your future monthly gifts will carry these details too.");
    else if (firstFailed) parts.push(`We couldn't add them to your future monthly gifts just now, so those don't have them yet. Please ${contactUs()} and we'll sort it out.`);
    else parts.push(`Your future monthly gifts don't have them yet. Please ${contactUs()} and we'll add them.`);
  }
  if (othersFailed && !firstFailed) {
    parts.push(`Some of this monthly donation's other gifts weren't updated. Please ${contactUs()} and we'll sort it out.`);
  }
  const saved: S18aSaved = {
    ...(row.donor_type === "individual" ? { idLast4: row.id_number_last4 || (v.idNumber ? last4(v.idNumber) : undefined) } : { registrationNumber: v.registrationNumber ?? row.registration_number ?? undefined }),
    address: addressLine(v.address ?? row) || undefined,
    correction: `Something wrong? ${capitalise(contactUs())} ${closed ? `before ${lateDetailsDeadline(gift.tax_year as number)}` : "before the tax year ends"} and we'll correct it.`,
  };
  return { ok: true, message: parts.join(" "), saved };
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Whether a paid gift's s18A details can be added now, for the thank-you page. Called only once the page has
 * established that the visitor may see this gift (the credential from the payment link, or row-level security).
 * Throws when it can't tell (a failed read): the page then says so rather than "it will be on your receipt".
 */
export async function loadS18aToComplete(donationId: string, who: { token: true } | { userId: string }, now = new Date()): Promise<{ donorType: string; registrationNumber: string | null; missing: ReturnType<typeof s18aDetailsMissing> } | null> {
  if (!isUuid(donationId)) return null;
  const db = createAdminClient();
  const [{ data: gift, error: giftError }, { data: details, error: detailsError }] = await Promise.all([
    db.from("donations").select("id, status, wants_18a, tax_year, donor_id, recurring_id").eq("id", donationId).maybeSingle(),
    db.from("donation_checkout_details").select(DETAILS_COLUMNS).eq("donation_id", donationId).maybeSingle(),
  ]);
  if (giftError) throw giftError;
  if (detailsError) throw detailsError;
  if (!gift || !details) return null;
  const issued = await onIssuedReceipt(db, [donationId]);
  // Without the credential, only the signed-in person's own gift (a charity admin can see the gift, but it isn't theirs to complete).
  let donorIds: Set<string> | undefined;
  if ("userId" in who) {
    const { data: donors, error } = await db.from("donors").select("id").eq("user_id", who.userId);
    if (error) throw error;
    donorIds = new Set((donors ?? []).map((d) => d.id as string));
  }
  const row = details as DetailsRow;
  if (!canCompleteS18a(gift as Parameters<typeof canCompleteS18a>[0], row, { window: completionWindow(now), onIssuedReceipt: issued, donorIds })) return null;
  return { donorType: row.donor_type, registrationNumber: row.registration_number, missing: s18aDetailsMissing(row) };
}

export type GiftNeedingS18a = { id: string; charityName: string; paidAt: string; amountCents: number; recurringId: string | null; donorType: string; registrationNumber: string | null; missing: ReturnType<typeof s18aDetailsMissing> };

/**
 * The signed-in donor's paid gifts that asked for an s18A receipt and still lack its details (inside the completion
 * window, not on an issued receipt), newest first, for the account page's "s18A details still needed". One line per
 * monthly donation: its newest gift that can still be completed (saving it covers the donation's other gifts too).
 */
export async function listS18aToComplete(userId: string, now = new Date()): Promise<GiftNeedingS18a[]> {
  const db = createAdminClient();
  const { data: donors, error: donorsError } = await db.from("donors").select("id").eq("user_id", userId);
  if (donorsError) throw donorsError;
  const donorIds = new Set((donors ?? []).map((d) => d.id as string));
  if (!donorIds.size) return [];
  const window = completionWindow(now);
  const { data, error } = await db
    .from("donations")
    .select(`id, status, wants_18a, tax_year, donor_id, recurring_id, amount_cents, paid_at, charities(name_en), donation_checkout_details(${DETAILS_COLUMNS})`)
    .in("donor_id", [...donorIds])
    .eq("status", "paid")
    .eq("wants_18a", true)
    .in("tax_year", [window.taxYear, window.taxYear - 1])
    .order("paid_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const rows = (data ?? []).map((g) => {
    const d = g.donation_checkout_details as unknown as S18aDetailsRow | S18aDetailsRow[] | null;
    const c = g.charities as unknown as { name_en: string } | { name_en: string }[] | null;
    return { g, details: Array.isArray(d) ? (d[0] ?? null) : d, charityName: (Array.isArray(c) ? c[0]?.name_en : c?.name_en) ?? "A charity" };
  });
  const issued = await onIssuedReceipt(db, rows.map((r) => r.g.id as string));
  // Which gifts can still be completed first, then one line per monthly donation (its newest such gift), so a newest
  // gift that is complete or on an issued receipt never hides an older one that still needs details.
  const seenMonthly = new Set<string>();
  return rows
    .filter((r) => canCompleteS18a(r.g as unknown as Parameters<typeof canCompleteS18a>[0], r.details, { window, onIssuedReceipt: issued, donorIds }))
    .filter((r) => {
      const rec = r.g.recurring_id as string | null;
      if (!rec) return true;
      if (seenMonthly.has(rec)) return false;
      seenMonthly.add(rec);
      return true;
    })
    .map((r) => ({
      id: r.g.id as string,
      charityName: r.charityName,
      paidAt: String(r.g.paid_at),
      amountCents: Number(r.g.amount_cents),
      recurringId: (r.g.recurring_id as string | null) ?? null,
      donorType: r.details!.donor_type,
      registrationNumber: r.details!.registration_number,
      missing: s18aDetailsMissing(r.details!),
    }));
}

/**
 * The signed-in donor's paid gifts (this tax year and the one before) that asked for an s18A receipt and are still
 * waiting for its details, every gift (not one line per monthly donation): the ids the phone app leaves out of
 * "Counts towards your s18A receipts". Read with the server's own access; no new grants (12/11/2026).
 */
export async function giftsWaitingForS18aDetails(userId: string, now = new Date()): Promise<string[]> {
  const db = createAdminClient();
  const { data: donors, error: donorsError } = await db.from("donors").select("id").eq("user_id", userId);
  if (donorsError) throw donorsError;
  const donorIds = (donors ?? []).map((d) => d.id as string);
  if (!donorIds.length) return [];
  const year = completionWindow(now).taxYear;
  const { data, error } = await db
    .from("donations")
    .select(`id, status, wants_18a, donation_checkout_details(${DETAILS_COLUMNS})`)
    .in("donor_id", donorIds)
    .eq("status", "paid")
    .eq("wants_18a", true)
    .in("tax_year", [year, year - 1])
    .order("paid_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  const rows = (data ?? []).map((g) => {
    const d = g.donation_checkout_details as unknown as S18aDetailsRow | S18aDetailsRow[] | null;
    return { gift: { id: g.id as string, status: g.status as string, wants_18a: g.wants_18a as boolean }, details: Array.isArray(d) ? (d[0] ?? null) : d };
  });
  const issued = await onIssuedReceipt(db, rows.map((r) => r.gift.id));
  return rows.filter((r) => waitingForS18aDetails(r.gift, r.details, issued)).map((r) => r.gift.id);
}
