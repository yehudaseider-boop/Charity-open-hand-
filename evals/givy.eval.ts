/**
 * Givy's accuracy test set (27/11/2026, Yehuda chose it). Real charity questions asked of the REAL Givy (the live AI
 * model, through the real answering route) against the sample charity of the public demo, whose figures are known.
 * Each answer is checked for:
 *   - the right lookup (Givy looked it up rather than guessing),
 *   - the right figures (taken from the sample charity's own data, never typed in here),
 *   - no figure that matches nothing it looked up (the route's own accuracy note never appears),
 *   - Givezy's house style: no exclamation marks, no em dashes, no guilt words, no gateway names, sentence case,
 *   - and, where it should, a "take me there" button to the right page.
 *
 * Not part of `npm test`: it costs a few AI calls each run. Run with `npm run eval:givy` with ANTHROPIC_API_KEY set,
 * or from GitHub (Actions, "Givy accuracy", Run workflow), which uses the repository's ANTHROPIC_API_KEY secret.
 * Without a key every question is skipped, never failed. The score is printed at the end.
 */
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
// The demo needs no sign-in; limits and the database are not part of what is tested here.
vi.mock("@/lib/rate-limit", () => ({
  hitRateLimit: async () => false,
  forgetAttempts: async () => {},
  ipKeys: (ip: string) => [`ip:${ip}`],
}));
vi.mock("@/lib/auth", () => ({ getViewer: async () => null }));

const KEY = process.env.ANTHROPIC_API_KEY ?? "";
process.env.ASSISTANT = "yes";
process.env.ASSISTANT_DEMO = "yes";

const { POST } = await import("@/app/api/assistant/route");
const { demoSource } = await import("@/lib/assistant/demo-source");
const { splitNext } = await import("@/lib/assistant/suggestions");
const { formatRand } = await import("@/lib/money");

const source = demoSource();
type Facts = { thisMonth: string; lastMonth: string; taxYear: string; running: number; perMonth: string; topDonor: string | null };
let facts: Facts;
async function loadFacts(): Promise<Facts> {
  const [m, l, y, mo, top] = await Promise.all([source.totals("this_month"), source.totals("last_month"), source.totals("this_tax_year"), source.monthly(), source.donors()]);
  const sorted = top.filter((d) => !d.hidden && d.name).sort((a, b) => b.totalCents - a.totalCents);
  return {
    thisMonth: formatRand(m.raisedCents),
    lastMonth: formatRand(l.raisedCents),
    taxYear: formatRand(y.raisedCents),
    running: mo.running,
    perMonth: formatRand(mo.perMonthCents),
    topDonor: sorted[0]?.name ?? null,
  };
}

/** One question to Givy, as the demo dashboard's panel asks it. */
async function ask(question: string, page = "/demo/dashboard"): Promise<{ text: string; tools: string[]; go: string[] }> {
  const res = await POST(
    new Request("https://test.givezy.co.za/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://test.givezy.co.za", host: "test.givezy.co.za", "x-forwarded-for": "203.0.113.7" },
      body: JSON.stringify({ demo: true, page, messages: [{ role: "user", content: question }] }),
    }),
  );
  const raw = await res.text();
  expect(res.status, raw).toBe(200);
  const { text, tools, go } = splitNext(raw);
  return { text, tools: tools ?? [], go };
}

type Case = {
  q: string;
  /** At least one of these lookups must have run. */
  tools?: string[];
  /** Figures or words the answer must hold, from the sample charity's own data. */
  has?: (f: Facts) => (string | null)[];
  /** A "take me there" button that must be there. */
  go?: string;
  /** A how-to answer: no lookup needed. */
  howTo?: boolean;
};

