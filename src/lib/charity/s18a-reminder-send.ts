import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { logAudit } from "@/lib/audit";
import { canCompleteS18a, completionWindow, lateDetailsDeadline, s18aDetailsMissing, type MissingDetail, type S18aDetailsRow } from "@/lib/donations/s18a-details";
import { getEmailTransport } from "@/lib/email";
import { mayHaveSent } from "@/lib/email/retry-plan";
import { oneClickStopUrl } from "@/lib/email/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isErasedEmail } from "./dashboard";
import { REMINDER_SKIPS, detailsUrl, mergeMissing, planReminders, s18aReminderEmail, type ReminderCandidate, type ReminderSkip } from "./s18a-reminder";
import { weekStart } from "./thank-you";
import { emailHash, emailHashesToMatch, keyedFromStored, storedEmailHash } from "@/lib/email-fingerprint";
import { messagedThisWeek } from "./weekly-limit";
import { recordAction } from "./charity-actions";
import { readPages } from "./paged";
import { readAllPages } from "./read-pages";
import { nothingLeft } from "@/lib/donations/what-is-left";

/**
 * The s18A filter's "details missing" and the reminder email (CRM step 2, 10/11/2026). Every call here comes after
 * loadCharityForManager (and, for sending, the owner check): it reads with the service role, always filtered by the
 * charity, and hands back only what is missing, never an ID, tax or registration number.
 */

const db = () => createAdminClient();
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const DETAILS = "donor_type, id_number_encrypted, tax_reference_encrypted, registration_number, address_line1, erased_at";

/** The kind of message stored in the weekly claim (charity_donor_thanks.kind). */
export const REMINDER_KIND = "s18a_details_reminder";

/**
 * Donors of this charity with at least one gift whose s18A details are still missing and can still be added (the
 * receipt run's "details missing": paid, asked for an s18A receipt, inside the completion window, not on an issued
 * receipt, not erased), with what is missing across those gifts.
 *
 * `earliestYear`, when given, is filled with each donor's earliest tax year that still needs details, so the reminder can
 * name the last day to add them (31 May after that tax year).
 */
export async function loadS18aMissing(charityId: string, now = new Date(), earliestYear?: Map<string, number>): Promise<Map<string, MissingDetail[]>> {
  const window = completionWindow(now);
  type Gift = { id: string; status: string; wants_18a: boolean; tax_year: number | null; donor_id: string; amount_cents: number; refunded_cents: number | null; donation_checkout_details: unknown };
  // Only the tax years whose details can still be added (23/11/2026: last year's gifts were read and then all dropped
  // once its late window had closed, half the rows for nothing). Read four batches of 1 000 at a time.
  const years = window.closedYearOpen ? [window.taxYear, window.taxYear - 1] : [window.taxYear];
  // The gifts already on an issued receipt are read at the same time (24/11/2026: they waited for the gifts, one trip
  // after another). A failure there only counts when some gift needs the answer, as before.
  const issuedRead = issuedReceiptGifts(charityId, years).then((ids) => ({ ids }), (error: unknown) => ({ error }));
  const gifts = await readAllPages<Gift>((from, to, count) =>
    db()
      .from("donations")
      .select(`id, status, wants_18a, tax_year, donor_id, amount_cents, refunded_cents, donation_checkout_details(${DETAILS})`, count ? { count: "exact" } : undefined)
      .eq("charity_id", charityId)
      .eq("status", "paid")
      .eq("wants_18a", true)
      .in("tax_year", years)
      .order("id")
      .range(from, to) as unknown as PromiseLike<{ data: Gift[] | null; error: { message: string } | null; count?: number | null }>,
  );
  const rows: { id: string; status: string; wants_18a: boolean; tax_year: number | null; donor_id: string; details: S18aDetailsRow | null }[] = [];
  for (const g of gifts) {
    // A gift refunded in full in part refunds is a refund, not a gift: no s18A receipt, so no details to ask for.
    if (nothingLeft(g)) continue;
    const d = g.donation_checkout_details as S18aDetailsRow | S18aDetailsRow[] | null;
    const details = Array.isArray(d) ? (d[0] ?? null) : d;
    // Only gifts that lack something are worth checking against issued receipts.
    if (details && !details.erased_at && s18aDetailsMissing(details).length) rows.push({ id: g.id, status: g.status, wants_18a: g.wants_18a, tax_year: g.tax_year, donor_id: g.donor_id, details });
  }
  // Gifts already on an issued receipt: the charity's issued receipts for those years, in one read (23/11/2026: was
  // checked 200 gifts at a time, about 28 trips for 5 500 gifts). A gift is only ever on its own charity's receipt for
  // its own tax year, so this is the same answer; before a year's receipts are issued there are none to read.
  let issued = new Set<string>();
  if (rows.length) {
    const read = await issuedRead;
    if ("error" in read) throw read.error;
    issued = read.ids;
  }
  const out = new Map<string, MissingDetail[]>();
  for (const r of rows) {
    if (!canCompleteS18a(r, r.details, { window, onIssuedReceipt: issued })) continue;
    out.set(r.donor_id, mergeMissing(out.get(r.donor_id) ?? [], s18aDetailsMissing(r.details!)));
    if (earliestYear && r.tax_year !== null) earliestYear.set(r.donor_id, Math.min(earliestYear.get(r.donor_id) ?? r.tax_year, r.tax_year));
  }
  return out;
}

