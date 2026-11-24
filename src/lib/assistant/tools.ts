import type Anthropic from "@anthropic-ai/sdk";
import { formatRand } from "@/lib/money";
import { leftCents } from "@/lib/donations/what-is-left";
import { ERASED_DONOR, isErasedEmail } from "@/lib/charity/dashboard";
import { GIVY_AUDIENCE_KEYS, GIVY_AUDIENCES, checkDraft, type DraftAudience } from "./thank-you-draft";

/**
 * What the dashboard helper may look up about the charity it's asked from (22/11/2026, Yehuda: "answer questions
 * based off what's going on their dashboard, and help set up the account"). Every tool only reads, and only what the
 * person asking may already see on their dashboard: the live source reads as them, so row-level security decides.
 * Donors' names are a separate switch (ASSISTANT_DONOR_DATA): without it the donor tools aren't offered at all, are
 * refused if asked for anyway, and gifts are shown without names. ID numbers, addresses, card and bank details are
 * never sent.
 *
 * Names (24/11/2026, Yehuda: "Givy must see names and know names"): with the names switch on, Givy can also answer
 * about one named donor (donor_giving), read the Donors page's lists by name (donor_list, at most 25 names a time)
 * and prepare a thank-you to one named donor (prepare_thank_you_to_donor). A donor is always found by name on the
 * server, in this charity's own list; anonymous and erased donors are never found and never named.
 *
 * Contact details (24/11/2026): a third switch (ASSISTANT_CONTACT_DATA, which needs the names switch too) offers
 * donor_contact to roles that see contact details on the Donors page: one named donor's email address and phone
 * number, never a list of them. Without it, no tool returns an email address or phone number.
 *
 * The one writing tool (24/11/2026): prepare_thank_you keeps a draft thank-you for the person to check and send on the
 * Email donors page. It is offered only to roles that may email donors, and it never sends anything.
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
  /**
   * What the name tools need (24/11/2026, only read with donors' names switched on). `id` stays on the server: it is
   * never written into anything the model sees, only used to read one donor's gifts or to address a one-donor draft.
   */
  id?: string;
  /** Their monthly donation now: running, paused, stopped (ended, or the card was declined every time), or none. */
  monthlyState?: MonthlyState;
  /** What their running monthly donations bring in each month. */
  monthlyCents?: number;
  /** When their last monthly donation stopped (dd/mm/yyyy), and how; with an ISO moment for ordering only. */
  stopped?: { on: string | null; how: "ended" | "card declined"; at: string | null } | null;
  /** Whether their first paid gift was this month, last month or this tax year. */
  newIn?: { this_month: boolean; last_month: boolean; this_tax_year: boolean };
  /** Their first gift as an ISO moment, for ordering only. */
  firstAt?: string | null;
  /** They asked for an s18A receipt on at least one gift. */
  s18aAsked?: boolean;
};

export type MonthlyState = "running" | "paused" | "stopped" | "none";

/** One of a donor's gifts, newest first, for donor_giving. */
export type DonorGift = { date: string | null; amountCents: number; status: string; monthly: boolean; thisTaxYear: boolean };

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
  /** One donor's gifts to this charity, newest first, and the tax year's name (names switched on only). */
  donorGifts?(donorId: string): Promise<{ taxYear: string; gifts: DonorGift[] }>;
  /**
   * Donors whose s18A receipt still lacks details, by donor id, with what is missing in words ("SA ID number",
   * "address"): what is missing, never the details themselves. Null when it couldn't be checked.
   */
  s18aMissing?(): Promise<Map<string, string[]> | null>;
  /**
   * One donor's email address and phone number, read as the person asking (a role that can't see contact details
   * gets nulls from the database). Only for donor_contact, with the contact switch on.
   */
  donorContact?(donorId: string): Promise<{ email: string | null; phone: string | null }>;
}

/**
 * Givy's one writing tool (24/11/2026): it keeps a draft thank-you for the person to check and send on the Email
 * donors page. It never sends anything. `count` and `label`: how many donors the audience reaches now, worked out on
 * the server (null when that couldn't be worked out). `draftId`: null when the draft couldn't be kept.
 */
