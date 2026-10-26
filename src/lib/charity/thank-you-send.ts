import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { logAudit } from "@/lib/audit";
import { getEmailTransport } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { isErasedEmail } from "./dashboard";
import { emailHash, monthPeriod, oneDonorThankYouEmail, thankYouEmail, weekStart } from "./thank-you";

export type Recipient = { email: string; firstName: string | null };

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
      .select("id, donation_checkout_details(email, first_name, erased_at)")
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
      const raw = row.donation_checkout_details as unknown;
      const d = (Array.isArray(raw) ? raw[0] : raw) as { email: string | null; first_name: string | null; erased_at: string | null } | null;
      if (!d?.email || d.erased_at || isErasedEmail(d.email)) continue;
      const key = d.email.trim().toLowerCase();
      if (!byEmail.has(key)) byEmail.set(key, { email: d.email.trim(), firstName: d.first_name });
    }
    if (!data || data.length < 1000) break;
  }
  const all = [...byEmail.values()];
  if (!all.length) return [];
  const hashes = all.map((r) => emailHash(r.email));
  const stopped = new Set<string>();
  for (let i = 0; i < hashes.length; i += 200) {
    const { data, error } = await db.from("thank_you_opt_outs").select("email_hash").in("email_hash", hashes.slice(i, i + 200));
    if (error) throw error;
    for (const r of data ?? []) stopped.add(r.email_hash as string);
  }
  return all.filter((r) => !stopped.has(emailHash(r.email)));
}

export type SendResult = { ok: true; sent: number; failed: number; remaining: number; sentThisRun?: number } | { ok: false; message: string };

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
  // never lead to everyone being emailed again).
  if (r.ok && (r.sentThisRun ?? 0) === 0 && r.sent === 0 && r.failed > 0) {
    await db.from("charity_thank_yous").delete().eq("id", claim.data.id);
    return { ok: false, message: "We couldn't send your thank-you just now. Nothing went out, so please try again in a few minutes." };
  }
  return r;
}

/** "Send the rest": carry on with a month's thank-you that stopped part way, with the same words. */
export async function continueThankYou(args: { charityId: string; charityName: string; month: string; userId: string; replyTo?: string | null; budgetMs?: number }): Promise<SendResult> {
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

async function runThankYou(args: { charityId: string; charityName: string; month: string; body: string; userId: string; replyTo?: string | null; budgetMs?: number; thankYouId: string }): Promise<SendResult> {
  const started = Date.now();
  const budget = args.budgetMs ?? 40_000;
  const db = createAdminClient();
  const transport = getEmailTransport();
  const recipients = await thankYouRecipients(args.charityId, args.month);
  const claimed = await claimedHashes(args.thankYouId);
  const site = (process.env.SITE_URL ?? "").replace(/\/+$/, "");
  let stoppedEarly = false;
  let sentThisRun = 0;
  for (const r of recipients) {
    const hash = emailHash(r.email);
    if (claimed.has(hash)) continue;
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
      const outcome = await transport.send(thankYouEmail(r.email, { charityName: args.charityName, firstName: r.firstName, month: args.month, body: args.body, stopUrl: `${site}/thanks/stop?t=${token}`, replyTo: args.replyTo }));
      // "skipped" (email not switched on here, or an address off the allowed list) is not a send.
      if (outcome === "sent") sentThisRun++;
      await mark(outcome === "sent" ? "sent" : "failed");
    } catch (e) {
      console.error("[thank-you] not sent", e instanceof Error ? e.message : e);
      await mark("failed");
    }
  }
  const counts = await thankYouCounts(args.thankYouId);
  const remaining = stoppedEarly ? recipients.filter((r) => !claimed.has(emailHash(r.email))).length : 0;
  await db
    .from("charity_thank_yous")
    .update({ recipient_count: counts.sent, ...(remaining === 0 ? { finished_at: new Date().toISOString() } : {}) })
    .eq("id", args.thankYouId);
  await logAudit({ actorUserId: args.userId, action: "charity.thank_you_sent", entityType: "charity", entityId: args.charityId, details: { month: args.month, ...counts, remaining } });
  return { ok: true, sent: counts.sent, failed: counts.failed, remaining, sentThisRun };
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

/** How far a thank-you got. A "sending" left by a stopped page may have gone, so it is never sent again: counted as failed. */
async function thankYouCounts(thankYouId: string): Promise<{ sent: number; failed: number }> {
  const c = { sent: 0, failed: 0 };
  for (let from = 0; ; from += 1000) {
    const { data, error } = await createAdminClient().from("charity_thank_you_recipients").select("status").eq("thank_you_id", thankYouId).order("email_hash").range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) {
      if (r.status === "sent") c.sent++;
      else c.failed++;
    }
    if (!data || data.length < 1000) break;
  }
  return c;
}

