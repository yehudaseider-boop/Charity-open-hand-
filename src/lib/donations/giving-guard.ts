import "server-only";
import { platformConfig } from "@/config/platform";
import { legalConfig } from "@/config/legal";
import { logAudit } from "@/lib/audit";
import { alertGivezy } from "@/lib/ops/alert";
import { after } from "next/server";
import { clearOldAttempts, forgetAttempts, hashedKey, hitRateLimit, ipKeys, rateLimitReached, takeAttempt } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { tooManyTriesMessage, type GuardReason } from "./giving-guard-rules";

/**
 * Card-testing protection (11/11/2026). Criminals use donation forms to try stolen card numbers, many small gifts
 * in a short time. Every way a gift starts (website, monthly sign-up, phone app) passes through checkGivingAllowed:
 * limits per email and per internet address, a wait after several declined cards, and an alarm to the Givezy team
 * when one charity suddenly gets far more gift starts or declines than usual.
 *
 * If the limits store can't be read, the gift goes ahead (and the server log says so): our own outage must never
 * stop a real donor giving. The payment provider's own fraud checks still apply.
 *
 * The limits table only ever holds one-way stand-ins for addresses (and, here, for emails): see hashedKey.
 */

const guard = platformConfig.givingGuard;

export type GuardRefusal = { reason: GuardReason; message: string };

const keysOf = (key: string | null): string[] => (key ? [key] : []);

/** One gift start: allowed (null) or refused with the plain message to show. Counts this start. */
export async function checkGivingAllowed(args: { email: string; ip: string; charityId: string }): Promise<GuardRefusal | null> {
  try {
    const email = args.email.trim().toLowerCase();
    const addressKeys = ipKeys(args.ip);
    const emailKeys = keysOf(hashedKey("email", email));

    // The checks run side by side, not one after another (12/11/2026: pressing Give took about 3 seconds before the
    // payment page, most of it these checks waiting on each other). The answer is read in the same order as before,
    // so the same refusal wins.

    // Several declined cards lately: wait before trying again. Read only, so waiting doesn't extend the wait.
    // Email and address each have their own threshold (an address is shared by many donors). A start refused here
    // is not counted in the limits below, as before.
    const [declinedEmail, declinedAddress] = await Promise.all([
      rateLimitReached("checkout-declined", emailKeys, guard.declinesPerEmail.tries, guard.declinesPerEmail.minutes),
      rateLimitReached("checkout-declined", addressKeys, guard.declinesPerAddress.tries, guard.declinesPerAddress.minutes),
    ]);
    if (declinedEmail) return refuse("declines", guard.declinesPerEmail.minutes);
    if (declinedAddress) return refuse("declines", guard.declinesPerAddress.minutes);

    // The existing short limits (the email bucket keeps the address as typed, so erasing a donor clears it), in the
    // order they are answered, and a sudden rush on one charity (attackers change addresses and emails): the team is
    // told, donors are never blocked. Each counts this start, side by side. A start refused by one limit stays counted
    // only in that limit and the ones before it, as when they were checked in turn (13/11/2026: counting it in every
    // limit could turn a 10-minute wait into a day's), and never in the charity's rush count. A limit that couldn't be
    // checked never lets a refusal from another one through.
    const limits: { bucket: string; keys: string[]; tries: number; minutes: number; reason: GuardReason }[] = [
      { bucket: "checkout", keys: [`email:${email}`], ...guard.perEmail, reason: "email" },
      { bucket: "checkout-ip", keys: addressKeys, ...guard.perAddress, reason: "address" },
      { bucket: "checkout-day", keys: emailKeys, ...guard.perEmailDay, reason: "email-day" },
      { bucket: "checkout-ip-day", keys: addressKeys, ...guard.perAddressDay, reason: "address-day" },
    ];
    const [rush, ...counted] = await Promise.allSettled([
      takeAttempt("checkout-charity", [`charity:${args.charityId}`], guard.charityStartsAlarm.tries, guard.charityStartsAlarm.minutes),
      ...limits.map((l) => takeAttempt(l.bucket, l.keys, l.tries, l.minutes)),
    ]);
    // Rows older than a day, cleared while the donor isn't waiting on it.
    void clearOldAttempts();
    for (const r of [rush, ...counted]) if (r.status === "rejected") console.error("[giving-guard] a limit could not be checked", r.reason);
    const idsOf = (r: (typeof counted)[number]) => (r.status === "fulfilled" ? r.value.ids : []);
    const refusedAt = counted.findIndex((r) => r.status === "fulfilled" && r.value.limited);
    if (refusedAt >= 0) {
      await forgetAttempts([...idsOf(rush), ...counted.slice(refusedAt + 1).flatMap(idsOf)]);
      return refuse(limits[refusedAt].reason, limits[refusedAt].minutes);
    }
    if (rush.status === "fulfilled" && rush.value.limited) await raiseAlarm("starts", args.charityId, guard.charityStartsAlarm);
    return null;
  } catch (e) {
    console.error("[giving-guard] limits could not be checked; the gift goes ahead", e);
    return null;
  }

  async function refuse(reason: GuardReason, minutes: number): Promise<GuardRefusal> {
    await recordBlocked(reason);
    return { reason, message: tooManyTriesMessage(minutes, legalConfig.supportEmail) };
  }
}

/** Count a refused start for Admin, Payments: the reason only, never the email or address. Never throws. */
export async function recordBlocked(reason: GuardReason): Promise<void> {
  try {
    const { error } = await createAdminClient().from("rate_limit_events").insert({ bucket: "giving-blocked", key: `reason:${reason}` });
    if (error) throw error;
  } catch (e) {
    console.error("[giving-guard] could not count a blocked attempt", e);
  }
}

