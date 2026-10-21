import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { logAudit } from "@/lib/audit";
import { getEmailTransport } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { appealEmail, audienceValue, greetingName, type Audience } from "./appeals-rules";
import { isErasedEmail } from "./dashboard";
import { loadDonors, type DonorRow } from "./dashboard-queries";
import { lapsedDaysFor, listSegments, listTags, tagsByDonor } from "./donor-care";
import { donorGroup, donorGroupsFor } from "./insights";
import { emailHash } from "./thank-you";

/**
 * Emails from a charity to its donors. Every call here comes after loadCharityForManager and the owner
 * check; the tables are server-only, so this uses the service role and always filters by the charity.
 */

const db = () => createAdminClient();
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export type AudiencePick = {
  /** Who it would go to: donors with a usable address who haven't said no. */
  donors: DonorRow[];
  /** Donors in the audience who asked not to get news and appeals (from this charity, or thank-yous from any). */
  stopped: number;
  /**
   * Donors whose only gifts are ones the charity recorded (EFT, cash, an import): they never saw the "no news"
   * box at checkout, and the import confirmation covers receipts only, so they are left out until Yosef
   * confirms otherwise (21/10/2026).
   */
  recordedOnly: number;
  label: string;
};

/** Everyone the chosen audience means, less those who said no. Null when the choice is no longer there. */
export async function pickAudience(charityId: string, audience: Audience, now = new Date()): Promise<AudiencePick | null> {
  const all = (await loadDonors(charityId)).filter((d) => d.email && !isErasedEmail(d.email));
  let donors: DonorRow[];
  let label: string;
  switch (audience.kind) {
    case "all":
      donors = all;
      label = "All your donors";
      break;
    case "group": {
      const lapsedDays = await lapsedDaysFor(charityId);
      donors = all.filter((d) => donorGroup(d, now, lapsedDays) === audience.group);
      label = donorGroupsFor(lapsedDays).find((g) => g.key === audience.group)?.label ?? "A group of donors";
      break;
    }
    case "tag": {
      const [tags, byDonor] = await Promise.all([listTags(charityId), tagsByDonor(charityId)]);
      const tag = tags.find((t) => t.id === audience.tagId);
      if (!tag) return null;
      donors = all.filter((d) => (byDonor.get(d.donor_id) ?? []).includes(tag.id));
      label = `Tagged "${tag.name}"`;
      break;
    }
    case "segment": {
      const segment = (await listSegments(charityId)).find((s) => s.id === audience.segmentId);
      if (!segment) return null;
      const [byDonor, lapsedDays] = await Promise.all([tagsByDonor(charityId), lapsedDaysFor(charityId)]);
      const f = segment.filters;
      const needle = (f.q ?? "").toLowerCase();
      donors = all.filter(
        (d) =>
          (!f.group || donorGroup(d, now, lapsedDays) === f.group) &&
          (!f.tag || (byDonor.get(d.donor_id) ?? []).includes(f.tag)) &&
          (!needle || d.display_name.toLowerCase().includes(needle) || d.email.toLowerCase().includes(needle)),
      );
      label = `Your list "${segment.name}"`;
      break;
    }
    case "campaign": {
      const { data: campaign, error } = await db().from("campaigns").select("id, title").eq("id", audience.campaignId).eq("charity_id", charityId).maybeSingle();
      if (error) throw error;
      if (!campaign) return null;
      const gave = new Set<string>();
      for (let from = 0; ; from += 1000) {
        const { data, error: e } = await db().from("donations").select("donor_id").eq("charity_id", charityId).eq("campaign_id", campaign.id).eq("status", "paid").order("id").range(from, from + 999);
        if (e) throw e;
        for (const r of data ?? []) gave.add(r.donor_id as string);
        if (!data || data.length < 1000) break;
      }
      donors = all.filter((d) => gave.has(d.donor_id));
      label = `Gave to "${campaign.title}"`;
      break;
    }
  }
  const gaveOnGivezy = await donorsWhoGaveOnGivezy(charityId);
  const reachable = donors.filter((d) => gaveOnGivezy.has(d.donor_id));
  const stopped = await stoppedEmails(charityId, reachable.map((d) => d.email));
  const kept = reachable.filter((d) => !stopped.has(d.email.trim().toLowerCase()));
  return { donors: kept, stopped: reachable.length - kept.length, recordedOnly: donors.length - reachable.length, label };
}