export type DonorThankResult = { ok: true; name: string } | { ok: false; message: string };

/**
 * A charity's personal thank-you to one of its donors (someone with a paid gift to it). At most once a
 * week per donor: the week is claimed first, and handed back if the email couldn't go. Call only after
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
  const { data: gift, error } = await db
    .from("donations")
    .select("id, donation_checkout_details(email, first_name, last_name, donor_type, organisation_name, contact_person, erased_at)")
    .eq("charity_id", args.charityId)
    .eq("donor_id", args.donorId)
    .eq("status", "paid")
    // Only to someone who gave on Givezy (as for appeals): a recorded gift's email was never checked by us.
    .neq("gateway", "recorded")
    .order("paid_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!gift) return { ok: false, message: "This donor has only gifts you recorded yourself, so Givezy can't email them. Thank them directly." };
  const raw = gift?.donation_checkout_details as unknown;
  const d = (Array.isArray(raw) ? raw[0] : raw) as {
    email: string | null; first_name: string | null; last_name: string | null; donor_type: string; organisation_name: string | null; contact_person: string | null; erased_at: string | null;
  } | null;
  if (!d?.email || d.erased_at || isErasedEmail(d.email)) return { ok: false, message: "This donor's details have been removed, so they can't be emailed." };
  const individual = d.donor_type === "individual";
  const name = (individual ? [d.first_name, d.last_name].filter(Boolean).join(" ") : d.organisation_name) || "this donor";
  const greeting = individual ? d.first_name : d.contact_person?.split(/\s+/)[0] ?? null;
  const hash = emailHash(d.email);
  const { data: stopped, error: stopError } = await db.from("thank_you_opt_outs").select("email_hash").eq("email_hash", hash).maybeSingle();
  if (stopError) throw stopError;
  if (stopped) return { ok: false, message: `${name} asked not to get thank-you emails from charities, so nothing was sent.` };

  const claim = await db
    .from("charity_donor_thanks")
    .insert({ charity_id: args.charityId, donor_id: args.donorId, week_start: weekStart(new Date()), body: args.body, sent_by: args.userId })
    .select("id")
    .single();
  if (claim.error) {
    if (claim.error.code === "23505") return { ok: false, message: `You've already thanked ${name} this week, so nothing was sent. You can thank them again from Monday.` };
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
      oneDonorThankYouEmail(d.email.trim(), { charityName: args.charityName, firstName: greeting, body: args.body, stopUrl: `${site}/thanks/stop?t=${token}`, replyTo: args.replyTo }),
    );
    if (outcome !== "sent") {
      await release();
      return { ok: false, message: "Email isn't switched on here, so nothing was sent." };
    }
  } catch (e) {
    console.error("[thank-you] personal thank-you not sent", e instanceof Error ? e.message : e);
    await release();
    return { ok: false, message: "We couldn't send your thank-you just now. Nothing went out, so please try again in a few minutes." };
  }
  await logAudit({ actorUserId: args.userId, action: "charity.donor_thanked", entityType: "charity", entityId: args.charityId, details: { donorId: args.donorId } });
  return { ok: true, name };
}

/** When each of these donors was last thanked personally by this charity (service role: check access first). */
export async function lastThanked(charityId: string, donorIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!donorIds.length) return out;
  const { data, error } = await createAdminClient()
    .from("charity_donor_thanks")
    .select("donor_id, sent_at")
    .eq("charity_id", charityId)
    .in("donor_id", donorIds)
    .order("sent_at", { ascending: false });
  if (error) throw error;
  for (const r of data ?? []) if (!out.has(r.donor_id as string)) out.set(r.donor_id as string, r.sent_at as string);
  return out;
}

/** Which of these addresses asked not to get thank-you emails (service role: check access first). */
export async function optedOut(emails: string[]): Promise<Set<string>> {
  const byHash = new Map(emails.map((e) => [emailHash(e), e.trim().toLowerCase()]));
  const out = new Set<string>();
  if (!byHash.size) return out;
  const { data, error } = await createAdminClient().from("thank_you_opt_outs").select("email_hash").in("email_hash", [...byHash.keys()]);
  if (error) throw error;
  for (const r of data ?? []) {
    const e = byHash.get(r.email_hash as string);
    if (e) out.add(e);
  }
  return out;
}

/** The "stop these emails" link. True when the link was ours (the opt-out is then saved). */
export async function stopThankYous(token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const db = createAdminClient();
  const { data } = await db.from("email_stop_tokens").select("email_hash").eq("token_hash", sha(token)).maybeSingle();
  if (!data) return false;
  const { error } = await db.from("thank_you_opt_outs").upsert({ email_hash: data.email_hash }, { onConflict: "email_hash", ignoreDuplicates: true });
  if (error) throw error;
  return true;
}
