import "server-only";
import { logAudit } from "@/lib/audit";
import { emailIsOn, RETRY_DELAYS_HOURS } from "@/lib/email/retry-plan";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendAppeal, type AppealRun } from "./appeals";
import { can } from "./permissions";
import { memberRole } from "./team";
import { continueThankYou, type SendResult } from "./thank-you-send";

/**
 * Unfinished emails to donors carry on by themselves (21/11/2026). A charity's monthly thank-you or news email to a
 * big list stops after about 40 seconds a press; before, the charity had to press "Send the rest" again and again.
 * Now the daily job picks up each unfinished one and carries it on in its own share of the job's time, with the very
 * same send functions (continueThankYou, sendAppeal): each address is claimed before its email goes, so nobody is
 * emailed twice, and the one-message-a-week rule is checked as each one goes. "Send the rest" still works alongside.
 *
 * It only ever carries on a send a person started. It never starts one, never runs while email is switched off, and
 * skips a charity whose page isn't live (suspended, for example) or whose sender may no longer email donors. A send
 * the email service keeps refusing is left for a person after the same number of tries again as the important
 * emails (RETRY_DELAYS_HOURS), and counted once in Givezy's daily email.
 */

/** Only sends started this many days ago or less carry on by themselves: a news email weeks late does more harm than good. */
export const CARRY_ON_DAYS = 14;
/** Does a send started at this time still carry on by itself (for the charity's page)? */
export function carriesOnByItself(startedAt: string, now = new Date()): boolean {
  return now.getTime() - new Date(startedAt).getTime() <= CARRY_ON_DAYS * 86_400_000;
}

/** The charity's page, under an unfinished send that carries on by itself. */
export const GOES_BY_ITSELF = "The rest go out by themselves over the next day or two. You can also press Send the rest now.";

/** Job runs in a row the email service refused (nothing sent) before a send is left for a person: the important emails' three tries again. */
export const GIVE_UP_AFTER = RETRY_DELAYS_HOURS.length;
/** Below this, a send isn't started today: its reads alone take a few seconds. */
export const MIN_SHARE_MS = 5_000;
/** Kept back from each share: the budget is checked before each email, and one email can still take a moment. */
export const SEND_MARGIN_MS = 2_000;
/** The audit entry for a send left for a person. */
export const LEFT_FOR_PERSON = "charity.send_left_for_person";

export type UnfinishedSend = {
  kind: "thank_you" | "appeal";
  /** The thank-you's or the email's id. */
  id: string;
  charityId: string;
  /** Who pressed Send. Null when their sign-in was removed since: then it doesn't carry on by itself. */
  startedBy: string | null;
  startedAt: string;
  /** A thank-you's month (yyyy-mm-01). */
  month?: string;
};

/** What happened to a send before, newest first: a person's press, a job run, or being left for a person. */
export type HistoryEntry = { by: "person" } | { by: "job"; refusedWithNothingSent: boolean } | { by: "left" };

export type CarryOnStore = {
  /** Unfinished sends started in the last CARRY_ON_DAYS days, oldest first. */
  unfinished(now: Date): Promise<UnfinishedSend[]>;
  /** The charity's name and reply-to when it may still send (page live, the sender still allowed to email donors), else null. */
  sender(s: UnfinishedSend): Promise<{ charityName: string; replyTo: string | null } | null>;
  history(s: UnfinishedSend): Promise<HistoryEntry[]>;
  leaveForPerson(s: UnfinishedSend, refusedRuns: number): Promise<void>;
};

export type CarryOnRunners = {
  thankYou: (args: Parameters<typeof continueThankYou>[0]) => Promise<SendResult>;
  appeal: (args: Parameters<typeof sendAppeal>[0]) => Promise<AppealRun | null>;
};

export type CarryOnSummary = {
  /** Email is switched off on this site: nothing was carried on. */
  emailOff?: boolean;
  /** Unfinished sends found. */
  unfinished: number;
  /** Sends carried on today. */
  continued: number;
  /** Emails that went today. */
  sent: number;
  /** Sends that reached everyone today. */
  finished: number;
  /** Skipped: the charity's page isn't live, or whoever started it may no longer email donors. */
  notAllowed: number;
  /** Left for a person today: the email service refused it GIVE_UP_AFTER runs in a row. Counted once, in the daily email. */
  leftForPerson: number;
  /** Left for a person before, still waiting for someone to press Send the rest. */
  waitingForPerson: number;
  /** Not reached today: no time left. They carry on tomorrow. */
  notReached: number;
  errors: number;
};

