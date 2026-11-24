/**
 * The annual report worked out in the database (charity_report_summary, 24/11/2026) gives exactly what the page
 * worked out from every gift before. A stand-in follows the database function's rules step by step (one pass over the
 * gifts, grouped as the SQL groups them) and its answer, turned into the page's figures by reportFromSummary, must
 * equal annualReport on the same gifts. The loader uses the function, falls back to reading the gifts only when the
 * function is not on the database yet, and never takes a refusal for "not there yet".
 * The SQL itself is checked against the real database in report-summary-db.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { annualReport, pickReportYear, reportFromSummary, reportYears, toReportSummary, type ReportGift } from "@/lib/charity/annual-report";
import { platformConfig } from "@/config/platform";
import { taxYearFor } from "@/lib/dates";

vi.mock("server-only", () => ({}));

/** Johannesburg date parts, as `at time zone` gives them in the database. */
function local(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: platformConfig.timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { year: Number(get("year")), month: Number(get("month")), key: `${get("year")}-${get("month")}` };
}

/** The database function's rules, written out in JavaScript: what charity_report_summary answers for these gifts. */
function standIn(all: ReportGift[], onIssued: Set<string>, askedYear: number | null, currentYear: number) {
  const sm: number = platformConfig.taxYear.startMonth;
  const g = [...all]
    .filter((d) => ["paid", "refunded", "charged_back"].includes(d.status))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((d) => {
      const refunded = Number(d.refunded_cents ?? 0);
      const p = d.paid_at ? local(d.paid_at) : null;
      return { ...d, refunded, kept: Math.max(d.amount_cents - refunded, 0), p, ty: d.tax_year ?? (p ? p.year + (p.month >= sm ? 1 : 0) : null) };
    });
  const list = [...new Set([...g.map((d) => d.ty).filter((y): y is number => y !== null), currentYear])].sort((a, b) => b - a);
  const y = askedYear !== null && list.includes(askedYear) ? askedYear : list[0];
  const counted = g.filter((d) => d.status === "paid" && d.kept > 0);
  const paid = counted.filter((d) => d.ty === y);
  const minTy = new Map<string, number>();
  for (const d of counted) if (d.ty !== null) minTy.set(d.donor_id, Math.min(minTy.get(d.donor_id) ?? Infinity, d.ty));
  const sum = (rows: { kept: number }[]) => rows.reduce((t, d) => t + d.kept, 0);
  const distinct = (rows: { donor_id: string }[]) => new Set(rows.map((d) => d.donor_id)).size;
  const startKey = `${y - 1}-${String(sm).padStart(2, "0")}`;
  const endYear = sm === 1 ? y - 1 : y;
  const endKey = `${endYear}-${String(sm === 1 ? 12 : sm - 1).padStart(2, "0")}`;
  const months = new Map<string, { month: string; cents: number; count: number }>();
  for (const d of paid) {
    if (!d.p || d.p.key < startKey || d.p.key > endKey) continue;
    const m = months.get(d.p.key) ?? { month: d.p.key, cents: 0, count: 0 };
    m.cents += d.kept;
    m.count++;
    months.set(d.p.key, m);
  }
  const camps = new Map<string, { id: string; cents: number; count: number; first: string }>();
  for (const d of paid) {
    if (!d.campaign_id) continue;
    const c = camps.get(d.campaign_id) ?? { id: d.campaign_id, cents: 0, count: 0, first: d.id };
    c.cents += d.kept;
    c.count++;
    camps.set(d.campaign_id, c);
  }
  const undone = g.filter((d) => d.ty === y && (d.status === "refunded" || d.status === "charged_back" || (d.status === "paid" && d.refunded > 0)));
  const asked = paid.filter((d) => d.wants_18a);
  const waiting = asked.filter((d) => !onIssued.has(d.id));
  // The JSON the database sends: big numbers can arrive as strings.
  return {
    tax_year: y,
    years: list,
    total_cents: String(sum(paid)),
    donation_count: paid.length,
    donors: distinct(paid),
    new_donors: [...minTy.values()].filter((v) => v === y).length,
    monthly_cents: sum(paid.filter((d) => d.recurring_id)),
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    campaigns: [...camps.values()].sort((a, b) => b.cents - a.cents || (a.first < b.first ? -1 : 1)).map(({ id, cents, count }) => ({ id, cents, count })),
    refunded_count: undone.length,
    refunded_cents: undone.reduce((t, d) => t + (d.status === "paid" ? d.refunded : d.amount_cents), 0),
    s18a_donors: distinct(asked),
    s18a_waiting_donors: distinct(waiting),
    s18a_waiting_cents: sum(waiting),
  };
}

