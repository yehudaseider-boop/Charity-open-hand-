/**
 * A donor's whole story with one charity (CRM build step 18, 10/11/2026): their gifts, their monthly donations
 * starting and stopping, every message this charity sent them through Givezy, their s18A receipts and the
 * charity's own notes, newest first, on the donor's page. Pure: the rows come from `donor-story-store.ts`, which
 * reads only this charity's rows for this donor. No message bodies, no ID or tax numbers.
 */
import { journeyName } from "./journey";
import { taxYearName } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { RECORDED_METHODS, type RecordedMethod } from "./recorded-gifts";
import { lapsedReasonLabel, type LapsedReason } from "./lapsed-monthly";
import { monthLabel } from "./thank-you";

/** How many entries the page shows before "Show older", and the most it ever shows. */
export const STORY_FIRST = 100;
export const STORY_MAX = 500;

export type StoryTone = "good" | "neutral" | "warning";

/** One line in the story. `href` opens the matching page on the dashboard, when there is one. */
export type StoryEntry = { at: string; kind: StoryKind; what: string; status: string | null; tone: StoryTone; href?: string };

export type StoryKind =
  | "gift"
  | "monthly"
  | "thank_you"
  | "s18a_reminder"
  | "appeal"
  | "month_thank_you"
  | "journey"
  | "receipt"
  | "note";

/** The rows the store reads, already limited to this charity and this donor. */
export type StoryRows = {
  gifts: { id: string; status: string; amount_cents: number; paid_at: string | null; created_at: string; recorded_method: string | null }[];
  monthly: { id: string; status: string; amount_cents: number; first_paid_at: string | null; ended_at: string | null; paused_at: string | null; ended_reason: string | null }[];
  thanks: { kind: string; sent_at: string }[];
  appeals: { subject: string | null; status: string; at: string | null }[];
  monthThanks: { period_month: string; status: string; at: string }[];
  /** Each journey they are or were on (CRM steps 6a, 6b and 7): the general one, a campaign's, win-back. */
  journeys: {
    kind: "general" | "campaign" | "winback";
    campaignId: string | null;
    campaignTitle: string | null;
    enrolled_at: string | null;
    status: string | null;
    stopped_reason: string | null;
    sends: { position: number; status: string; at: string }[];
  }[];
  receipts: { receipt_number: number; tax_year: number; amount_cents: number; status: string; issued_at: string; voided_at: string | null; emailed_at: string | null }[];
  declined: { tax_year: number; decided_at: string; decline_emailed_at: string | null }[];
  notes: { created_at: string; author: string | null }[];
};

export const EMPTY_STORY: StoryRows = { gifts: [], monthly: [], thanks: [], appeals: [], monthThanks: [], journeys: [], receipts: [], declined: [], notes: [] };

/** The SQL meaning of "why it stopped" (charity_lapsed_monthly), so the story and the stopped list say the same. */
export function monthlyStopReason(status: string, endedReason: string | null): LapsedReason {
  if (endedReason === "the donor's information was erased") return "erased";
  if (endedReason === "the payment was charged back") return "dispute";
  if (status === "failed" || endedReason === "the card was declined every time we tried this month" || endedReason === "the new card can't be used for monthly payments") return "declined";
  if (endedReason === "cancelled by the donor") return "cancelled";
  return "other";
}

const MESSAGE_STATUS: Record<string, { status: string; tone: StoryTone }> = {
  sent: { status: "Sent", tone: "good" },
  sending: { status: "Sending", tone: "neutral" },
  waiting: { status: "Waiting to send", tone: "neutral" },
  failed: { status: "Couldn't be delivered", tone: "warning" },
  skipped: { status: "Not sent", tone: "neutral" },
  unknown: { status: "May not have arrived", tone: "warning" },
};
const messageStatus = (s: string) => MESSAGE_STATUS[s] ?? { status: "Not sent", tone: "neutral" as const };

const JOURNEY_STOPPED: Record<string, string> = {
  erased: "they erased their information",
  opted_out: "they turned off your emails",
  no_email: "there's no email address for them",
  no_gift: "they have no gift with you any more",
  not_delivered: "the emails couldn't be delivered",
  gave_again: "they gave again",
};

/**
 * Everything, newest first. A donor who erased their information shows only what the page already shows for them
 * (gifts, monthly donations and receipts, with amounts and dates): no messages and no notes.
 */