export interface ThankYouPreparer {
  /** `names`: who is in it (only with donors' names switched on; anonymous donors as "Anonymous donor"). */
  prepare(d: { audience: DraftAudience; subject: string; body: string }): Promise<{ count: number | null; label: string | null; draftId: string | null; names?: string[] } | { refused: string }>;
  /** The charity's own name, which a draft may use as it is spelt (checkDraft). */
  charityName?(): Promise<string | null>;
}

/** The donor lists Givy may read by name (24/11/2026), with what each means. */
export const DONOR_LISTS = {
  stopped_monthly: "donors whose monthly donation stopped (they ended it, or the card was declined every time) and who have none running now, most recent first",
  paused_monthly: "donors whose monthly donation is paused",
  gives_monthly: "donors with a monthly donation running now",
  first_gift_this_month: "donors who gave for the first time this month",
  first_gift_last_month: "donors who gave for the first time last month",
  first_gift_this_tax_year: "donors who gave for the first time this tax year (from 1 March)",
  s18a_asked: "donors who asked for an s18A receipt",
  s18a_details_missing: "donors who asked for an s18A receipt and still have details missing for it (what is missing, never the details)",
} as const;
export type DonorListKey = keyof typeof DONOR_LISTS;
const DONOR_LIST_KEYS = Object.keys(DONOR_LISTS) as DonorListKey[];

/** At most this many names in one answer: the rest are counted ("and 12 more"). */
export const NAMES_IN_ANSWER = 25;

const PERIODS: PeriodKey[] = ["this_month", "last_month", "this_tax_year", "all_time"];

// Inputs stream as they are written (eager_input_streaming), so checkToolCall validates each one before it runs.
const tool = (name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []): Anthropic.Beta.BetaTool => ({
  name,
  description,
  input_schema: { type: "object", properties, required, additionalProperties: false },
  strict: true,
  eager_input_streaming: true,
});

/**
 * The tools offered, in a fixed order so the request's start stays the same and is cached. `canDraft`: the person's
 * role may email donors (and it isn't the demo), so prepare_thank_you is offered too, last (and, with names on,
 * prepare_thank_you_to_donor). `canContact`: the contact switch is on and the person's role sees contact details on
 * the Donors page, so donor_contact is offered (only with names on too).
 */
