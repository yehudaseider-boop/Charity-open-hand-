import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { logAudit } from "@/lib/audit";
import { onIssuedReceipt } from "@/lib/donations/s18a-complete";
import { canCompleteS18a, completionWindow, s18aDetailsMissing, type MissingDetail, type S18aDetailsRow } from "@/lib/donations/s18a-details";
import { getEmailTransport } from "@/lib/email";
import { oneClickStopUrl } from "@/lib/email/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isErasedEmail } from "./dashboard";
import { REMINDER_SKIPS, detailsUrl, mergeMissing, planReminders, s18aReminderEmail, type ReminderCandidate, type ReminderSkip } from "./s18a-reminder";
import { emailHash, weekStart } from "./thank-you";
import { messagedThisWeek } from "./weekly-limit";
import { recordAction } from "./charity-actions";

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
 */
export async function loadS18aMissing(charityId: string, now = new Date()): Promise<Map<string, MissingDetail[]>> {
  const window = completionWindow(now);
  const rows: { id: string; status: string; wants_18a: boolean; tax_year: number | null; donor_id: string; details: S18aDetailsRow | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db()
      .from("donations")
      .select(`id, status, wants_18a, tax_year, donor_id, donation_checkout_details(${DETAILS})`)
      .eq("charity_id", charityId)
      .eq("status", "paid")
      .eq("wants_18a", true)
      .in("tax_year", [window.taxYear, window.taxYear - 1])
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    for (const g of data ?? []) {
      const d = g.donation_checkout_details as unknown as S18aDetailsRow | S18aDetailsRow[] | null;
      const details = Array.isArray(d) ? (d[0] ?? null) : d;
      // Only gifts that lack something are worth checking against issued receipts.
      if (details && !details.erased_at && s18aDetailsMissing(details).length) rows.push({ ...(g as unknown as (typeof rows)[number]), details });
    }
    if (!data || data.length < 1000) break;
  }
  const issued = new Set<string>();
  for (let i = 0; i < rows.length; i += 200) for (const id of await onIssuedReceipt(db(), rows.slice(i, i + 200).map((r) => r.id))) issued.add(id);
  const out = new Map<string, MissingDetail[]>();
  for (const r of rows) {
    if (!canCompleteS18a(r, r.details, { window, onIssuedReceipt: issued })) continue;
    out.set(r.donor_id, mergeMissing(out.get(r.donor_id) ?? [], s18aDetailsMissing(r.details!)));
  }
  return out;
}

/** When each of these donors was last sent an s18A reminder by this charity. */
export async function lastReminded(charityId: string, donorIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < donorIds.length; i += 200) {
    const { data, error } = await db()
      .from("charity_donor_thanks")
      .select("donor_id, sent_at")
      .eq("charity_id", charityId)
      .eq("kind", REMINDER_KIND)
      .in("donor_id", donorIds.slice(i, i + 200))
      .order("sent_at", { ascending: false });
    if (error) throw error;
    for (const r of data ?? []) if (!out.has(r.donor_id as string)) out.set(r.donor_id as string, r.sent_at as string);
  }
  return out;
}

type Contact = { email: string; greeting: string | null };

