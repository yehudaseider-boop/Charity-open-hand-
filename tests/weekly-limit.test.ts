/**
 * One message a week per donor from a charity (Yehuda, 09/11/2026), applied by every sender: news emails and
 * appeals leave out (and count) donors already messaged this week, both when checking who it goes to and as each
 * one goes. Against an in-memory database.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emailHash } from "@/lib/charity/thank-you";

vi.mock("server-only", () => ({}));
const sent: { to: string }[] = [];
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/email", () => ({ getEmailTransport: () => ({ send: async (m: { to: string }) => (sent.push(m), "sent") }) }));
const donors = [
  { donor_id: "sarah", email: "sarah@x.co", display_name: "Sarah Cohen", donor_type: "individual" },
  { donor_id: "david", email: "david@x.co", display_name: "David Mokoena", donor_type: "individual" },
  { donor_id: "thandi", email: "thandi@x.co", display_name: "Thandi Nkosi", donor_type: "individual" },
];
vi.mock("@/lib/charity/dashboard-queries", () => ({ loadDonors: async () => donors }));
vi.mock("@/lib/charity/donor-care", () => ({ lapsedDaysFor: async () => 365, listSegments: async () => [], listTags: async () => [], tagsByDonor: async () => new Map() }));

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let patch: Row | null = null;
  const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
  const b: Record<string, unknown> = {};
  for (const m of ["select", "order", "limit"]) b[m] = () => b;
  b.eq = (col: string, v: unknown) => (filters.push((r) => r[col] === v), b);
  b.neq = (col: string, v: unknown) => (filters.push((r) => r[col] !== v), b);
  b.in = (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), b);
  b.gte = (col: string, v: string) => (filters.push((r) => new Date(String(r[col])).getTime() >= new Date(v).getTime()), b);
  b.range = async (from: number, to: number) => ({ data: rows().slice(from, to + 1), error: null });
  b.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null });
  b.update = (p: Row) => ((patch = p), b);
  b.insert = (row: Row) => ((tables[table] ??= []).push(row), Promise.resolve({ error: null }));
  b.then = (ok: (v: unknown) => unknown) => {
    if (patch) for (const r of rows()) Object.assign(r, patch);
    return Promise.resolve({ data: patch ? null : rows(), error: null }).then(ok);
  };
  return b;
}
const rpc = async (_name: string, { p_appeal_id }: { p_appeal_id: string }) => {
  const waiting = (tables.charity_appeal_recipients ?? []).filter((r) => r.appeal_id === p_appeal_id && r.status === "waiting");
  for (const r of waiting) Object.assign(r, { status: "sending", claimed_at: new Date().toISOString() });
  return { data: waiting.map((r) => ({ donor_id: r.donor_id })), error: null };
};
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: query, rpc }) }));

const { messagedThisWeek } = await import("@/lib/charity/weekly-limit");
const { pickAudience, sendAppeal } = await import("@/lib/charity/appeals");

const NOW = new Date("2026-11-10T10:00:00+02:00");
const THIS_WEEK = "2026-11-09T09:00:00+02:00";
const LAST_WEEK = "2026-11-08T23:00:00+02:00";
const pairs = (ids: string[]) => ids.map((id) => ({ donorId: id, hash: emailHash(`${id}@x.co`) }));

beforeEach(() => {
  sent.length = 0;
  process.env.SITE_URL = "https://g.test";
  tables = {
    donations: donors.map((d) => ({ donor_id: d.donor_id, charity_id: "c1", status: "paid", gateway: "card", id: `g-${d.donor_id}` })),
    charity_email_opt_outs: [],
    thank_you_opt_outs: [],
    charity_donor_thanks: [],
    charity_appeal_recipients: [],
    charity_thank_yous: [],
    charity_thank_you_recipients: [],
  };
});

describe("who had a message this week", () => {
  it("counts a thank-you or reminder, an appeal and the monthly thank-you, this week only and this charity only", async () => {
    tables.charity_donor_thanks = [{ charity_id: "c1", donor_id: "sarah", week_start: "2026-11-09" }, { charity_id: "c2", donor_id: "thandi", week_start: "2026-11-09" }];
    tables.charity_appeal_recipients = [
      { charity_id: "c1", appeal_id: "a1", donor_id: "david", status: "sent", claimed_at: THIS_WEEK },
      { charity_id: "c1", appeal_id: "a0", donor_id: "thandi", status: "sent", claimed_at: LAST_WEEK },
    ];
    expect([...(await messagedThisWeek("c1", pairs(["sarah", "david", "thandi"]), NOW))].sort()).toEqual(["david", "sarah"]);
    tables.charity_thank_yous = [{ id: "t1", charity_id: "c1", sent_at: THIS_WEEK }];
    tables.charity_thank_you_recipients = [{ thank_you_id: "t1", email_hash: emailHash("thandi@x.co"), status: "sent", claimed_at: THIS_WEEK }];
    expect((await messagedThisWeek("c1", pairs(["thandi"]), NOW)).has("thandi")).toBe(true);
  });

  it("a failed or skipped email didn't reach them, so it doesn't count", async () => {
    tables.charity_appeal_recipients = [
      { charity_id: "c1", appeal_id: "a1", donor_id: "david", status: "failed", claimed_at: THIS_WEEK },
      { charity_id: "c1", appeal_id: "a1", donor_id: "sarah", status: "skipped", claimed_at: THIS_WEEK },
    ];
    expect((await messagedThisWeek("c1", pairs(["sarah", "david"]), NOW)).size).toBe(0);
  });

  it("the send that is asking never counts against itself", async () => {
    tables.charity_appeal_recipients = [{ charity_id: "c1", appeal_id: "a1", donor_id: "david", status: "sending", claimed_at: THIS_WEEK }];
    expect((await messagedThisWeek("c1", pairs(["david"]), NOW, { appealId: "a1" })).size).toBe(0);
    tables.charity_thank_yous = [{ id: "t1", charity_id: "c1", sent_at: THIS_WEEK }];
    tables.charity_thank_you_recipients = [{ thank_you_id: "t1", email_hash: emailHash("sarah@x.co"), status: "sending", claimed_at: THIS_WEEK }];
    expect((await messagedThisWeek("c1", pairs(["sarah"]), NOW, { thankYouId: "t1" })).size).toBe(0);
  });
});

describe("news emails and appeals", () => {
  it("checking who it goes to leaves out donors already messaged this week, and says how many, apart from opt-outs", async () => {
    tables.charity_donor_thanks = [{ charity_id: "c1", donor_id: "sarah", week_start: "2026-11-09" }];
    tables.charity_email_opt_outs = [{ charity_id: "c1", email_hash: emailHash("thandi@x.co") }];
    const pick = await pickAudience("c1", { kind: "all" }, NOW);
    expect(pick?.donors.map((d) => d.donor_id)).toEqual(["david"]);
    expect(pick).toMatchObject({ stopped: 1, thisWeek: 1, recordedOnly: 0 });
  });

  it("as each one goes, a donor thanked since the check is skipped, never emailed", async () => {
    tables.charity_appeals = [{ id: "a1", charity_id: "c1", subject: "News", body: "Some news for you all." }];
    tables.charity_appeal_recipients = donors.map((d) => ({ appeal_id: "a1", charity_id: "c1", donor_id: d.donor_id, status: "waiting" }));
    // Thanked personally after the email was checked, this same week.
    tables.charity_donor_thanks = [{ charity_id: "c1", donor_id: "david", week_start: "2026-11-09" }];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const p = await sendAppeal({ charityId: "c1", appealId: "a1", charityName: "Meals Fund", replyTo: null, userId: "u1" });
    vi.useRealTimers();
    expect(sent.map((m) => m.to).sort()).toEqual(["sarah@x.co", "thandi@x.co"]);
    expect(p).toEqual({ sent: 2, failed: 0, skipped: 1, waiting: 0 });
  });
});
