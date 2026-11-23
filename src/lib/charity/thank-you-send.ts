import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { logAudit } from "@/lib/audit";
import { getEmailTransport, isTemporaryRefusal } from "@/lib/email";
import { oneClickStopUrl } from "@/lib/email/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isErasedEmail } from "./dashboard";
import { emailHash, monthPeriod, oneDonorThankYouEmail, thankYouEmail, weekStart } from "./thank-you";
import { WEEKLY_LIMIT, messagedThisWeek } from "./weekly-limit";
import { JOB_SEND_TIMEOUT_MS, mayHaveSent } from "@/lib/email/retry-plan";
import { isolate } from "@/lib/text";
import { formatDate } from "@/lib/dates";
import { nextWeekStart } from "./journey";
import { nothingLeft } from "@/lib/donations/what-is-left";

/** One address that gave in the month, with the donors it belongs to (for the one-message-a-week rule). */
export type Recipient = { email: string; firstName: string | null; donorIds: string[] };

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Everyone who gave to this charity in the month (paid gifts only), once per address. Leaves out
 * donors who were erased and anyone who asked not to get thank-you emails. Call only after
 * checking the signed-in person manages this charity: it reads with the service role.
 */
export async function thankYouRecipients(charityId: string, month: string): Promise<Recipient[]> {
  const db = createAdminClient();
  const { from, to } = monthPeriod(month);
  const byEmail = new Map<string, Recipient>();
  for (let start = 0; ; start += 1000) {
    const { data, error } = await db
      .from("donations")
      .select("id, donor_id, amount_cents, refunded_cents, donation_checkout_details(email, first_name, erased_at)")
      .eq("charity_id", charityId)
      .eq("status", "paid")
      // Only people who gave on Givezy: a gift the charity recorded itself carries an email Givezy never checked.
      .neq("gateway", "recorded")
      .gte("paid_at", from)
      .lt("paid_at", to)
      .order("id")
      .range(start, start + 999);
    if (error) throw error;
    for (const row of data ?? []) {
      // A gift refunded in full in part refunds is a refund, not a gift: nothing to thank them for (21/11/2026).
      if (nothingLeft(row)) continue;
      const raw = row.donation_checkout_details as unknown;
      const d = (Array.isArray(raw) ? raw[0] : raw) as { email: string | null; first_name: string | null; erased_at: string | null } | null;
      if (!d?.email || d.erased_at || isErasedEmail(d.email)) continue;
      const key = d.email.trim().toLowerCase();
      const had = byEmail.get(key);
      if (!had) byEmail.set(key, { email: d.email.trim(), firstName: d.first_name, donorIds: [row.donor_id as string] });
      else if (!had.donorIds.includes(row.donor_id as string)) had.donorIds.push(row.donor_id as string);
    }
    if (!data || data.length < 1000) break;
  }
  const all = [...byEmail.values()];
  if (!all.length) return [];
  const hashes = all.map((r) => emailHash(r.email));
  const stopped = await stoppedThisCharity(charityId, hashes);
  for (let i = 0; i < hashes.length; i += 200) {
    const { data, error } = await db.from("thank_you_opt_outs").select("email_hash").in("email_hash", hashes.slice(i, i + 200));
    if (error) throw error;
    for (const r of data ?? []) stopped.add(r.email_hash as string);
  }
  return all.filter((r) => !stopped.has(emailHash(r.email)));
}

export type SendResult =
  | {
      ok: true;
      sent: number;
      failed: number;
      remaining: number;
      sentThisRun?: number;
      /** Of `failed`: emails cut off before the email service answered, so they may have gone (never sent again). */
      maybeSent?: number;
      /** Left out this run: they already had a message from the charity this week. The thank-you stays unfinished for them. */
      thisWeek?: number;
      /** When "Send the rest" can reach those left out (the next Monday, dd/mm/yyyy), when any were. */
      from?: string;
      /** The email service said "not now" and this run stopped there (the rest wait; nothing was lost). */
      refused?: true;
    }
  | { ok: false; message: string };