export function toolDefinitions(donorData: boolean, canDraft = false, canContact = false): Anthropic.Beta.BetaTool[] {
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
      tool(
        "donor_giving",
        "Everything about ONE named donor's giving to this charity: total given, number of gifts, first and last gift, what they gave this tax year, their most recent gifts (date, amount, monthly or not), whether their monthly donation is running, paused or stopped, whether they asked for an s18A receipt and what is still missing for it. Use for 'when did Moshe last give', 'how much has she given this year', 'does he give monthly'. If several donors match, it lists them so you can ask which one; then call again with that donor's last_gift. Never returns contact details.",
        {
          name: { type: "string", description: "The donor's name or part of it, at least 2 letters" },
          last_gift: { type: "string", description: "Only to choose between donors with the same name: that donor's last gift date as dd/mm/yyyy, exactly as a list gave it. Otherwise an empty string." },
        },
        ["name", "last_gift"],
      ),
      tool(
        "donor_list",
        `Donors by name from one of the Donors page's lists (at most ${NAMES_IN_ANSWER} names, then how many more). Lists: ${DONOR_LIST_KEYS.map((k) => `${k} (${DONOR_LISTS[k]})`).join("; ")}. Anonymous donors are listed without a name. Never returns contact details.`,
        { list: { type: "string", enum: DONOR_LIST_KEYS, description: "Which list" } },
        ["list"],
      ),
    );
  }
  if (donorData && canContact) {
    tools.push(
      tool(
        "donor_contact",
        "The email address and phone number of ONE named donor, for this person to contact them. Use only when they ask for that donor's email or phone. One donor at a time, never a list. If several donors match, it lists them (without contact details) so you can ask which one; then call again with that donor's last_gift. Nothing else about the donor: never an ID number, address, card or bank details.",
        {
          name: { type: "string", description: "The donor's name or part of it, at least 2 letters" },
          last_gift: { type: "string", description: "Only to choose between donors with the same name: that donor's last gift date as dd/mm/yyyy, exactly as a list gave it. Otherwise an empty string." },
        },
        ["name", "last_gift"],
      ),
    );
  }
  if (canDraft) {
    tools.push(
      tool(
        "prepare_thank_you",
        `Prepare (never send) a thank-you email to a group of the charity's donors. It keeps your draft and adds a button under your answer that opens the Email donors page with the group chosen and your words filled in; the person checks who it goes to, edits the words and presses Send themselves. Use only when they ask for a thank-you (or similar message) to a group of donors. Groups: ${GIVY_AUDIENCE_KEYS.map((k) => `${k} (${GIVY_AUDIENCES[k]})`).join("; ")}. Write in the charity's voice: warm, short (2 to 5 sentences), plain, no guilt, no pressure to give again, no exclamation marks, no numbers or figures of any kind, no impact claims you weren't told, no links, no religious wording unless it is the charity's own words, and no greeting or sign-off (the email adds "Dear" and the donor's first name, and the charity's name).`,
        {
          audience: { type: "string", enum: GIVY_AUDIENCE_KEYS, description: "Who it is for" },
          subject: { type: "string", description: "The email's subject, 3 to 120 characters" },
          message: { type: "string", description: "The message, 2 to 5 short sentences, no greeting or sign-off" },
        },
        ["audience", "subject", "message"],
      ),
    );
    if (donorData) {
      tools.push(
        tool(
          "prepare_thank_you_to_donor",
          `Prepare (never send) a thank-you email to ONE named donor. The donor is found by name in this charity's list; if several match, nothing is prepared and you get the list so you can ask which one, then call again with that donor's last_gift. It adds a button under your answer that opens the Email donors page with only that donor chosen and your words filled in; the person checks it and presses Send themselves, and every usual limit and opt-out applies. Write as for prepare_thank_you: warm, short (2 to 5 sentences), plain, no guilt or pressure, no exclamation marks, no numbers, no links, no greeting or sign-off (the email adds "Dear" and their first name).`,
          {
            donor_name: { type: "string", description: "The donor's name or part of it, at least 2 letters" },
            last_gift: { type: "string", description: "Only to choose between donors with the same name: that donor's last gift date as dd/mm/yyyy, exactly as a list gave it. Otherwise an empty string." },
            subject: { type: "string", description: "The email's subject, 3 to 120 characters" },
            message: { type: "string", description: "The message, 2 to 5 short sentences, no greeting or sign-off" },
          },
          ["donor_name", "last_gift", "subject", "message"],
        ),
      );
    }
  }
  return tools;
}

/** The tools each call may use, by name. */
export type ToolName =
  | "giving_totals"
  | "giving_by_month"
  | "monthly_donations"
  | "setup_progress"
  | "receipts_progress"
  | "recent_gifts"
  | "top_donors"
  | "find_donor"
  | "donor_giving"
  | "donor_list"
  | "donor_contact"
  | "prepare_thank_you"
  | "prepare_thank_you_to_donor";

type Checked =
  | {
      ok: true;
      name: ToolName;
      period?: PeriodKey;
      limit?: number;
      search?: string;
      lastGift?: string;
      list?: DonorListKey;
      draft?: { audience: DraftAudience; subject: string; body: string };
    }
  | { ok: false; error: string };

/** What a role that can't email donors is told (and Givy passes on). */
export const NO_DRAFT_FOR_ROLE = "This person's role can't email donors, so you can't prepare a thank-you for them. Tell them plainly to ask their charity's owner or admin.";

/** A second contact lookup in one answer is refused: one donor at a time. */
export const ONE_CONTACT_PER_ANSWER = "One donor's contact details per answer. Answer with the one you have; they can ask about another donor next.";

/** What Givy is told when donors' names are switched off. */
export const NO_DONOR_DATA = "Donors' details aren't available.";

/** What Givy is told when contact details are switched off, or the person's role can't see them. */
export const NO_CONTACT = "Contact details can't be looked up here. Tell them plainly: donors' email addresses and phone numbers are on the Donors page for roles that may see them; if their role can't, they can ask their charity's owner or admin.";

const clampLimit = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? Math.min(10, Math.max(1, v)) : null);
const searchOf = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 60) : "");
const lastGiftOf = (v: unknown) => (typeof v === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(v.trim()) ? v.trim() : "");