let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const hex = (n: number) => n.toString(16).padStart(12, "0");
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function madeUpGifts(count: number, donors: number): ReportGift[] {
  const edges = ["2026-02-28T21:59:59Z", "2026-02-28T22:00:00Z", "2025-02-28T21:30:00Z", "2024-02-29T22:00:01Z", "2026-03-31T22:30:00Z", "2026-11-30T22:00:00Z"];
  return Array.from({ length: count }, (_, i) => {
    const status = pick(["paid", "paid", "paid", "paid", "refunded", "charged_back"]);
    const amount = pick([1_000, 5_000, 5_000, 10_000, 25_000, 123_457]);
    const paidAt = rnd() < 0.1 ? pick(edges) : new Date(Date.UTC(2022, 0, 1) + rnd() * (Date.UTC(2026, 10, 24) - Date.UTC(2022, 0, 1))).toISOString();
    const hasPaid = status === "paid" || rnd() < 0.8;
    return {
      id: `00000000-0000-4000-8000-${hex(Math.floor(rnd() * 1e12))}${i}`.slice(0, 36),
      donor_id: `d${Math.floor(rnd() * donors)}`,
      status,
      amount_cents: amount,
      refunded_cents: status === "paid" && rnd() < 0.15 ? pick([amount, Math.floor(amount / 3), 1]) : 0,
      paid_at: hasPaid ? paidAt : null,
      tax_year: status === "paid" ? (rnd() < 0.05 ? taxYearFor(paidAt) + pick([-1, 1]) : taxYearFor(paidAt)) : rnd() < 0.5 ? null : taxYearFor(paidAt),
      recurring_id: rnd() < 0.3 ? pick(["r1", "r2"]) : null,
      campaign_id: rnd() < 0.4 ? pick(["c1", "c2", "c3", "c4"]) : null,
      wants_18a: rnd() < 0.4,
    };
  }).sort(byId); // The page read them in id order (charity_donations ... order by id).
}

const now = new Date("2026-11-24T10:00:00Z");
const titles = new Map([["c1", "Winter blankets"], ["c2", "School shoes"]]);

describe("the database's figures match the page's own sums", () => {
  for (const [count, donors] of [[400, 30], [600, 400], [50, 5], [0, 1]] as const) {
    it(`${count} made-up gifts from ${donors} donors, every year`, () => {
      const gifts = madeUpGifts(count, donors);
      const onIssued = new Set(gifts.filter((g) => g.wants_18a && rnd() < 0.5).map((g) => g.id));
      const years = reportYears(gifts, now);
      for (const asked of [NaN, 0, 1999, ...years]) {
        const year = pickReportYear(years, asked);
        const s = toReportSummary(standIn(gifts, onIssued, Number.isInteger(asked) ? asked : null, taxYearFor(now)));
        expect(s.years).toEqual(years);
        expect(s.taxYear).toBe(year);
        expect(reportFromSummary(s, titles, now)).toEqual(annualReport(gifts, year, titles, onIssued, now));
      }
    });
  }

  it("ties between campaigns keep the old order, and a nameless campaign is 'A campaign'", () => {
    const g = (id: string, campaign: string): ReportGift => ({ id, donor_id: "d", status: "paid", amount_cents: 5_000, paid_at: "2026-05-01T10:00:00Z", tax_year: 2027, recurring_id: null, campaign_id: campaign, wants_18a: false });
    const gifts = [g("0003", "c9"), g("0001", "c2"), g("0002", "c1")];
    const s = toReportSummary(standIn(gifts, new Set(), 2027, 2027));
    expect(reportFromSummary(s, titles, now).campaigns.map((c) => c.title)).toEqual(["School shoes", "Winter blankets", "A campaign"]);
    expect(reportFromSummary(s, titles, now)).toEqual(annualReport([...gifts].sort(byId), 2027, titles, new Set(), now));
  });
});