/**
 * Send the charity's thank-you for one month, until the time runs out (a web request can't run for ever).
 * The month is claimed once; each donor's address is claimed (as a hash) before their email goes, so "Send the
 * rest" carries on where a send stopped and nobody is emailed twice.
 */
export async function sendThankYou(args: { charityId: string; charityName: string; month: string; body: string; userId: string; replyTo?: string | null; budgetMs?: number }): Promise<SendResult> {
  const db = createAdminClient();
  // Before claiming the month: a sending set-up problem must not use up the month with nothing sent.
  getEmailTransport();
  const claim = await db
    .from("charity_thank_yous")
    .insert({ charity_id: args.charityId, period_month: args.month, body: args.body, sent_by: args.userId })
    .select("id")
    .single();
  if (claim.error) {
    if (claim.error.code === "23505") return { ok: false, message: "You've already thanked the donors for that month." };
    throw claim.error;
  }
  const r = await runThankYou({ ...args, thankYouId: claim.data.id as string });
  // Nothing went out to anyone: hand the month back, so the charity can try again.
  // Decided from what this run's emails actually did, not the saved statuses (a status that failed to save must
  // never lead to everyone being emailed again). Only when every email surely failed: one cut off ("sending") may
  // have gone, and handing the month back would delete its claim and let a second press email that donor again
  // (review 23/11/2026). Then the month is kept and the page says some may have gone.
  if (r.ok && (r.sentThisRun ?? 0) === 0 && r.sent === 0 && r.failed > 0 && (r.maybeSent ?? 0) === 0) {
    await db.from("charity_thank_yous").delete().eq("id", claim.data.id);
    return { ok: false, message: "We couldn't send your thank-you just now. Nothing went out, so please try again in a few minutes." };
  }
  // Everyone already had a message from the charity this week: hand the month back, so it can go from Monday.
  if (r.ok && (r.sentThisRun ?? 0) === 0 && r.sent === 0 && r.failed === 0 && r.remaining === 0 && (r.thisWeek ?? 0) > 0) {
    await db.from("charity_thank_yous").delete().eq("id", claim.data.id);
    return { ok: false, message: `Everyone who gave that month already had a message from you this week, so nothing was sent. ${WEEKLY_LIMIT} You can send this thank-you from Monday.` };
  }
  return r;
}

/**
 * "Send the rest": carry on with a month's thank-you that stopped part way, with the same words. Also what the daily
 * job calls to carry it on by itself (`userId` null, `auto` true; see ./carry-on-sends).
 */
export async function continueThankYou(args: { charityId: string; charityName: string; month: string; userId: string | null; replyTo?: string | null; budgetMs?: number; auto?: boolean }): Promise<SendResult> {
  const { data, error } = await createAdminClient()
    .from("charity_thank_yous")
    .select("id, body, finished_at")
    .eq("charity_id", args.charityId)
    .eq("period_month", args.month)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, message: "There's no thank-you for that month to finish." };
  if (data.finished_at) return { ok: false, message: "This thank-you has already reached everyone." };
  return runThankYou({ ...args, body: data.body as string, thankYouId: data.id as string });
}