export function buildDonorStory(rows: StoryRows, opts: { base: string; erased: boolean }): StoryEntry[] {
  const out: StoryEntry[] = [];
  for (const g of rows.gifts) {
    if (!["paid", "refunded", "charged_back"].includes(g.status)) continue;
    const how = g.recorded_method ? (RECORDED_METHODS[g.recorded_method as RecordedMethod] ?? "Recorded") : null;
    out.push({
      at: g.paid_at ?? g.created_at,
      kind: "gift",
      what: `${how ? "Recorded gift" : "Gift"} of ${formatRand(g.amount_cents)}${how ? ` (${how})` : ""}`,
      status: g.status === "paid" ? null : g.status === "refunded" ? "Refunded" : "Charged back",
      tone: g.status === "paid" ? "good" : "warning",
      href: `${opts.base}/donations/${g.id}`,
    });
  }
  for (const m of rows.monthly) {
    if (!m.first_paid_at) continue;
    out.push({ at: m.first_paid_at, kind: "monthly", what: `Monthly donation of ${formatRand(m.amount_cents)} started`, status: null, tone: "good" });
    if ((m.status === "cancelled" || m.status === "failed") && m.ended_at) {
      out.push({ at: m.ended_at, kind: "monthly", what: `Monthly donation of ${formatRand(m.amount_cents)} stopped`, status: lapsedReasonLabel[monthlyStopReason(m.status, m.ended_reason)], tone: "warning" });
    } else if (m.status === "paused" && m.paused_at) {
      out.push({ at: m.paused_at, kind: "monthly", what: `Monthly donation of ${formatRand(m.amount_cents)} paused`, status: null, tone: "neutral" });
    }
  }
  for (const r of rows.receipts) {
    out.push({
      at: r.issued_at,
      kind: "receipt",
      what: `s18A receipt ${r.receipt_number} for ${taxYearName(r.tax_year)} (${formatRand(r.amount_cents)})`,
      status: r.emailed_at ? "Issued and emailed" : "Issued",
      tone: "good",
      href: `${opts.base}/receipts`,
    });
    if (r.status === "void" && r.voided_at) {
      out.push({ at: r.voided_at, kind: "receipt", what: `s18A receipt ${r.receipt_number} withdrawn`, status: null, tone: "warning", href: `${opts.base}/receipts` });
    }
  }
  if (!opts.erased) {
    for (const d of rows.declined) {
      out.push({
        at: d.decided_at,
        kind: "receipt",
        what: `s18A receipt for ${taxYearName(d.tax_year)} declined`,
        status: d.decline_emailed_at ? "They were emailed to contact you" : "Not emailed yet",
        tone: "warning",
        href: `${opts.base}/receipts`,
      });
    }
    for (const t of rows.thanks) {
      if (t.kind === "journey") continue; // the journey's own log says which email it was
      out.push(
        t.kind === "s18a_details_reminder"
          ? { at: t.sent_at, kind: "s18a_reminder", what: "Reminder to add their s18A receipt details", status: "Sent", tone: "good" }
          : { at: t.sent_at, kind: "thank_you", what: "Your personal thank-you", status: "Sent", tone: "good" },
      );
    }
    for (const a of rows.appeals) {
      if (!a.at) continue;
      const s = messageStatus(a.status);
      out.push({ at: a.at, kind: "appeal", what: a.subject ? `Email to donors: ${a.subject}` : "Email to donors", status: s.status, tone: s.tone, href: `${opts.base}/email-donors` });
    }
    for (const t of rows.monthThanks) {
      const s = messageStatus(t.status);
      out.push({ at: t.at, kind: "month_thank_you", what: `Thank-you for ${monthLabel(t.period_month)}`, status: s.status, tone: s.tone, href: `${opts.base}/thank-donors` });
    }
    for (const j of rows.journeys) {
      const name = journeyName(j.kind, j.campaignTitle);
      const label = j.kind === "general" ? "Donor journey" : j.kind === "winback" ? "Win-back journey" : `Journey for ${(j.campaignTitle ?? "").trim() || "a campaign"}`;
      const href = j.kind === "general" ? `${opts.base}/journey` : `${opts.base}/journey?j=${encodeURIComponent(j.kind === "winback" ? "winback" : `campaign:${j.campaignId}`)}`;
      if (j.enrolled_at) out.push({ at: j.enrolled_at, kind: "journey", what: `Joined ${name}`, status: null, tone: "neutral", href });
      for (const s of j.sends) {
        const st = messageStatus(s.status);
        out.push({ at: s.at, kind: "journey", what: `${label} email ${s.position}`, status: st.status, tone: st.tone, href });
      }
      if (j.status === "stopped" && j.stopped_reason) {
        const last = [j.enrolled_at, ...j.sends.map((s) => s.at)].filter(Boolean).sort().at(-1);
        if (last) out.push({ at: last, kind: "journey", what: `Left ${name}`, status: `Because ${JOURNEY_STOPPED[j.stopped_reason] ?? "it was stopped"}`, tone: "neutral", href });
      }
    }
    for (const n of rows.notes) {
      out.push({ at: n.created_at, kind: "note", what: n.author ? `Note added by ${n.author}` : "Note added", status: null, tone: "neutral" });
    }
  }
  // Newest first; the same moment keeps a fixed order so the page never shuffles.
  return out
    .filter((e) => !Number.isNaN(Date.parse(e.at)))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.kind.localeCompare(b.kind) || a.what.localeCompare(b.what));
}
