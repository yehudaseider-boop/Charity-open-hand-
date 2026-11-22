import type Anthropic from "@anthropic-ai/sdk";
import { formatRand } from "@/lib/money";
import { leftCents } from "@/lib/donations/what-is-left";

/**
 * What the dashboard helper may look up about the charity it's asked from (22/11/2026, Yehuda: "answer questions
 * based off what's going on their dashboard, and help set up the account"). Every tool only reads, and only what the
 * person asking may already see on their dashboard: the live source reads as them, so row-level security decides.
 * Donors' names are a separate switch (ASSISTANT_DONOR_DATA): without it the donor tools aren't offered at all and
 * gifts are shown without names. Email addresses, phone numbers, ID and bank numbers are never sent.
 *
 * Pure: the definitions, the input checks and the wording of each answer live here; the data comes from a
 * HelperSource (live: ./live-source.ts, demo: ./demo-source.ts). Amounts go to the model already written as Rand,
 * so it never has to do sums with cents.
 */

export type PeriodKey = "this_month" | "last_month" | "this_tax_year" | "all_time";

export type Totals = {
  label: string;
  gifts: number;
  raisedCents: number;
  donors: number;
  s18aRequestedCents: number;
  refunded: number;
  refundedCents: number;
  chargedBack: number;
  pending: number;
  failed: number;
};
export type MonthTotal = { month: string; gifts: number; raisedCents: number; monthlyCents: number };
export type MonthlySummary = { running: number; perMonthCents: number; retrying: number; paused: number; ended: number; nextCharges: { day: string; amountCents: number }[] };
export type SetupStep = { label: string; done: boolean; page: string | null; who: string | null };
export type Setup = { status: string; application: SetupStep[] | null; gettingStarted: SetupStep[] };
export type ReceiptYear = { taxYear: number; label: string; giftsWanting: number; onIssued: number; wantingCents: number };
export type Gift = { date: string | null; amountCents: number; status: string; donor: string | null; monthly: boolean; anonymous: boolean };
export type DonorSummary = {
  name: string;
  gifts: number;
  totalCents: number;
  firstGift: string | null;
  lastGift: string | null;
  monthly: boolean | null;
  /** Anonymous, or erased at their request: shown without a name, and never found by searching. */
  hidden?: boolean;
};

/** Where the helper's facts come from. Every method only reads. */
export interface HelperSource {
  totals(period: PeriodKey): Promise<Totals>;
  byMonth(): Promise<MonthTotal[]>;
  monthly(): Promise<MonthlySummary>;
  setup(): Promise<Setup>;
  receipts(): Promise<ReceiptYear[]>;
  recentGifts(limit: number, withNames: boolean): Promise<Gift[]>;
  /** Donors by total given, largest first (only when donors' details are switched on). */
  donors(): Promise<DonorSummary[]>;
}

const PERIODS: PeriodKey[] = ["this_month", "last_month", "this_tax_year", "all_time"];

// Inputs stream as they are written (eager_input_streaming), so checkToolCall validates each one before it runs.
const tool = (name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []): Anthropic.Beta.BetaTool => ({
  name,
  description,
  input_schema: { type: "object", properties, required, additionalProperties: false },
  strict: true,
  eager_input_streaming: true,
});

/** The tools offered, in a fixed order so the request's start stays the same and is cached. */
export function toolDefinitions(donorData: boolean): Anthropic.Beta.BetaTool[] {
  const tools = [
    tool(
      "giving_totals",
      "What this charity received in a period: number of gifts, amount raised (what is left after any part refunds), number of donors, refunds, chargebacks, gifts still pending or failed, and how much was given with an s18A receipt asked for. Use for questions like 'how much came in this month' or 'how many donors this tax year'.",
      { period: { type: "string", enum: PERIODS, description: "this_month, last_month, this_tax_year (1 March to end of February) or all_time" } },
      ["period"],
    ),
    tool("giving_by_month", "Amount raised and number of gifts for each of the last 12 months, with how much of each month came from monthly donations. Use for trends and comparing months."),
    tool("monthly_donations", "The charity's monthly (recurring) donations: how many are running, what they bring in each month, how many are being retried after a declined card, paused or ended, and the next few collection days."),
    tool(
      "setup_progress",
      "Where the charity is with setting up Givezy: its status (draft, waiting for review, approved and so on), what its application still needs, and the getting-started steps with which are done, the page where each is done and who may do it. Use for 'what's left to set up', 'why can't I take donations yet' and 'what should I do next'.",
    ),
    tool("receipts_progress", "s18A receipts by tax year: how many paid gifts asked for an s18A receipt, how many of those are already on an issued receipt, and the amount asked for."),
    tool(
      "recent_gifts",
      donorData
        ? "The most recent gifts, newest first: date, amount, status, whether it was a monthly donation, and the donor's name (or 'Anonymous' when they asked to stay anonymous)."
        : "The most recent gifts, newest first: date, amount, status and whether it was a monthly donation. Donors' names are not available.",
      { limit: { type: "integer", description: "How many gifts, 1 to 10" } },
      ["limit"],
    ),
  ];
  if (donorData) {
    tools.push(
      tool(
        "top_donors",
        "The donors who have given the most to this charity in total, largest first: name, total given, number of gifts, first and last gift, and whether they give monthly. Anonymous donors' names are hidden.",
        { limit: { type: "integer", description: "How many donors, 1 to 10" } },
        ["limit"],
      ),
      tool(
        "find_donor",
        "Look up donors by part of their name: total given, number of gifts, first and last gift, and whether they give monthly. Never returns contact details.",
        { name: { type: "string", description: "Part of the donor's name, at least 2 letters" } },
        ["name"],
      ),
    );
  }
  return tools;
}