/**
 * Remember who started this gift (as one-way stand-ins), so a declined card reported later by the payment
 * provider (which doesn't know the address) can be counted against them. Kept about a day. Never throws.
 */
export async function rememberGiftStart(donationId: string, email: string, ip: string): Promise<void> {
  try {
    const keys = [...keysOf(hashedKey("email", email)), ...ipKeys(ip)];
    if (!keys.length) return;
    const { error } = await createAdminClient().from("rate_limit_events").insert(keys.map((k) => ({ bucket: "checkout-start", key: `${donationId}|${k}` })));
    if (error) throw error;
  } catch (e) {
    console.error("[giving-guard] could not remember a gift start", e);
  }
}

/**
 * A gift started through checkout was declined: count it against its email and address, and against its charity
 * (an alarm, never a block). Called once per gift, when it first moves to failed. Never throws.
 */
export async function recordDecline(donationId: string): Promise<void> {
  try {
    const db = createAdminClient();
    const { data, error } = await db.from("rate_limit_events").select("key").eq("bucket", "checkout-start").like("key", `${donationId}|%`);
    if (error) throw error;
    // Only gifts started on a give form or in the app (not monthly collections, which have no start here).
    const keys = (data ?? []).map((r) => String(r.key).slice(donationId.length + 1)).filter(Boolean);
    if (!keys.length) return;
    const insert = await db.from("rate_limit_events").insert(keys.map((key) => ({ bucket: "checkout-declined", key })));
    if (insert.error) throw insert.error;
    const { data: gift, error: giftError } = await db.from("donations").select("charity_id").eq("id", donationId).maybeSingle();
    if (giftError) throw giftError;
    const charityId = gift?.charity_id as string | undefined;
    if (charityId && (await hitRateLimit("charity-declines", [`charity:${charityId}`], guard.charityDeclinesAlarm.tries, guard.charityDeclinesAlarm.minutes))) {
      await raiseAlarm("declines", charityId, guard.charityDeclinesAlarm);
    }
  } catch (e) {
    console.error("[giving-guard] could not count a declined card", e);
  }
}

/**
 * At most one alarm an hour per charity and kind: an audit entry (Admin, Payments) and an email to the team.
 * Race-safe: every caller records its claim first, and only the earliest claim of the hour sends. The email goes after
 * the donor's response (Next's after()), so it never slows a gift; outside a request (the daily job) it is sent now.
 */
async function raiseAlarm(kind: "starts" | "declines", charityId: string, limit: { tries: number; minutes: number }): Promise<void> {
  const db = createAdminClient();
  const key = `${kind}:${charityId}`;
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const claim = await db.from("rate_limit_events").insert({ bucket: "giving-alarm", key }).select("id").single();
  if (claim.error) throw claim.error;
  const { data: first, error } = await db.from("rate_limit_events").select("id").eq("bucket", "giving-alarm").eq("key", key).gte("created_at", since).order("id").limit(1).maybeSingle();
  if (error) throw error;
  if (!first || first.id !== claim.data.id) return;

  const send = async () => {
    try {
      const { data } = await db.from("charities").select("name_en").eq("id", charityId).maybeSingle();
      const name = (data?.name_en as string | undefined) ?? "a charity";
      const what = kind === "starts" ? `more than ${limit.tries} gift starts` : `more than ${limit.tries} declined cards`;
      await logAudit({ actorUserId: null, action: "giving.alarm", entityType: "charity", entityId: charityId, details: { kind, tries: limit.tries, minutes: limit.minutes } }).catch((e) =>
        console.error("[giving-guard] could not log an alarm", e),
      );
      await alertGivezy(`unusual giving activity for ${name}`, [
        `${name} had ${what} in ${limit.minutes} minutes.`,
        "This can be card testing: someone trying stolen card numbers with small gifts.",
        "Nobody has been blocked by this alarm. Check Admin, Payments, and the payment provider's dashboard for declines.",
      ]);
    } catch (e) {
      console.error("[giving-guard] could not raise an alarm", e);
    }
  };
  try {
    after(send);
  } catch {
    // Not inside a request (a scheduled job, a test): send it now.
    await send();
  }
}

export type GuardSummary = { blocked: { reason: GuardReason; count: number }[]; alarms: { at: string; kind: string; charityId: string | null }[] };

/** For Admin, Payments: refused starts in the last day, by reason, and the last week's alarms. */
export async function givingGuardSummary(now = new Date()): Promise<GuardSummary> {
  const db = createAdminClient();
  const dayAgo = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3_600_000).toISOString();
  const reasons: GuardReason[] = ["email", "address", "email-day", "address-day", "declines", "bot"];
  const counts = await Promise.all(
    reasons.map(async (reason) => {
      const { count, error } = await db.from("rate_limit_events").select("id", { count: "exact", head: true }).eq("bucket", "giving-blocked").eq("key", `reason:${reason}`).gte("created_at", dayAgo);
      if (error) throw error;
      return { reason, count: count ?? 0 };
    }),
  );
  const { data, error } = await db.from("audit_log").select("created_at, entity_id, details").eq("action", "giving.alarm").gte("created_at", weekAgo).order("created_at", { ascending: false }).limit(20);
  if (error) throw error;
  return {
    blocked: counts.filter((c) => c.count > 0),
    alarms: (data ?? []).map((a) => ({ at: a.created_at as string, kind: String((a.details as { kind?: string } | null)?.kind ?? ""), charityId: (a.entity_id as string | null) ?? null })),
  };
}
