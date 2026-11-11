import "server-only";
import { platformConfig } from "@/config/platform";
import { legalConfig } from "@/config/legal";
import { logAudit } from "@/lib/audit";
import { alertGivezy } from "@/lib/ops/alert";
import { hashedKey, hitRateLimit, ipKeys, rateLimitReached } from "@/lib/rate-limit";
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

/** One gift start: allowed (null) or refused with the plain message to show. Counts this start. */
export async function checkGivingAllowed(args: { email: string; ip: string; charityId: string }): Promise<GuardRefusal | null> {
  try {
    const email = args.email.trim().toLowerCase();
    const addressKeys = ipKeys(args.ip);
    const signalKeys = [hashedKey("email", email), ...addressKeys];

    // Several declined cards lately: wait before trying again. Read only, so waiting doesn't extend the wait.
    if (await rateLimitReached("checkout-declined", signalKeys, guard.declines.tries, guard.declines.minutes)) {
      return refuse("declines", guard.declines.minutes);
    }
    // The existing short limits (the email bucket keeps the address as typed, so erasing a donor clears it).
    if (await hitRateLimit("checkout", [`email:${email}`], guard.perEmail.tries, guard.perEmail.minutes)) return refuse("email", guard.perEmail.minutes);
    if (await hitRateLimit("checkout-ip", addressKeys, guard.perAddress.tries, guard.perAddress.minutes)) return refuse("address", guard.perAddress.minutes);
    if (await hitRateLimit("checkout-day", [hashedKey("email", email)], guard.perEmailDay.tries, guard.perEmailDay.minutes)) return refuse("email-day", guard.perEmailDay.minutes);
    if (await hitRateLimit("checkout-ip-day", addressKeys, guard.perAddressDay.tries, guard.perAddressDay.minutes)) return refuse("address-day", guard.perAddressDay.minutes);

    // A sudden rush on one charity (attackers change addresses and emails): tell the team, never block donors.
    if (await hitRateLimit("checkout-charity", [`charity:${args.charityId}`], guard.charityStartsAlarm.tries, guard.charityStartsAlarm.minutes)) {
      await raiseAlarm("starts", args.charityId, guard.charityStartsAlarm);
    }
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
    const keys = [hashedKey("email", email), ...ipKeys(ip)];
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

/** At most one alarm an hour per charity and kind: an audit entry (Admin, Payments) and an email to the team. */
async function raiseAlarm(kind: "starts" | "declines", charityId: string, limit: { tries: number; minutes: number }): Promise<void> {
  const key = `${kind}:${charityId}`;
  if (await rateLimitReached("giving-alarm", [key], 1, 60)) return;
  await hitRateLimit("giving-alarm", [key], 1, 60);
  const { data } = await createAdminClient().from("charities").select("name_en").eq("id", charityId).maybeSingle();
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