/** The tools each call may use, by name. */
export type ToolName = "giving_totals" | "giving_by_month" | "monthly_donations" | "setup_progress" | "receipts_progress" | "recent_gifts" | "top_donors" | "find_donor";

type Checked = { ok: true; name: ToolName; period?: PeriodKey; limit?: number; search?: string } | { ok: false; error: string };

const clampLimit = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? Math.min(10, Math.max(1, v)) : null);

/** Checks a tool call's name and input before it runs (the input can arrive incomplete while streaming). */
export function checkToolCall(name: string, input: unknown, donorData: boolean): Checked {
  const i = (input && typeof input === "object" && !Array.isArray(input) ? input : null) as Record<string, unknown> | null;
  if (!i) return { ok: false, error: "The tool input couldn't be read. Call the tool again with valid input." };
  switch (name) {
    case "giving_totals":
      return PERIODS.includes(i.period as PeriodKey) ? { ok: true, name, period: i.period as PeriodKey } : { ok: false, error: `period must be one of ${PERIODS.join(", ")}.` };
    case "giving_by_month":
    case "monthly_donations":
    case "setup_progress":
    case "receipts_progress":
      return { ok: true, name };
    case "recent_gifts":
    case "top_donors": {
      if (name === "top_donors" && !donorData) return { ok: false, error: "Donors' details aren't available." };
      const limit = clampLimit(i.limit);
      return limit ? { ok: true, name, limit } : { ok: false, error: "limit must be a whole number from 1 to 10." };
    }
    case "find_donor": {
      if (!donorData) return { ok: false, error: "Donors' details aren't available." };
      const search = typeof i.name === "string" ? i.name.replace(/\s+/g, " ").trim().slice(0, 60) : "";
      return search.length >= 2 ? { ok: true, name, search } : { ok: false, error: "name must be at least 2 letters." };
    }
    default:
      return { ok: false, error: `There is no tool called ${name}.` };
  }
}

const rand = (cents: number) => formatRand(Math.max(0, Math.round(cents)));

/** Runs a checked tool call against a source and words the answer for the model. Throws only if the source fails. */
export async function runTool(call: Extract<Checked, { ok: true }>, source: HelperSource, donorData: boolean): Promise<string> {
  switch (call.name) {
    case "giving_totals": {
      const t = await source.totals(call.period!);
      return JSON.stringify({
        period: t.label,
        gifts: t.gifts,
        raised: rand(t.raisedCents),
        donors: t.donors,
        with_s18a_receipt_asked: rand(t.s18aRequestedCents),
        refunds: { count: t.refunded, amount: rand(t.refundedCents) },
        chargebacks: t.chargedBack,
        pending: t.pending,
        failed: t.failed,
      });
    }
    case "giving_by_month": {
      const months = await source.byMonth();
      return JSON.stringify(months.map((m) => ({ month: m.month, gifts: m.gifts, raised: rand(m.raisedCents), from_monthly_donations: rand(m.monthlyCents) })));
    }
    case "monthly_donations": {
      const m = await source.monthly();
      return JSON.stringify({
        running: m.running,
        brings_in_each_month: rand(m.perMonthCents),
        being_retried_after_a_declined_card: m.retrying,
        paused: m.paused,
        ended: m.ended,
        next_collections: m.nextCharges.slice(0, 5).map((c) => ({ day: c.day, amount: rand(c.amountCents) })),
      });
    }
    case "setup_progress": {
      const s = await source.setup();
      const step = (x: SetupStep) => ({ step: x.label, done: x.done, ...(x.page ? { page_link: x.page } : {}), ...(x.who ? { who_does_it: x.who } : {}) });
      return JSON.stringify({ status: s.status, application_still_needs: s.application?.filter((x) => !x.done).map(step) ?? [], getting_started: s.gettingStarted.map(step) });
    }
    case "receipts_progress": {
      const years = await source.receipts();
      return JSON.stringify(years.map((y) => ({ tax_year: y.label, gifts_asking_for_s18a: y.giftsWanting, already_on_an_issued_receipt: y.onIssued, amount_asked_for: rand(y.wantingCents) })));
    }
    case "recent_gifts": {
      const gifts = await source.recentGifts(call.limit!, donorData);
      return JSON.stringify(
        gifts.map((g) => ({
          date: g.date,
          amount: rand(g.amountCents),
          status: g.status,
          monthly: g.monthly,
          ...(donorData ? { donor: g.anonymous ? "Anonymous" : cap(g.donor ?? "Unknown") } : {}),
        })),
      );
    }
    case "top_donors": {
      const donors = (await source.donors()).slice(0, call.limit!);
      return JSON.stringify(donors.map(donorLine));
    }
    case "find_donor": {
      const needle = call.search!.toLowerCase();
      const hits = (await source.donors()).filter((d) => !d.hidden && d.name.toLowerCase().includes(needle)).slice(0, 10);
      return JSON.stringify(hits.length ? hits.map(donorLine) : { found: 0, note: "No donor's name contains that. Anonymous donors can't be found by name." });
    }
  }
}

/** Names are typed by the public: kept short, so one can't carry a long message to the model (review 22/11/2026). */
const cap = (name: string) => (name.length > 80 ? `${name.slice(0, 80)}…` : name);

function donorLine(d: DonorSummary) {
  return { name: cap(d.name), gifts: d.gifts, total_given: rand(d.totalCents), first_gift: d.firstGift, last_gift: d.lastGift, ...(d.monthly === null ? {} : { gives_monthly: d.monthly }) };
}

/** A gift's amount for the helper: what is left after part refunds. */
export const giftCents = (g: { amount_cents: number; refunded_cents?: number | null }) => leftCents({ amount_cents: Number(g.amount_cents), refunded_cents: Number(g.refunded_cents ?? 0) });