async function runThankYou(args: { charityId: string; charityName: string; month: string; body: string; userId: string | null; replyTo?: string | null; budgetMs?: number; thankYouId: string; auto?: boolean }): Promise<SendResult> {
  const started = Date.now();
  const budget = args.budgetMs ?? 40_000;
  const db = createAdminClient();
  const transport = getEmailTransport();
  const recipients = await thankYouRecipients(args.charityId, args.month);
  const claimed = await claimedHashes(args.thankYouId);
  // One message a week per donor from a charity (09/11/2026): anyone who already had one this week is left out of
  // this thank-you, and counted so the page can say so.
  const waiting = recipients.filter((r) => !claimed.has(emailHash(r.email)));
  const recent = await messagedThisWeek(args.charityId, waiting.flatMap((r) => r.donorIds.map((donorId) => ({ donorId, hash: emailHash(r.email) }))), new Date(), { thankYouId: args.thankYouId });
  const leftOut = new Set(waiting.filter((r) => r.donorIds.some((id) => recent.has(id))).map((r) => emailHash(r.email)));
  const site = (process.env.SITE_URL ?? "").replace(/\/+$/, "");
  let stoppedEarly = false;
  let refused = false;
  let sentThisRun = 0;
  for (const r of recipients) {
    const hash = emailHash(r.email);
    if (claimed.has(hash) || leftOut.has(hash)) continue;
    if (Date.now() - started >= budget) {
      stoppedEarly = true;
      break;
    }
    // Claim this address first. Someone else pressing at the same time gets nothing back and moves on.
    const got = await db.from("charity_thank_you_recipients").upsert({ thank_you_id: args.thankYouId, email_hash: hash }, { onConflict: "thank_you_id,email_hash", ignoreDuplicates: true }).select("email_hash");
    if (got.error) throw got.error;
    claimed.add(hash);
    if (!got.data?.length) continue;
    const mark = async (status: "sent" | "failed") => {
      const { error: markError } = await db.from("charity_thank_you_recipients").update({ status }).eq("thank_you_id", args.thankYouId).eq("email_hash", hash);
      if (markError) console.error("[thank-you] status not saved", markError.message);
    };
    const token = randomBytes(32).toString("base64url");
    const saved = await db.from("email_stop_tokens").insert({ token_hash: sha(token), email_hash: hash });
    if (saved.error) {
      await mark("failed");
      continue;
    }
    try {
      const outcome = await transport.send({
        ...thankYouEmail(r.email, { charityName: args.charityName, firstName: r.firstName, month: args.month, body: args.body, stopUrl: `${site}/thanks/stop?t=${token}`, oneClickUrl: oneClickStopUrl(site, "thanks", token), replyTo: args.replyTo }),
        // From the daily job, each email has a time limit, so a slow email service can't hold up the rest of the job.
        // One cut off may have gone: it is handled below as any dropped connection (never sent again).
        ...(args.auto ? { signal: AbortSignal.timeout(JOB_SEND_TIMEOUT_MS) } : {}),
      });
      // "skipped" (email not switched on here, or an address off the allowed list) is not a send.
      if (outcome === "sent") sentThisRun++;
      await mark(outcome === "sent" ? "sent" : "failed");
    } catch (e) {
      console.error("[thank-you] not sent", e instanceof Error ? e.message : e);
      if (isTemporaryRefusal(e)) {
        // The email service said "not now": nothing went. Hand this address back and stop; "Send the rest" carries on.
        const { error: releaseError } = await db.from("charity_thank_you_recipients").delete().eq("thank_you_id", args.thankYouId).eq("email_hash", hash);
        if (releaseError) console.error("[thank-you] claim not released", releaseError.message);
        else claimed.delete(hash);
        stoppedEarly = true;
        refused = true;
        break;
      }
      // Cut off or a dropped connection: it may have gone, so it stays "sending" (counted as not sent, but still this
      // donor's message for the week, and never sent again). Only a refusal is marked failed.
      if (!mayHaveSent(e)) await mark("failed");
    }
  }
  const counts = await thankYouCounts(args.thankYouId);
  const remaining = stoppedEarly ? recipients.filter((r) => !claimed.has(emailHash(r.email)) && !leftOut.has(emailHash(r.email))).length : 0;
  // Donors left out because they had a message this week haven't had it yet: the thank-you stays unfinished, so
  // "Send the rest" can reach them once their week has passed (it must never use up the month).
  const finished = remaining === 0 && leftOut.size === 0;
  await db
    .from("charity_thank_yous")
    .update({ recipient_count: counts.sent, ...(finished ? { finished_at: new Date().toISOString() } : {}) })
    .eq("id", args.thankYouId);
  await logAudit({ actorUserId: args.userId, action: "charity.thank_you_sent", entityType: "charity", entityId: args.charityId, details: { month: args.month, ...counts, remaining, thisWeek: leftOut.size, sentThisRun, ...(refused ? { refused: true } : {}), ...(args.auto ? { auto: true } : {}) } });
  return { ok: true, sent: counts.sent, failed: counts.failed, maybeSent: counts.maybeSent, remaining, sentThisRun, thisWeek: leftOut.size, ...(leftOut.size ? { from: formatDate(nextWeekStart(new Date())) } : {}), ...(refused ? { refused: true as const } : {}) };
}

