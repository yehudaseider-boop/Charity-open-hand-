import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { logAudit } from "@/lib/audit";
import { getEmailTransport } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { isErasedEmail } from "./dashboard";
import { emailHash, monthPeriod, thankYouEmail } from "./thank-you";

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

export type SendResult = { ok: true; sent: number; failed: number } | { ok: false; message: string };

/** Send the charity's thank-you for one month. Only once per month: the row is claimed first. */
export async function sendThankYou(args: { charityId: string; charityName: string; month: string; body: string; userId: string }): Promise<SendResult> {
  const db = createAdminClient();
  const claim = await db
    .from("charity_thank_yous")
    .insert({ charity_id: args.charityId, period_month: args.month, body: args.body, sent_by: args.userId })
    .select("id")
    .single();
  if (claim.error) {
    if (claim.error.code === "23505") return { ok: false, message: "You've already thanked the donors for that month." };
    throw claim.error;
  }
  const recipients = await thankYouRecipients(args.charityId, args.month);
  const site = (process.env.SITE_URL ?? "").replace(/\/+$/, "");
  const transport = getEmailTransport();
  let sent = 0;
  let failed = 0;
  for (const r of recipients) {
    const token = randomBytes(32).toString("base64url");
    const saved = await db.from("email_stop_tokens").insert({ token_hash: sha(token), email_hash: emailHash(r.email) });
    if (saved.error) {
      failed++;
      continue;
    }
    try {
      await transport.send(thankYouEmail(r.email, { charityName: args.charityName, firstName: r.firstName, month: args.month, body: args.body, stopUrl: `${site}/thanks/stop?t=${token}` }));
      sent++;
    } catch (e) {
      console.error("[thank-you] not sent", e instanceof Error ? e.message : e);
      failed++;
    }
  }
  await db.from("charity_thank_yous").update({ recipient_count: sent }).eq("id", claim.data.id);
  await logAudit({ actorUserId: args.userId, action: "charity.thank_you_sent", entityType: "charity", entityId: args.charityId, details: { month: args.month, sent, failed } });
  return { ok: true, sent, failed };
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