const empty = (): CarryOnSummary => ({ unfinished: 0, continued: 0, sent: 0, finished: 0, notAllowed: 0, leftForPerson: 0, waitingForPerson: 0, notReached: 0, errors: 0 });

/** Job runs in a row (newest first) that the email service refused with nothing sent, and whether it was left for a person since a person last pressed. */
export function readHistory(history: HistoryEntry[]): { refusedRuns: number; left: boolean } {
  let refusedRuns = 0;
  for (const h of history) {
    if (h.by === "left") return { refusedRuns, left: true };
    // A person pressing Send (the rest) starts the count again, and lifts a send left for a person.
    if (h.by === "person") break;
    if (!h.refusedWithNothingSent) break;
    refusedRuns += 1;
  }
  return { refusedRuns, left: false };
}

const DAY = 86_400_000;

/**
 * Carry on every unfinished send in the time until `deadline`, sharing it fairly: each send gets an equal share of
 * what is left (time a quick one doesn't use goes to the rest), and the starting point moves on by one each day, so a
 * long list never leaves the same sends behind. Whatever isn't reached carries on tomorrow.
 */
export async function carryOnSends(deadline: number, deps: { store: CarryOnStore; runners?: CarryOnRunners; emailOn?: () => boolean; now?: () => number }): Promise<CarryOnSummary> {
  const now = deps.now ?? Date.now;
  const runners = deps.runners ?? { thankYou: continueThankYou, appeal: sendAppeal };
  const out = empty();
  if (!(deps.emailOn ?? emailIsOn)()) return { ...out, emailOff: true };
  const found = await deps.store.unfinished(new Date(now()));
  out.unfinished = found.length;
  const start = found.length ? Math.floor(now() / DAY) % found.length : 0;
  const list = [...found.slice(start), ...found.slice(0, start)];
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const left = deadline - now();
    if (left < MIN_SHARE_MS) {
      out.notReached = list.length - i;
      break;
    }
    try {
      const sender = await deps.store.sender(s);
      if (!sender) {
        out.notAllowed += 1;
        continue;
      }
      const before = readHistory(await deps.store.history(s));
      if (before.left) {
        out.waitingForPerson += 1;
        continue;
      }
      if (before.refusedRuns >= GIVE_UP_AFTER) {
        await deps.store.leaveForPerson(s, before.refusedRuns);
        out.leftForPerson += 1;
        continue;
      }
      // An equal share of the time left, worked out again now (the checks above took a moment), and never less than
      // MIN_SHARE_MS: better a few sends get somewhere today than every one too little to do anything.
      const timeLeft = deadline - now();
      const share = Math.min(Math.max(Math.floor(timeLeft / (list.length - i)), MIN_SHARE_MS), timeLeft);
      const budgetMs = Math.max(1_000, share - SEND_MARGIN_MS);
      let sentThisRun = 0;
      let finished = false;
      let refused = false;
      if (s.kind === "thank_you") {
        if (!s.month) continue;
        const r = await runners.thankYou({ charityId: s.charityId, charityName: sender.charityName, month: s.month, userId: null, replyTo: sender.replyTo, budgetMs, auto: true });
        // Not ok: finished in the meantime (someone pressed Send the rest), or gone. Nothing to do.
        if (!r.ok) continue;
        sentThisRun = r.sentThisRun ?? 0;
        finished = r.remaining === 0 && !r.thisWeek;
        refused = r.refused === true;
      } else {
        const r = await runners.appeal({ charityId: s.charityId, appealId: s.id, charityName: sender.charityName, replyTo: sender.replyTo, userId: null, budgetMs, auto: true });
        if (!r) continue;
        sentThisRun = r.sentThisRun;
        finished = r.waiting === 0;
        refused = r.refused === true;
      }
      out.continued += 1;
      out.sent += sentThisRun;
      if (finished) out.finished += 1;
      // The email service said "not now" before anything went, the last allowed time: leave it for a person.
      if (refused && sentThisRun === 0 && before.refusedRuns + 1 >= GIVE_UP_AFTER) {
        await deps.store.leaveForPerson(s, before.refusedRuns + 1);
        out.leftForPerson += 1;
      }
    } catch (e) {
      out.errors += 1;
      console.error("[carry-on] a send could not carry on", s.kind, s.id, e instanceof Error ? e.message : e);
    }
  }
  return out;
}