/** Addresses (as hashes) already claimed for this thank-you, in pages. */
async function claimedHashes(thankYouId: string): Promise<Set<string>> {
  const out = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await createAdminClient().from("charity_thank_you_recipients").select("email_hash").eq("thank_you_id", thankYouId).order("email_hash").range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) out.add(r.email_hash as string);
    if (!data || data.length < 1000) break;
  }
  return out;
}

/**
 * How far a thank-you got. A "sending" left by a stopped page or a cut-off send may have gone, so it is never sent
 * again: counted as failed (not confirmed), and also in `maybeSent`, so a month where some may have gone is never handed back.
 */
async function thankYouCounts(thankYouId: string): Promise<{ sent: number; failed: number; maybeSent: number }> {
  const c = { sent: 0, failed: 0, maybeSent: 0 };
  for (let from = 0; ; from += 1000) {
    const { data, error } = await createAdminClient().from("charity_thank_you_recipients").select("status").eq("thank_you_id", thankYouId).order("email_hash").range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) {
      if (r.status === "sent") c.sent++;
      else {
        c.failed++;
        if (r.status === "sending") c.maybeSent++;
      }
    }
    if (!data || data.length < 1000) break;
  }
  return c;
}

export type DonorThankResult = { ok: true; name: string } | { ok: false; message: string };

/**
 * A charity's personal thank-you to one of its donors (someone with a paid gift to it). At most one message a
 * week per donor from the charity (thank-yous, reminders, news and appeals, the monthly thank-you): anyone already
 * messaged this week is refused, and the week is claimed first (shared with the s18A details reminder, so two presses
 * can't both send) and handed back if the email couldn't go. Call only after
 * checking the signed-in person manages this charity: it reads with the service role.
 */