/**
 * Checks a tool call's name and input before it runs (the input can arrive incomplete while streaming). Refused here
 * too, not only left out of the list: a name tool without the names switch, a draft for a role that can't email
 * donors, and a contact lookup without both switches or for a role that can't see contact details.
 */
export function checkToolCall(name: string, input: unknown, donorData: boolean, canDraft = false, canContact = false, charityName: string | null = null): Checked {
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
      if (name === "top_donors" && !donorData) return { ok: false, error: NO_DONOR_DATA };
      const limit = clampLimit(i.limit);
      return limit ? { ok: true, name, limit } : { ok: false, error: "limit must be a whole number from 1 to 10." };
    }
    case "find_donor":
    case "donor_giving":
    case "donor_contact": {
      if (!donorData) return { ok: false, error: name === "donor_contact" ? NO_CONTACT : NO_DONOR_DATA };
      if (name === "donor_contact" && !canContact) return { ok: false, error: NO_CONTACT };
      const search = searchOf(i.name);
      if (search.length < 2) return { ok: false, error: "name must be at least 2 letters." };
      return name === "find_donor" ? { ok: true, name, search } : { ok: true, name, search, lastGift: lastGiftOf(i.last_gift) };
    }
    case "donor_list": {
      if (!donorData) return { ok: false, error: NO_DONOR_DATA };
      return DONOR_LIST_KEYS.includes(i.list as DonorListKey) ? { ok: true, name, list: i.list as DonorListKey } : { ok: false, error: `list must be one of ${DONOR_LIST_KEYS.join(", ")}.` };
    }
    case "prepare_thank_you": {
      // Refused here too, not only left out of the list: a role that can't email donors never gets a draft.
      if (!canDraft) return { ok: false, error: NO_DRAFT_FOR_ROLE };
      const d = checkDraft(i, charityName);
      return d.ok ? { ok: true, name, draft: { audience: d.audience, subject: d.subject, body: d.body } } : { ok: false, error: d.error };
    }
    case "prepare_thank_you_to_donor": {
      if (!donorData) return { ok: false, error: NO_DONOR_DATA };
      if (!canDraft) return { ok: false, error: NO_DRAFT_FOR_ROLE };
      const search = searchOf(i.donor_name);
      if (search.length < 2) return { ok: false, error: "donor_name must be at least 2 letters." };
      // The words get the same checks as a group thank-you; who it is for is found on the server afterwards.
      const d = checkDraft({ audience: "all", subject: i.subject, message: i.message }, charityName);
      if (!d.ok) return { ok: false, error: d.error };
      // The audience is filled in by runPrepareForDonor once the donor is found: until then, nobody.
      return { ok: true, name, search, lastGift: lastGiftOf(i.last_gift), draft: { audience: "all", subject: d.subject, body: d.body } };
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
    case "donor_giving": {
      // Never without the names switch, whatever called it (checkToolCall refuses it too).
      if (!donorData) return JSON.stringify({ error: NO_DONOR_DATA });
      const found = resolveDonor(await source.donors(), call.search!, call.lastGift);
      if (!("one" in found)) return JSON.stringify(notOne(found));
      return JSON.stringify(await donorGiving(found.one, source));
    }
    case "donor_list": {
      if (!donorData) return JSON.stringify({ error: NO_DONOR_DATA });
      return JSON.stringify(await donorList(call.list!, source));
    }
    case "donor_contact": {
      // The contact switch and the role are checked by checkToolCall (canContact); the names switch again here.
      if (!donorData) return JSON.stringify({ error: NO_CONTACT });
      const found = resolveDonor(await source.donors(), call.search!, call.lastGift);
      if (!("one" in found)) return JSON.stringify(notOne(found));
      const d = found.one;
      if (!d.id || !source.donorContact) return JSON.stringify({ error: NO_CONTACT });
      const c = await source.donorContact(d.id);
      // Only an email address and a phone number, each checked to be just that; an erased donor's is never shown.
      const erased = isErasedEmail(c.email);
      const email = c.email && !erased && EMAIL.test(c.email.trim()) ? c.email.trim() : null;
      const phone = c.phone && !erased && PHONE.test(c.phone.trim()) ? c.phone.trim() : null;
      return JSON.stringify({
        name: shownName(d),
        email: erased ? ERASED_DONOR : (email ?? "Not on record, or your role can't see it"),
        phone: phone ?? "Not on record, or your role can't see it",
        note: "Give only what was asked, for contacting this donor. Don't put it in a list or repeat it later in the chat.",
      });
    }
    case "prepare_thank_you":
    case "prepare_thank_you_to_donor":
      // Has side effects (it keeps a draft), so it runs only through runPrepare, with the person's preparer.
      throw new Error(`${call.name} runs through runPrepare`);
  }
}