/** Donors with at least one paid gift made on Givezy itself (not recorded by the charity). */
async function donorsWhoGaveOnGivezy(charityId: string): Promise<Set<string>> {
  const out = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from("donations").select("donor_id").eq("charity_id", charityId).eq("status", "paid").neq("gateway", "recorded").order("id").range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) out.add(r.donor_id as string);
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Which of these addresses said no: to this charity's news and appeals, or to thank-yous from any charity. */
async function stoppedEmails(charityId: string, emails: string[]): Promise<Set<string>> {
  const byHash = new Map(emails.map((e) => [emailHash(e), e.trim().toLowerCase()]));
  const out = new Set<string>();
  const hashes = [...byHash.keys()];
  for (let i = 0; i < hashes.length; i += 200) {
    const chunk = hashes.slice(i, i + 200);
    const [mine, any] = await Promise.all([
      db().from("charity_email_opt_outs").select("email_hash").eq("charity_id", charityId).in("email_hash", chunk),
      db().from("thank_you_opt_outs").select("email_hash").in("email_hash", chunk),
    ]);
    if (mine.error) throw mine.error;
    if (any.error) throw any.error;
    for (const r of [...(mine.data ?? []), ...(any.data ?? [])]) {
      const e = byHash.get(r.email_hash as string);
      if (e) out.add(e);
    }
  }
  return out;
}

/** Save the email and list its recipients ('waiting'). Nothing is sent yet. */
export async function createAppeal(args: { charityId: string; userId: string; subject: string; body: string; audience: Audience; pick: AudiencePick }): Promise<string> {
  const { data, error } = await db()
    .from("charity_appeals")
    .insert({ charity_id: args.charityId, subject: args.subject, body: args.body, audience: { value: audienceValue(args.audience) }, audience_label: args.pick.label.slice(0, 200), created_by: args.userId })
    .select("id")
    .single();
  if (error) throw error;
  const rows = args.pick.donors.map((d) => ({ appeal_id: data.id, charity_id: args.charityId, donor_id: d.donor_id }));
  for (let i = 0; i < rows.length; i += 500) {
    const ins = await db().from("charity_appeal_recipients").insert(rows.slice(i, i + 500));
    if (ins.error) {
      await db().from("charity_appeals").delete().eq("id", data.id);
      throw ins.error;
    }
  }
  await logAudit({ actorUserId: args.userId, action: "charity.appeal_created", entityType: "charity", entityId: args.charityId, details: { appealId: data.id, recipients: rows.length } });
  return data.id as string;
}

export type SendProgress = { sent: number; failed: number; skipped: number; waiting: number };

/**
 * Send what is still waiting, until the time runs out (a web request can't run for ever). Each donor is
 * claimed in the database first, so pressing again, or two people pressing, never emails anyone twice.
 * Each email is looked up fresh: someone who said no in the meantime is skipped.
 */