export async function sendDonorThankYou(args: {
  charityId: string;
  charityName: string;
  donorId: string;
  body: string;
  userId: string;
  replyTo: string | null;
}): Promise<DonorThankResult> {
  const db = createAdminClient();
  // Their latest paid gift on Givezy with something left: one refunded in full in part refunds is a refund, not a gift.
  let gift: { id: string; donation_checkout_details: unknown } | null = null;
  for (let from = 0; !gift; from += 100) {
    const { data, error } = await db
      .from("donations")
      .select("id, amount_cents, refunded_cents, donation_checkout_details(email, first_name, last_name, donor_type, organisation_name, contact_person, erased_at)")
      .eq("charity_id", args.charityId)
      .eq("donor_id", args.donorId)
      .eq("status", "paid")
      // Only to someone who gave on Givezy (as for appeals): a recorded gift's email was never checked by us.
      .neq("gateway", "recorded")
      .order("paid_at", { ascending: false })
      .order("id")
      .range(from, from + 99);
    if (error) throw error;
    gift = (data ?? []).find((g) => !nothingLeft(g)) ?? null;
    if (!data || data.length < 100) break;
  }
  if (!gift) return { ok: false, message: "This donor has only gifts you recorded yourself or gifts that were refunded, so Givezy can't email them. Thank them directly." };
  const raw = gift?.donation_checkout_details as unknown;
  const d = (Array.isArray(raw) ? raw[0] : raw) as {
    email: string | null; first_name: string | null; last_name: string | null; donor_type: string; organisation_name: string | null; contact_person: string | null; erased_at: string | null;
  } | null;
  if (!d?.email || d.erased_at || isErasedEmail(d.email)) return { ok: false, message: "This donor's details have been removed, so they can't be emailed." };
  const individual = d.donor_type === "individual";
  const name = (individual ? [d.first_name, d.last_name].filter(Boolean).join(" ") : d.organisation_name) || "this donor";
  const greeting = individual ? d.first_name : d.contact_person?.split(/\s+/)[0] ?? null;
  const hash = emailHash(d.email);
  const [{ data: stopped, error: stopError }, fromCharity] = await Promise.all([
    db.from("thank_you_opt_outs").select("email_hash").eq("email_hash", hash).maybeSingle(),
    stoppedThisCharity(args.charityId, [hash]),
  ]);
  if (stopError) throw stopError;
  if (fromCharity.has(hash)) return { ok: false, message: `${isolate(name)} asked not to get emails from you, so nothing was sent.` };
  // The name sits in a sentence on the page: isolated, so a right-to-left name doesn't reorder the words around it.
  if (stopped) return { ok: false, message: `${isolate(name)} asked not to get thank-you emails from charities, so nothing was sent.` };
  const thisWeek = `${isolate(name)} already had a message from you this week, so nothing was sent. ${WEEKLY_LIMIT} You can thank them from Monday.`;
  // A news email, appeal or the monthly thank-you this week counts too, not only a thank-you or reminder.
  if ((await messagedThisWeek(args.charityId, [{ donorId: args.donorId, hash }])).has(args.donorId)) return { ok: false, message: thisWeek };

  const claim = await db
    .from("charity_donor_thanks")
    .insert({ charity_id: args.charityId, donor_id: args.donorId, week_start: weekStart(new Date()), body: args.body, sent_by: args.userId })
    .select("id")
    .single();
  if (claim.error) {
    // One message a week per donor from a charity (09/11/2026): a thank-you or a reminder to add s18A details.
    if (claim.error.code === "23505") return { ok: false, message: thisWeek };
    throw claim.error;
  }
  const release = () => db.from("charity_donor_thanks").delete().eq("id", claim.data.id);
  const token = randomBytes(32).toString("base64url");
  const saved = await db.from("email_stop_tokens").insert({ token_hash: sha(token), email_hash: hash });
  if (saved.error) {
    await release();
    return { ok: false, message: "We couldn't send your thank-you just now. Nothing went out, so please try again in a few minutes." };
  }
  const site = (process.env.SITE_URL ?? "").replace(/\/+$/, "");
  try {
    const outcome = await getEmailTransport().send(
      oneDonorThankYouEmail(d.email.trim(), { charityName: args.charityName, firstName: greeting, body: args.body, stopUrl: `${site}/thanks/stop?t=${token}`, oneClickUrl: oneClickStopUrl(site, "thanks", token), replyTo: args.replyTo }),
    );
    if (outcome !== "sent") {
      await release();
      return { ok: false, message: "Email isn't switched on here, so nothing was sent." };
    }
  } catch (e) {
    console.error("[thank-you] personal thank-you not sent", e instanceof Error ? e.message : e);
    if (mayHaveSent(e)) {
      // Cut off or a dropped connection: it may have reached them. The week stays claimed, so it is never sent twice.
      await logAudit({ actorUserId: args.userId, action: "charity.donor_thanked", entityType: "charity", entityId: args.charityId, details: { donorId: args.donorId, unknown: true } }).catch(() => undefined);
      return { ok: false, message: `The connection dropped while sending, so we can't tell whether your thank-you reached ${isolate(name)}. To be safe it won't be sent again this week, so they never get two. You can thank them again from Monday.` };
    }
    await release();
    return { ok: false, message: "We couldn't send your thank-you just now. Nothing went out, so please try again in a few minutes." };
  }
  await logAudit({ actorUserId: args.userId, action: "charity.donor_thanked", entityType: "charity", entityId: args.charityId, details: { donorId: args.donorId } });
  return { ok: true, name };
}