const EMAIL = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z]{2,24}$/i;
const PHONE = /^\+?[\d\s()-]{7,20}$/;

/** At most this many donors when a name matches several: enough to ask which one. */
const CANDIDATES = 10;

export type Resolved = { one: DonorSummary } | { none: true; lastGift: string } | { several: DonorSummary[]; more: number };

/**
 * One donor by name (24/11/2026), the same way find_donor searches: part of a name, in this charity's own list (the
 * source only ever holds the charity's donors), never an anonymous or erased one. A name that is exactly one donor's
 * full name picks them even when it is part of another's ("Moshe Katz", not "Moshe Katzenberg"). `lastGift`
 * (dd/mm/yyyy, as a list gave it) chooses between donors with the same name.
 */
export function resolveDonor(donors: DonorSummary[], search: string, lastGift = ""): Resolved {
  const needle = search.replace(/\s+/g, " ").trim().toLowerCase();
  let hits = donors.filter((d) => !d.hidden && needle.length >= 2 && d.name.toLowerCase().includes(needle));
  if (lastGift) hits = hits.filter((d) => d.lastGift === lastGift);
  if (hits.length === 1) return { one: hits[0] };
  if (hits.length === 0) return { none: true, lastGift };
  const exact = hits.filter((d) => d.name.replace(/\s+/g, " ").trim().toLowerCase() === needle);
  if (exact.length === 1) return { one: exact[0] };
  return { several: hits.slice(0, CANDIDATES), more: Math.max(0, hits.length - CANDIDATES) };
}

/** What Givy is told when a name isn't exactly one donor: nobody, or the candidates to ask about (never contact details). */
function notOne(r: Exclude<Resolved, { one: DonorSummary }>) {
  if ("none" in r) {
    return {
      found: 0,
      note: r.lastGift
        ? "No donor with that name had their last gift on that date. Nothing else was looked up."
        : "No donor's name contains that. Anonymous donors and donors erased at their request can't be found by name. Nothing else was looked up.",
    };
  }
  return {
    found: r.several.length + r.more,
    several_match: r.several.map((d) => ({ name: cap(d.name), last_gift: d.lastGift, total_given: rand(d.totalCents) })),
    ...(r.more ? { and_more: r.more } : {}),
    note: "Several donors match, so nothing else was looked up. Ask which one they mean (you may show these names and last gift dates), then call again with that donor's full name and last_gift. If two have the same name and last gift, ask them to open the donor on the Donors page.",
  };
}

const MONTHLY_WORDS: Record<MonthlyState, string> = {
  running: "gives every month (running now)",
  paused: "monthly donation paused",
  stopped: "monthly donation stopped",
  none: "no monthly donation",
};

/** One named donor's giving, as the Donors page and the donor's own page show it. */
async function donorGiving(d: DonorSummary, source: HelperSource) {
  const out: Record<string, unknown> = { ...donorLine(d) };
  if (d.monthlyState) {
    out.monthly =
      d.monthlyState === "running" && d.monthlyCents
        ? `${MONTHLY_WORDS.running}, ${rand(d.monthlyCents)} a month`
        : d.monthlyState === "stopped" && d.stopped
          ? `${MONTHLY_WORDS.stopped}${d.stopped.on ? ` on ${d.stopped.on}` : ""} (${d.stopped.how === "ended" ? "it was ended" : "the card was declined every time"})`
          : MONTHLY_WORDS[d.monthlyState];
  }
  if (d.s18aAsked !== undefined) out.asked_for_an_s18a_receipt = d.s18aAsked;
  if (d.s18aAsked && d.id && source.s18aMissing) {
    const missing = await source.s18aMissing().catch(() => null);
    out.s18a_details_missing = missing === null ? "couldn't be checked just now (see the Donors page)" : (missing.get(d.id) ?? []);
  }
  if (d.id && source.donorGifts) {
    const { taxYear, gifts } = await source.donorGifts(d.id);
    const thisYear = gifts.filter((g) => g.thisTaxYear && g.status === "paid");
    out.this_tax_year = { tax_year: taxYear, gifts: thisYear.length, given: rand(thisYear.reduce((t, g) => t + g.amountCents, 0)) };
    out.recent_gifts = gifts.slice(0, 10).map((g) => ({ date: g.date, amount: rand(g.amountCents), status: g.status, monthly: g.monthly }));
  }
  return out;
}