/** Each donor's address and greeting from their latest paid gift on Givezy (never a gift the charity recorded: an address Givezy never checked). */
async function contacts(charityId: string, donorIds: string[]): Promise<{ found: Set<string>; erased: Set<string>; byDonor: Map<string, Contact> }> {
  const found = new Set<string>();
  const erased = new Set<string>();
  const byDonor = new Map<string, Contact>();
  for (let i = 0; i < donorIds.length; i += 200) {
    const { data, error } = await db()
      .from("donations")
      .select("donor_id, gateway, paid_at, donation_checkout_details(email, first_name, donor_type, contact_person, erased_at)")
      .eq("charity_id", charityId)
      .eq("status", "paid")
      .in("donor_id", donorIds.slice(i, i + 200))
      .order("paid_at", { ascending: false });
    if (error) throw error;
    for (const g of data ?? []) {
      const id = g.donor_id as string;
      found.add(id);
      const raw = g.donation_checkout_details as unknown;
      const d = (Array.isArray(raw) ? raw[0] : raw) as { email: string | null; first_name: string | null; donor_type: string; contact_person: string | null; erased_at: string | null } | null;
      if (!d || d.erased_at || isErasedEmail(d.email)) {
        erased.add(id);
        continue;
      }
      if (g.gateway === "recorded" || !d.email || byDonor.has(id)) continue;
      byDonor.set(id, { email: d.email.trim(), greeting: d.donor_type === "individual" ? d.first_name : (d.contact_person?.split(/\s+/)[0] ?? null) });
    }
  }
  // Erased anywhere means erased: the details of every gift go together.
  for (const id of erased) byDonor.delete(id);
  return { found, erased, byDonor };
}

/** Addresses (as hashes) that turned off this charity's emails. */
async function optedOutHashes(charityId: string, hashes: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < hashes.length; i += 200) {
    // This charity's opt-outs and "no emails from charities" overall, as appeals check (stoppedEmails).
    const chunk = hashes.slice(i, i + 200);
    const [mine, any] = await Promise.all([
      db().from("charity_email_opt_outs").select("email_hash").eq("charity_id", charityId).in("email_hash", chunk),
      db().from("thank_you_opt_outs").select("email_hash").in("email_hash", chunk),
    ]);
    if (mine.error) throw mine.error;
    if (any.error) throw any.error;
    for (const r of [...(mine.data ?? []), ...(any.data ?? [])]) out.add(r.email_hash as string);
  }
  return out;
}

export type ReminderResult = {
  sent: number;
  failed: number;
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
  const [missing, who] = await Promise.all([loadS18aMissing(args.charityId, now), contacts(args.charityId, donorIds)]);
  const withEmail = donorIds.flatMap((id) => {
    const c = who.byDonor.get(id);
    return c ? [{ donorId: id, hash: emailHash(c.email) }] : [];
  });
  const [stopped, recent] = await Promise.all([optedOutHashes(args.charityId, withEmail.map((d) => d.hash)), messagedThisWeek(args.charityId, withEmail, now)]);
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
      const saved = await db().from("charity_email_stop_tokens").insert({ token_hash: sha(token), charity_id: args.charityId, email_hash: emailHash(c.contact!.email) });
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
        await release();
        failed++;
      }
    }
  } catch (e) {
    // Stopped part way. The donor being sent to and everyone after are still to send: nobody gets it twice, because
    // anyone who got one has their week claimed.
    console.error("[s18a-reminder] stopped part way", e instanceof Error ? e.message : e);
    interrupted = true;
    remaining += plan.send.length - at;
  }
  const counts = { sent, failed, remaining, ...(interrupted ? { interrupted: true } : {}) };
  // Each record is written even if the other can't be: a failed audit write must not hide what was sent.
  await logAudit({ actorUserId: args.userId, action: "charity.s18a_reminders_sent", entityType: "charity", entityId: args.charityId, details: { chosen: donorIds.length, ...counts, ...plan.skipped } }).catch(
    (e: unknown) => console.error("[s18a-reminder] audit not written", e instanceof Error ? e.message : e),
  );
  let done: string | null = null;
  if (sent || failed || remaining) {
    done = await recordAction(args.charityId, args.userId, "s18a_reminders_sent", { ...counts, ...Object.fromEntries(REMINDER_SKIPS.map((k) => [`skipped_${k}`, plan.skipped[k]])) }, null).catch((e: unknown) => {
      console.error("[s18a-reminder] dashboard record not written", e instanceof Error ? e.message : e);
      return null;
    });
  }
  return { sent, failed, remaining, skipped: plan.skipped, interrupted, done };
}