/** When each of these donors was last thanked personally by this charity (service role: check access first). */
export async function lastThanked(charityId: string, donorIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  // In pages of 200: a busy week's new donors must not make the request too long (review 16/11/2026).
  for (let i = 0; i < donorIds.length; i += 200) {
    const { data, error } = await createAdminClient()
      .from("charity_donor_thanks")
      .select("donor_id, sent_at")
      .eq("charity_id", charityId)
      // Thank-yous only: the same table also holds the week's s18A reminders (they share the one-a-week limit).
      .eq("kind", "thank_you")
      .in("donor_id", donorIds.slice(i, i + 200))
      .order("sent_at", { ascending: false });
    if (error) throw error;
    for (const r of data ?? []) if (!out.has(r.donor_id as string)) out.set(r.donor_id as string, r.sent_at as string);
  }
  return out;
}

/**
 * Which of these addresses asked not to get thank-you emails: from any charity, or (with `charityId`) every email
 * from this charity through its own stop link (service role: check access first). In pages of 200, so a busy week
 * never makes the request too long (review 16/11/2026).
 */
export async function optedOut(emails: string[], charityId?: string): Promise<Set<string>> {
  const byHash = new Map(emails.filter(Boolean).map((e) => [emailHash(e), e.trim().toLowerCase()]));
  const out = new Set<string>();
  if (!byHash.size) return out;
  const hashes = [...byHash.keys()];
  const stopped = charityId ? await stoppedThisCharity(charityId, hashes) : new Set<string>();
  for (let i = 0; i < hashes.length; i += 200) {
    const { data, error } = await createAdminClient().from("thank_you_opt_outs").select("email_hash").in("email_hash", hashes.slice(i, i + 200));
    if (error) throw error;
    for (const r of data ?? []) stopped.add(r.email_hash as string);
  }
  for (const h of stopped) {
    const e = byHash.get(h);
    if (e) out.add(e);
  }
  return out;
}

/**
 * Addresses (as hashes) that stopped every email from this charity: its stop link, or the charity noting it for them
 * (Yehuda, 16/11/2026: "To stop emails from {charity}" must stop its thank-yous too). The checkout tick
 * "No news or appeals" is not counted here: it promised news and appeals only. Confirmations and s18A receipts are
 * never stopped.
 */
export async function stoppedThisCharity(charityId: string, hashes: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < hashes.length; i += 200) {
    const { data, error } = await createAdminClient()
      .from("charity_email_opt_outs")
      .select("email_hash")
      .eq("charity_id", charityId)
      .in("source", ["stop_link", "charity"])
      .in("email_hash", hashes.slice(i, i + 200));
    if (error) throw error;
    for (const r of data ?? []) out.add(r.email_hash as string);
  }
  return out;
}

/** The "stop these emails" link. True when the link was ours (the opt-out is then saved). */
/**
 * Has this stop link's email already stopped thank-yous? Read only. The stop page says "Done" only when this is true
 * (22/11/2026), so a bare "?done=1" opened by hand never claims something was stopped.
 */
export async function thankYousStopped(token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const db = createAdminClient();
  const { data } = await db.from("email_stop_tokens").select("email_hash").eq("token_hash", sha(token)).maybeSingle();
  if (!data) return false;
  const { data: out, error } = await db.from("thank_you_opt_outs").select("email_hash").eq("email_hash", data.email_hash).maybeSingle();
  if (error) throw error;
  return Boolean(out);
}

export async function stopThankYous(token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const db = createAdminClient();
  const { data } = await db.from("email_stop_tokens").select("email_hash").eq("token_hash", sha(token)).maybeSingle();
  if (!data) return false;
  const { error } = await db.from("thank_you_opt_outs").upsert({ email_hash: data.email_hash }, { onConflict: "email_hash", ignoreDuplicates: true });
  if (error) throw error;
  return true;
}