/** A Donors page list by name: at most NAMES_IN_ANSWER, then how many more. Anonymous donors are never named. */
async function donorList(list: DonorListKey, source: HelperSource) {
  const all = await source.donors();
  const name = shownName;
  let rows: Record<string, unknown>[];
  switch (list) {
    case "stopped_monthly":
      rows = all
        .filter((d) => d.monthlyState === "stopped")
        .sort((a, b) => String(b.stopped?.at ?? "").localeCompare(String(a.stopped?.at ?? "")))
        .map((d) => ({ name: name(d), stopped_on: d.stopped?.on ?? null, how: d.stopped?.how === "ended" ? "ended" : "card declined every time", total_given: rand(d.totalCents) }));
      break;
    case "paused_monthly":
      rows = all.filter((d) => d.monthlyState === "paused").map((d) => ({ name: name(d), last_gift: d.lastGift, total_given: rand(d.totalCents) }));
      break;
    case "gives_monthly":
      rows = all.filter((d) => d.monthlyState === "running").map((d) => ({ name: name(d), ...(d.monthlyCents ? { per_month: rand(d.monthlyCents) } : {}), since: d.firstGift }));
      break;
    case "first_gift_this_month":
    case "first_gift_last_month":
    case "first_gift_this_tax_year": {
      const period = list.slice("first_gift_".length) as keyof NonNullable<DonorSummary["newIn"]>;
      rows = all
        .filter((d) => d.newIn?.[period])
        .sort((a, b) => String(b.firstAt ?? "").localeCompare(String(a.firstAt ?? "")))
        .map((d) => ({ name: name(d), first_gift: d.firstGift, total_given: rand(d.totalCents) }));
      break;
    }
    case "s18a_asked":
      rows = all.filter((d) => d.s18aAsked).map((d) => ({ name: name(d), total_given: rand(d.totalCents), last_gift: d.lastGift }));
      break;
    case "s18a_details_missing": {
      const missing = source.s18aMissing ? await source.s18aMissing() : null;
      if (missing === null) return { list: DONOR_LISTS[list], error: "Which donors have s18A details missing couldn't be checked just now. Point them to the Donors page's Details missing filter." };
      rows = all.filter((d) => d.id && missing.has(d.id)).map((d) => ({ name: name(d), still_needed: missing.get(d.id!) }));
      break;
    }
  }
  return {
    list: DONOR_LISTS[list],
    count: rows.length,
    donors: rows.slice(0, NAMES_IN_ANSWER),
    ...(rows.length > NAMES_IN_ANSWER ? { and_more: rows.length - NAMES_IN_ANSWER, note: "Only the first names are here: the Donors page lists everyone." } : {}),
  };
}

/**
 * Runs a checked prepare_thank_you or prepare_thank_you_to_donor call: keeps the draft (through the preparer, which
 * checks the role and the page again) and words the result for the model. Sends nothing. `prepared` is what the
 * panel's button needs, or null.
 *
 * With donors' names on (`donorData`), a group thank-you also says who is in it (at most NAMES_IN_ANSWER names, then
 * how many more), and a one-donor thank-you finds its donor by name in `source` first: nobody, or several (Givy
 * asks which one), prepares nothing.
 */