/** The gifts on this charity's issued s18A receipts for these tax years. */
export async function issuedReceiptGifts(charityId: string, years: number[]): Promise<Set<string>> {
  const links = await readAllPages<{ donation_id: string }>((from, to, count) =>
    db()
      .from("s18a_receipt_donations")
      .select("donation_id, s18a_receipts!inner(charity_id, tax_year, status)", count ? { count: "exact" } : undefined)
      .eq("s18a_receipts.charity_id", charityId)
      .eq("s18a_receipts.status", "issued")
      .in("s18a_receipts.tax_year", years)
      .order("donation_id")
      .range(from, to) as unknown as PromiseLike<{ data: { donation_id: string }[] | null; error: { message: string } | null; count?: number | null }>,
  );
  return new Set(links.map((l) => l.donation_id));
}

/** When each of these donors was last sent an s18A reminder by this charity. */
export async function lastReminded(charityId: string, donorIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < donorIds.length; i += 200) {
    const data = await readPages<{ donor_id: string; sent_at: string }>((from, to) =>
      db()
        .from("charity_donor_thanks")
        .select("donor_id, sent_at")
        .eq("charity_id", charityId)
        .eq("kind", REMINDER_KIND)
        .in("donor_id", donorIds.slice(i, i + 200))
        .order("sent_at", { ascending: false })
        .order("id")
        .range(from, to),
    );
    for (const r of data) if (!out.has(r.donor_id as string)) out.set(r.donor_id as string, r.sent_at as string);
  }
  return out;
}

export type Contact = { email: string; greeting: string | null };

/** Each donor's address and greeting from their latest paid gift on Givezy (never a gift the charity recorded: an address Givezy never checked). */
export async function contacts(charityId: string, donorIds: string[]): Promise<{ found: Set<string>; erased: Set<string>; byDonor: Map<string, Contact> }> {
  const found = new Set<string>();
  const erased = new Set<string>();
  const byDonor = new Map<string, Contact>();
  for (let i = 0; i < donorIds.length; i += 200) {
    // Page by page: 200 long-standing donors can hold far more than the 1 000 rows one read returns, and a donor whose
    // gifts fell off the end would look like someone with no paid gift (and be stopped, or enrolled as new).
    const data = await readPages<{ donor_id: string; gateway: string; paid_at: string; amount_cents: number; refunded_cents: number | null; donation_checkout_details: unknown }>((from, to) =>
      db()
        .from("donations")
        .select("donor_id, gateway, paid_at, amount_cents, refunded_cents, donation_checkout_details(email, first_name, donor_type, contact_person, erased_at)")
        .eq("charity_id", charityId)
        .eq("status", "paid")
        .in("donor_id", donorIds.slice(i, i + 200))
        .order("paid_at", { ascending: false })
        .order("id")
        .range(from, to),
    );
    for (const g of data) {
      const id = g.donor_id as string;
      // A gift refunded in full in part refunds is a refund, not a gift (21/11/2026): it neither makes someone a donor
      // here nor gives an address. Erasure still counts from every gift.
      const left = !nothingLeft(g);
      if (left) found.add(id);
      const raw = g.donation_checkout_details as unknown;
      const d = (Array.isArray(raw) ? raw[0] : raw) as { email: string | null; first_name: string | null; donor_type: string; contact_person: string | null; erased_at: string | null } | null;
      if (!d || d.erased_at || isErasedEmail(d.email)) {
        erased.add(id);
        continue;
      }
      if (!left) continue;
      if (g.gateway === "recorded" || !d.email || byDonor.has(id)) continue;
      byDonor.set(id, { email: d.email.trim(), greeting: d.donor_type === "individual" ? d.first_name : (d.contact_person?.split(/\s+/)[0] ?? null) });
    }
  }
  // Erased anywhere means erased: the details of every gift go together.
  for (const id of erased) byDonor.delete(id);
  return { found, erased, byDonor };
}