const CASES: Case[] = [
  { q: "How much came in this month?", tools: ["giving_totals"], has: (f) => [f.thisMonth], go: "donations" },
  { q: "How much did we raise last month?", tools: ["giving_totals", "giving_by_month"], has: (f) => [f.lastMonth] },
  { q: "What have we raised this tax year?", tools: ["giving_totals"], has: (f) => [f.taxYear] },
  { q: "How does this month compare to last month?", tools: ["giving_totals", "giving_by_month"], has: (f) => [f.thisMonth, f.lastMonth] },
  { q: "Show me the trend over the last few months", tools: ["giving_by_month"] },
  { q: "How many monthly donations are running?", tools: ["monthly_donations"], has: (f) => [String(f.running)], go: "monthly" },
  { q: "What do our monthly donors bring in each month?", tools: ["monthly_donations"], has: (f) => [f.perMonth] },
  { q: "Are any monthly donations being retried?", tools: ["monthly_donations"], go: "monthly_declined" },
  { q: "When are the next monthly collections?", tools: ["monthly_donations"] },
  { q: "What were my most recent gifts?", tools: ["recent_gifts"], go: "donations" },
  { q: "How many gifts still need an s18A receipt?", tools: ["receipts_progress"], go: "receipts" },
  { q: "Who are my top donors?", tools: ["top_donors"], has: (f) => [f.topDonor], go: "donors" },
  { q: "Who gave for the first time this month?", tools: ["donor_list"] },
  { q: "Who stopped their monthly donation?", tools: ["donor_list"], go: "monthly_stopped" },
  { q: "Who asked for an s18A receipt and still has details missing?", tools: ["donor_list"], go: "donors_s18a_missing" },
  { q: "What's left to set up?", tools: ["setup_progress"], go: "overview" },
  { q: "How do I add someone to my team?", howTo: true },
  { q: "How do I add my logo?", howTo: true },
  { q: "How do s18A receipts work?", howTo: true },
  { q: "How do I record a cash gift?", howTo: true },
  { q: "How do I thank my donors?", howTo: true },
  { q: "What is the smallest donation a donor can give?", howTo: true, has: () => ["R30"] },
  // Things Givy must not make up.
  { q: "How much did we raise in 2019?", tools: ["giving_totals", "giving_by_month"] },
  { q: "What's the weather in Johannesburg?", howTo: true },
];

const results: { q: string; ok: boolean; why: string[] }[] = [];

describe.skipIf(!KEY)("Givy's accuracy test set (the real AI, the sample charity)", () => {
  for (const c of CASES) {
    it(c.q, { timeout: 90_000, retry: 0 }, async () => {
      facts ??= await loadFacts();
      const a = await ask(c.q);
      const why: string[] = [];
      if (!a.text.trim()) why.push("empty answer");
      if (a.text.includes("[[error]]")) why.push("Givy couldn't answer (the AI call failed)");
      if (c.tools && !c.tools.some((t) => a.tools.includes(t))) why.push(`expected a lookup (${c.tools.join(" or ")}), got ${a.tools.join(", ") || "none"}`);
      for (const want of c.has?.(facts) ?? []) if (want && !a.text.includes(want)) why.push(`missing "${want}"`);
      if (c.go && !a.go.includes(c.go)) why.push(`missing the "${c.go}" button (got ${a.go.join(", ") || "none"})`);
      if (/couldn't match R/.test(a.text)) why.push("a figure that matches nothing it looked up");
      if (/!/.test(a.text.replace(/\[[^\]]*\]\([^)]*\)/g, ""))) why.push("an exclamation mark");
      if (/—/.test(a.text)) why.push("an em dash");
      if (/\b(paystack|stitch|payfast|yoco)\b/i.test(a.text)) why.push("names a payment provider");
      if (/\b(you should feel|guilt|shame|don't miss out)\b/i.test(a.text)) why.push("guilt wording");
      results.push({ q: c.q, ok: why.length === 0, why });
      expect(why, a.text).toEqual([]);
    });
  }
  afterAll(() => {
    const passed = results.filter((r) => r.ok).length;
    console.log(`\n[givy accuracy] ${passed} of ${results.length} passed`);
    for (const r of results.filter((x) => !x.ok)) console.log(`  - ${r.q}: ${r.why.join("; ")}`);
  });
});