// The loader, with a stand-in for the database's API.
type Answer = { data: unknown; error: { code?: string; message: string } | null };
let rpcAnswer: Answer;
let gifts: ReportGift[] = [];
let issued: string[] = [];
const reads: string[] = [];
const rpcCalls: Record<string, unknown>[] = [];

function table(name: string) {
  reads.push(name);
  const rows = (): unknown[] =>
    name === "charity_donations" ? [...gifts].sort((a, b) => (a.id < b.id ? -1 : 1)) : name === "charity_receipt_donations" ? issued.map((donation_id) => ({ donation_id })) : [{ id: "c1", title: "Winter blankets" }];
  let from = 0, to = Infinity;
  const q = {
    select: () => q, eq: () => q, order: () => q, in: () => q, not: () => q, or: () => q,
    range: (a: number, b: number) => ((from = a), (to = b), q),
    then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve({ data: rows().slice(from, to + 1), error: null, count: rows().length }).then(ok, bad),
  };
  return q;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, ...args });
      return rpcAnswer;
    },
    from: (name: string) => table(name),
  }),
}));

const { loadAnnualReport } = await import("@/lib/charity/dashboard-queries");

describe("loadAnnualReport", () => {
  beforeEach(() => {
    reads.length = 0;
    rpcCalls.length = 0;
    gifts = madeUpGifts(300, 40);
    issued = gifts.filter((g) => g.wants_18a).slice(0, 10).map((g) => g.id);
  });

  it("asks the database for the figures, with the tax-year settings, and reads no gifts", async () => {
    rpcAnswer = { data: standIn(gifts, new Set(issued), 2026, taxYearFor(now)), error: null };
    const got = await loadAnnualReport("ch1", 2026, now);
    expect(rpcCalls).toEqual([{ fn: "charity_report_summary", p_charity_id: "ch1", p_asked_year: 2026, p_current_year: 2027, p_start_month: platformConfig.taxYear.startMonth, p_time_zone: platformConfig.timeZone }]);
    expect(reads).not.toContain("charity_donations");
    expect(got.year).toBe(2026);
    expect(got.years).toEqual(reportYears(gifts, now));
    expect(got.report).toEqual(annualReport(gifts, 2026, new Map([["c1", "Winter blankets"]]), new Set(issued), now));
  });

  it("sends no year when none (or nonsense) was asked for", async () => {
    rpcAnswer = { data: standIn(gifts, new Set(issued), null, taxYearFor(now)), error: null };
    await loadAnnualReport("ch1", NaN, now);
    expect(rpcCalls[0].p_asked_year).toBeNull();
  });

  for (const missing of [{ code: "PGRST202", message: "Could not find the function public.charity_report_summary in the schema cache" }, { code: "42883", message: "function does not exist" }]) {
    it(`falls back to reading the gifts, with the same answer, when the function is not there (${missing.code})`, async () => {
      rpcAnswer = { data: null, error: missing };
      const got = await loadAnnualReport("ch1", 2025, now);
      expect(reads).toContain("charity_donations");
      expect(reads).toContain("charity_receipt_donations");
      const years = reportYears(gifts, now);
      expect(got.years).toEqual(years);
      expect(got.year).toBe(pickReportYear(years, 2025));
      expect(got.report).toEqual(annualReport(gifts, got.year, new Map([["c1", "Winter blankets"]]), new Set(issued), now));
    });
  }

  it("a refusal is an error, never 'not there yet': no gifts are read", async () => {
    rpcAnswer = { data: null, error: { code: "P0001", message: "Not allowed" } };
    await expect(loadAnnualReport("ch1", 2027, now)).rejects.toThrow("Not allowed");
    expect(reads).not.toContain("charity_donations");
  });

  it("a permission error from the database is an error too", async () => {
    rpcAnswer = { data: null, error: { code: "42501", message: "permission denied for function charity_report_summary" } };
    await expect(loadAnnualReport("ch1", 2027, now)).rejects.toThrow(/permission denied/);
    expect(reads).not.toContain("charity_donations");
  });
});