/**
 * Of these addresses, the ones (as keyed fingerprints) that turned off this charity's emails. With
 * `forDetailsReminder`, the checkout tick "No news or appeals" is not counted: it promised news and appeals only,
 * and the s18A-details reminder is about the donor's own receipt (19/11/2026). Journeys and appeals count every source.
 * 100 addresses a read: each is looked up keyed and, until every row is converted, by its plain hash (24/11/2026).
 */
export async function optedOutHashes(charityId: string, emails: string[], opts: { forDetailsReminder?: boolean } = {}): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < emails.length; i += 100) {
    // This charity's opt-outs and "no emails from charities" overall, as appeals check (stoppedEmails).
    const chunk = emailHashesToMatch(emails.slice(i, i + 100));
    const [mine, any] = await Promise.all([
      (opts.forDetailsReminder
        ? db().from("charity_email_opt_outs").select("email_hash, email_hash_v").eq("charity_id", charityId).in("source", ["stop_link", "charity"])
        : db().from("charity_email_opt_outs").select("email_hash, email_hash_v").eq("charity_id", charityId)
      ).in("email_hash", chunk),
      db().from("thank_you_opt_outs").select("email_hash, email_hash_v").in("email_hash", chunk),
    ]);
    if (mine.error) throw mine.error;
    if (any.error) throw any.error;
    for (const r of [...(mine.data ?? []), ...(any.data ?? [])]) out.add(keyedFromStored(r.email_hash as string, r.email_hash_v));
  }
  return out;
}

export type ReminderResult = {
  sent: number;
  failed: number;
  /** Sends cut off part way (a dropped connection): they may have gone, so the donor's week stays used. */
  unknown: number;
  remaining: number;
  skipped: Record<ReminderSkip, number>;
  /** True when something went wrong part way: the counts are what happened before it, the rest are in `remaining`. */
  interrupted: boolean;
  /** The dashboard's "what just happened" record, when anything was tried (null when nothing was). */
  done: string | null;
};

/**
 * Send the s18A details reminder to the chosen donors, in the charity's name. Each donor's week is claimed first
 * (the same claim as the personal thank-you, so the two share the one-a-week limit and two presses at once can't
 * both send), and handed back if the email couldn't go. Stops when the time runs out: the rest are reported as still
 * to send. Whatever happens in the loop (a time-out, a database hiccup), the audit entry and the dashboard's "what
 * just happened" record are written with the counts so far, so the charity sees what went before the problem.
 * Audit-logged with counts only.
 */