const db = () => createAdminClient();

/** The database behind carryOnSends (service role: this runs in the daily job only). */
export function supabaseCarryOnStore(): CarryOnStore {
  return {
    async unfinished(now) {
      const since = new Date(now.getTime() - CARRY_ON_DAYS * DAY).toISOString();
      const [thanks, appeals] = await Promise.all([
        db().from("charity_thank_yous").select("id, charity_id, period_month, sent_by, sent_at").is("finished_at", null).gte("sent_at", since).order("sent_at", { ascending: true }).limit(200),
        db().from("charity_appeals").select("id, charity_id, created_by, created_at").gte("created_at", since).order("created_at", { ascending: true }).limit(500),
      ]);
      if (thanks.error) throw thanks.error;
      if (appeals.error) throw appeals.error;
      const out: UnfinishedSend[] = (thanks.data ?? []).map((t) => ({
        kind: "thank_you",
        id: t.id as string,
        charityId: t.charity_id as string,
        startedBy: (t.sent_by as string | null) ?? null,
        startedAt: t.sent_at as string,
        month: String(t.period_month).slice(0, 10),
      }));
      // An email is unfinished while anyone on its list is still waiting. One small read each (the waiting ones have their own index).
      const rows = appeals.data ?? [];
      for (let i = 0; i < rows.length; i += 10) {
        const checked = await Promise.all(
          rows.slice(i, i + 10).map(async (a) => {
            const { data, error } = await db().from("charity_appeal_recipients").select("donor_id").eq("appeal_id", a.id).eq("status", "waiting").limit(1);
            if (error) throw error;
            return data?.length ? a : null;
          }),
        );
        for (const a of checked) {
          if (a) out.push({ kind: "appeal", id: a.id as string, charityId: a.charity_id as string, startedBy: (a.created_by as string | null) ?? null, startedAt: a.created_at as string });
        }
      }
      return out.sort((x, y) => x.startedAt.localeCompare(y.startedAt));
    },

    async sender(s) {
      // The same checks as "Send the rest": the page is live and the person who started it may email donors. A
      // suspended charity, or someone removed from the team (or moved to a role without it), stops it carrying on.
      if (!s.startedBy) return null;
      const [{ data: charity, error }, { data: priv }] = await Promise.all([
        db().from("charities").select("status, name_en").eq("id", s.charityId).maybeSingle(),
        db().from("charity_private").select("contact_email").eq("charity_id", s.charityId).maybeSingle(),
      ]);
      if (error) throw error;
      if (!charity || charity.status !== "approved") return null;
      if (!can(await memberRole(s.charityId, s.startedBy), "message")) return null;
      return { charityName: charity.name_en as string, replyTo: (priv?.contact_email as string | null | undefined) ?? null };
    },

    async history(s) {
      const action = s.kind === "thank_you" ? "charity.thank_you_sent" : "charity.appeal_sent";
      const [key, value] = s.kind === "thank_you" ? ["month", s.month ?? ""] : ["appealId", s.id];
      const { data, error } = await db()
        .from("audit_log")
        .select("actor_user_id, action, details")
        .eq("entity_type", "charity")
        .eq("entity_id", s.charityId)
        .in("action", [action, LEFT_FOR_PERSON])
        .eq(`details->>${key}`, value)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []).map((r): HistoryEntry => {
        if (r.action === LEFT_FOR_PERSON) return { by: "left" };
        if (r.actor_user_id) return { by: "person" };
        const d = (r.details ?? {}) as { refused?: boolean; sentThisRun?: number };
        return { by: "job", refusedWithNothingSent: d.refused === true && !d.sentThisRun };
      });
    },

    async leaveForPerson(s, refusedRuns) {
      await logAudit({
        actorUserId: null,
        action: LEFT_FOR_PERSON,
        entityType: "charity",
        entityId: s.charityId,
        details: { kind: s.kind, ...(s.kind === "thank_you" ? { month: s.month } : { appealId: s.id }), refusedRuns },
      });
    },
  };
}

/** The daily job's step: every unfinished send, carried on until `deadline`. */
export function runCarryOnSends(deadline: number): Promise<CarryOnSummary> {
  return carryOnSends(deadline, { store: supabaseCarryOnStore() });
}