export async function sendAppeal(args: { charityId: string; appealId: string; charityName: string; replyTo: string | null; userId: string; budgetMs?: number }): Promise<SendProgress | null> {
  const started = Date.now();
  const budget = args.budgetMs ?? 40_000;
  const { data: appeal, error } = await db().from("charity_appeals").select("id, subject, body").eq("id", args.appealId).eq("charity_id", args.charityId).maybeSingle();
  if (error) throw error;
  if (!appeal) return null;
  // Before claiming anyone: a sending set-up problem must not use up a donor's place.
  const transport = getEmailTransport();
  const site = (process.env.SITE_URL ?? "").replace(/\/+$/, "");
  let donorsById: Map<string, DonorRow> | null = null;
  while (Date.now() - started < budget) {
    const { data: claimed, error: claimError } = await db().rpc("claim_appeal_recipients", { p_appeal_id: appeal.id, p_limit: 25 });
    if (claimError) throw claimError;
    const ids = ((claimed ?? []) as { donor_id: string }[]).map((r) => r.donor_id);
    if (!ids.length) break;
    donorsById ??= new Map((await loadDonors(args.charityId)).map((d) => [d.donor_id, d]));
    const stopped = await stoppedEmails(args.charityId, ids.map((id) => donorsById!.get(id)?.email ?? "").filter(Boolean));
    for (const id of ids) {
      const d = donorsById.get(id);
      const mark = (status: "sent" | "failed" | "skipped") =>
        db().from("charity_appeal_recipients").update({ status, ...(status === "sent" ? { sent_at: new Date().toISOString() } : {}) }).eq("appeal_id", appeal.id).eq("donor_id", id);
      if (!d?.email || isErasedEmail(d.email) || stopped.has(d.email.trim().toLowerCase())) {
        await mark("skipped");
        continue;
      }
      const token = randomBytes(32).toString("base64url");
      const saved = await db().from("charity_email_stop_tokens").insert({ token_hash: sha(token), charity_id: args.charityId, email_hash: emailHash(d.email) });
      if (saved.error) {
        await mark("failed");
        continue;
      }
      try {
        const outcome = await transport.send(
          appealEmail(d.email.trim(), { charityName: args.charityName, firstName: greetingName(d), subject: appeal.subject as string, body: appeal.body as string, stopUrl: `${site}/news/stop?t=${token}`, replyTo: args.replyTo }),
        );
        // "skipped" (email not switched on here, or an address off the allowed list) is not a send.
        await mark(outcome === "sent" ? "sent" : "skipped");
      } catch (e) {
        console.error("[appeal] not sent", e instanceof Error ? e.message : e);
        await mark("failed");
      }
    }
  }
  const progress = await appealProgress(appeal.id as string);
  await logAudit({ actorUserId: args.userId, action: "charity.appeal_sent", entityType: "charity", entityId: args.charityId, details: { appealId: appeal.id, ...progress } });
  return progress;
}

export async function appealProgress(appealId: string): Promise<SendProgress> {
  const p: SendProgress = { sent: 0, failed: 0, skipped: 0, waiting: 0 };
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from("charity_appeal_recipients").select("status").eq("appeal_id", appealId).order("donor_id").range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) {
      if (r.status === "sent") p.sent++;
      else if (r.status === "failed") p.failed++;
      else if (r.status === "skipped") p.skipped++;
      // 'sending' left behind by a stopped page: it may have gone, so it is never sent again. Counted as failed.
      else if (r.status === "sending") p.failed++;
      else p.waiting++;
    }
    if (!data || data.length < 1000) break;
  }
  return p;
}

export type AppealRow = { id: string; subject: string; audience_label: string; created_at: string; progress: SendProgress };

/** The charity's emails, newest first, with how far each got. */
export async function listAppeals(charityId: string, limit = 20): Promise<AppealRow[]> {
  const { data, error } = await db().from("charity_appeals").select("id, subject, audience_label, created_at").eq("charity_id", charityId).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return Promise.all((data ?? []).map(async (a) => ({ ...(a as Omit<AppealRow, "progress">), progress: await appealProgress(a.id as string) })));
}

/** How many emails this charity sent (or started sending) in the last 30 days: shown so the 4-a-month limit isn't a surprise. */
export async function appealsThisMonth(charityId: string, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const { count, error } = await db().from("charity_appeals").select("id", { count: "exact", head: true }).eq("charity_id", charityId).gte("created_at", since);
  if (error) throw error;
  return count ?? 0;
}

/** "No news or appeals from this charity", from the checkout box. Kept as a hash of the address. */
export async function optOutAtCheckout(charityId: string, email: string): Promise<void> {
  const { error } = await db().from("charity_email_opt_outs").upsert({ charity_id: charityId, email_hash: emailHash(email), source: "checkout" }, { onConflict: "charity_id,email_hash", ignoreDuplicates: true });
  if (error) throw error;
}

/** The stop link in an email. The charity's name when the link was ours (the opt-out is then saved). */
export async function stopAppeals(token: string): Promise<{ charityName: string } | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const { data } = await db().from("charity_email_stop_tokens").select("charity_id, email_hash, charities(name_en)").eq("token_hash", sha(token)).maybeSingle();
  if (!data) return null;
  const { error } = await db().from("charity_email_opt_outs").upsert({ charity_id: data.charity_id, email_hash: data.email_hash, source: "stop_link" }, { onConflict: "charity_id,email_hash", ignoreDuplicates: true });
  if (error) throw error;
  const c = data.charities as unknown as { name_en: string } | null;
  return { charityName: c?.name_en ?? "this charity" };
}