export async function sendS18aReminders(args: {
  charityId: string;
  charityName: string;
  donorIds: string[];
  userId: string;
  replyTo: string | null;
  now?: Date;
  budgetMs?: number;
}): Promise<ReminderResult> {
  const started = Date.now();
  const budget = args.budgetMs ?? 40_000;
  const now = args.now ?? new Date();
  // Before anything is claimed: a sending set-up problem must not use up anyone's week.
  const transport = getEmailTransport();
  const donorIds = [...new Set(args.donorIds)];
  const earliest = new Map<string, number>();
  const [missing, who] = await Promise.all([loadS18aMissing(args.charityId, now, earliest), contacts(args.charityId, donorIds)]);
  const withEmail = donorIds.flatMap((id) => {
    const c = who.byDonor.get(id);
    return c ? [{ donorId: id, email: c.email }] : [];
  });
  const [stopped, recent] = await Promise.all([optedOutHashes(args.charityId, withEmail.map((d) => d.email), { forDetailsReminder: true }), messagedThisWeek(args.charityId, withEmail, now)]);
  const candidates: (ReminderCandidate & { contact: Contact | null })[] = donorIds.map((id) => {
    const contact = who.byDonor.get(id) ?? null;
    return {
      donorId: id,
      found: who.found.has(id),
      email: contact?.email ?? null,
      erased: who.erased.has(id),
      missing: missing.get(id) ?? [],
      optedOut: contact ? stopped.has(emailHash(contact.email)) : false,
      messagedThisWeek: recent.has(id),
      contact,
    };
  });
  const plan = planReminders(candidates);
  const site = (process.env.SITE_URL ?? "").replace(/\/+$/, "");
  const week = weekStart(now);
  let sent = 0;
  let failed = 0;
  let unknown = 0;
  let remaining = 0;
  let interrupted = false;
  let at = 0;
  try {
    for (; at < plan.send.length; at++) {
      const c = plan.send[at];
      if (Date.now() - started >= budget) {
        remaining++;
        continue;
      }
      const claim = await db()
        .from("charity_donor_thanks")
        .insert({ charity_id: args.charityId, donor_id: c.donorId, week_start: week, kind: REMINDER_KIND, body: "A reminder to add the details for an s18A receipt.", sent_by: args.userId })
        .select("id")
        .single();
      if (claim.error) {
        // Someone else sent this donor a message a moment ago.
        if (claim.error.code === "23505") {
          plan.skipped.this_week++;
          continue;
        }
        throw claim.error;
      }
      const release = () => db().from("charity_donor_thanks").delete().eq("id", claim.data.id);
      const token = randomBytes(32).toString("base64url");
      const saved = await db().from("charity_email_stop_tokens").insert({ token_hash: sha(token), charity_id: args.charityId, ...storedEmailHash(c.contact!.email) });
      if (saved.error) {
        await release();
        failed++;
        continue;
      }
      try {
        const outcome = await transport.send(
          s18aReminderEmail(c.contact!.email, {
            charityName: args.charityName,
            firstName: c.contact!.greeting,
            missing: c.missing,
            deadline: earliest.has(c.donorId) ? lateDetailsDeadline(earliest.get(c.donorId)!) : undefined,
            detailsUrl: detailsUrl(site),
            stopUrl: `${site}/news/stop?t=${token}`,
            oneClickUrl: oneClickStopUrl(site, "news", token),
            replyTo: args.replyTo,
          }),
        );
        if (outcome === "sent") sent++;
        else {
          // "skipped" (email not switched on here): not a send, so the week is handed back.
          await release();
          failed++;
        }
      } catch (e) {
        console.error("[s18a-reminder] not sent", e instanceof Error ? e.message : e);
        if (mayHaveSent(e)) {
          // Cut off or a dropped connection: it may have gone. The week stays claimed, so it is never sent twice.
          unknown++;
        } else {
          await release();
          failed++;
        }
      }
    }
  } catch (e) {
    // Stopped part way. The donor being sent to and everyone after are still to send: nobody gets it twice, because
    // anyone who got one has their week claimed.
    console.error("[s18a-reminder] stopped part way", e instanceof Error ? e.message : e);
    interrupted = true;
    remaining += plan.send.length - at;
  }
  const counts = { sent, failed, remaining, ...(unknown ? { unknown } : {}), ...(interrupted ? { interrupted: true } : {}) };
  // Each record is written even if the other can't be: a failed audit write must not hide what was sent.
  await logAudit({ actorUserId: args.userId, action: "charity.s18a_reminders_sent", entityType: "charity", entityId: args.charityId, details: { chosen: donorIds.length, ...counts, ...plan.skipped } }).catch(
    (e: unknown) => console.error("[s18a-reminder] audit not written", e instanceof Error ? e.message : e),
  );
  let done: string | null = null;
  if (sent || failed || unknown || remaining) {
    done = await recordAction(args.charityId, args.userId, "s18a_reminders_sent", { ...counts, ...Object.fromEntries(REMINDER_SKIPS.map((k) => [`skipped_${k}`, plan.skipped[k]])) }, null).catch((e: unknown) => {
      console.error("[s18a-reminder] dashboard record not written", e instanceof Error ? e.message : e);
      return null;
    });
  }
  return { sent, failed, unknown, remaining, skipped: plan.skipped, interrupted, done };
}