export async function runPrepare(
  call: Extract<Checked, { ok: true }>,
  preparer: ThankYouPreparer | null,
  opts: { donorData?: boolean; source?: HelperSource } = {},
): Promise<{ text: string; isError: boolean; prepared: { draftId: string | null; audience: DraftAudience } | null }> {
  if ((call.name !== "prepare_thank_you" && call.name !== "prepare_thank_you_to_donor") || !call.draft) throw new Error("not a prepare_thank_you call");
  if (!preparer) return { text: NO_DRAFT_FOR_ROLE, isError: true, prepared: null };
  let draft = call.draft;
  let who: string | null = null;
  if (call.name === "prepare_thank_you_to_donor") {
    // Never without the names switch, and never to a group: no donor found means nothing is prepared.
    if (!opts.donorData || !opts.source) return { text: NO_DONOR_DATA, isError: true, prepared: null };
    const found = resolveDonor(await opts.source.donors(), call.search ?? "", call.lastGift);
    if (!("one" in found)) return { text: JSON.stringify({ prepared: false, sent: false, ...notOne(found) }), isError: true, prepared: null };
    if (!found.one.id) return { text: "Nothing was prepared: that donor couldn't be addressed just now. Point them to the Donors page.", isError: true, prepared: null };
    draft = { ...draft, audience: `donor:${found.one.id}` };
    who = shownName(found.one);
  }
  const r = await preparer.prepare(draft);
  if ("refused" in r) return { text: `Nothing was prepared: ${r.refused}`, isError: true, prepared: null };
  const reach = who
    ? r.count === 0
      ? `It is for ${who} only, but they can't be emailed just now (they asked not to get emails, were already messaged this week, or only have gifts the charity recorded); the page says so when they press Check who it goes to.`
      : `It is for ${who} only${r.count === null ? "" : ", before the page's own checks"}.`
    : r.count === null
      ? "How many donors it reaches couldn't be worked out just now; the page shows it when they press Check who it goes to."
      : `It would reach ${r.count} ${r.count === 1 ? "donor" : "donors"} now (${r.label}), before the page's own checks; the page shows the exact number.`;
  const names = !who && opts.donorData && r.names ? r.names.map((n) => cap(n)) : null;
  const kept = r.draftId
    ? "A button under your answer opens the Email donors page with this filled in."
    : `The words couldn't be kept for the page, so a button under your answer opens the Email donors page with only ${who ? "that donor" : "the group"} chosen: write the subject and message in your answer so they can copy them.`;
  return {
    text: JSON.stringify({
      prepared: true,
      sent: false,
      reach,
      ...(names ? { who_is_in_it: names.slice(0, NAMES_IN_ANSWER), ...(names.length > NAMES_IN_ANSWER ? { and_more: names.length - NAMES_IN_ANSWER } : {}) } : {}),
      next: `${kept} Tell them in a sentence or two: you prepared it and nothing has been sent; they check who it goes to, can change the words, then press Send. Donors who use the Givezy app also see it there. Don't repeat the whole message unless asked.${names ? " Name who is in it only if they ask." : ""}`,
    }),
    isError: false,
    prepared: { draftId: r.draftId, audience: draft.audience },
  };
}

const ERASED_NAME = ERASED_DONOR;

/**
 * Names are typed by the public: kept short, so one can't carry a long message to the model (review 22/11/2026), and
 * anything in one that looks like an email address or a phone or ID number is taken out (24/11/2026), so no
 * contact detail reaches the model through a name.
 */
const cap = (raw: string) => {
  const name = raw
    .replace(/\S+@\S+/g, "[email removed]")
    .replace(/\+?\d[\d\s()-]{5,}\d/g, "[number removed]")
    .replace(/\s+/g, " ")
    .trim();
  return name.length > 80 ? `${name.slice(0, 80)}…` : name;
};

/** A donor's name as Givy may say it: an anonymous donor never by name, an erased one only as the placeholder. */
function shownName(d: DonorSummary): string {
  if (!d.hidden) return cap(d.name);
  return d.name === ERASED_NAME ? ERASED_NAME : "Anonymous donor";
}

function donorLine(d: DonorSummary) {
  return { name: shownName(d), gifts: d.gifts, total_given: rand(d.totalCents), first_gift: d.firstGift, last_gift: d.lastGift, ...(d.monthly === null ? {} : { gives_monthly: d.monthly }) };
}

/** A gift's amount for the helper: what is left after part refunds. */
export const giftCents = (g: { amount_cents: number; refunded_cents?: number | null }) => leftCents({ amount_cents: Number(g.amount_cents), refunded_cents: Number(g.refunded_cents ?? 0) });
