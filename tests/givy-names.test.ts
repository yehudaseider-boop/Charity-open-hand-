/**
 * Givy knows donors' names (24/11/2026, Yehuda: "Givy must see names and know names"), and, on its own switch, one
 * donor's email and phone. What is proved here:
 * - with the names switch off, no name tool is offered and each is refused if asked for anyway (both guards); the
 *   contact tool needs both switches and a role that sees contact details;
 * - a donor is found by name only among the charity's own donors; anonymous and erased donors are never found or
 *   named; several matches ask which one (without contact details); nothing is guessed;
 * - no tool output carries an email, phone, ID number, address, card or bank detail, even when the source has them
 *   (except donor_contact, which gives only one donor's email and phone);
 * - a one-donor thank-you is addressed by an id found on the server, and Email donors' audience resolves that id only
 *   in the charity's own list.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/email", () => ({ getEmailTransport: () => ({ send: async () => "sent" }) }));
// Email donors' own list: this charity's donors only (the database's charity_donor_list, read as the person).
const ownDonors = vi.hoisted(() => [
  { donor_id: "aaaaaaaa-0000-0000-0000-000000000001", email: "moshe@x.co", display_name: "Moshe Katz", donor_type: "individual", is_anonymous: false, wants_18a: false, last_paid_at: "2026-11-01T10:00:00Z" },
  { donor_id: "aaaaaaaa-0000-0000-0000-000000000002", email: "erased+1@erased.invalid", display_name: "Kept ForSars", donor_type: "individual", is_anonymous: false, wants_18a: false, last_paid_at: "2026-10-01T10:00:00Z" },
]);
vi.mock("@/lib/charity/dashboard-queries", () => ({ loadDonors: async () => ownDonors, loadMonthlyGifts: async () => [], loadMonthlyDonations: async () => [] }));
vi.mock("@/lib/charity/donor-care", () => ({ lapsedDaysFor: async () => 365, listSegments: async () => [], listTags: async () => [], tagsByDonor: async () => new Map() }));

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
  const b: Record<string, unknown> = {};
  for (const m of ["select", "order", "limit"]) b[m] = () => b;
  b.eq = (col: string, v: unknown) => (filters.push((r) => r[col] === v), b);
  b.neq = (col: string, v: unknown) => (filters.push((r) => r[col] !== v), b);
  b.in = (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), b);
  b.gte = (col: string, v: string) => (filters.push((r) => new Date(String(r[col])).getTime() >= new Date(v).getTime()), b);
  b.range = async (from: number, to: number) => ({ data: rows().slice(from, to + 1), error: null });
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(ok);
  return b;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: query }) }));

const { checkToolCall, resolveDonor, runPrepare, runTool, toolDefinitions, NO_CONTACT, NO_DONOR_DATA } = await import("@/lib/assistant/tools");
type HelperSource = import("@/lib/assistant/tools").HelperSource;
type DonorSummary = import("@/lib/assistant/tools").DonorSummary;
const { stableInstructions, askerContext } = await import("@/lib/assistant/prompt");
const { assistantContactDataOn } = await import("@/config/assistant");
const { pickAudience } = await import("@/lib/charity/appeals");
const { parseAudience, audienceValue } = await import("@/lib/charity/appeals-rules");
const { thanksHref, thanksMark, isDraftAudience } = await import("@/lib/assistant/thank-you-draft");
const { startingSuggestions } = await import("@/lib/assistant/suggestions");
const { monthlyStates, newFlags } = await import("@/lib/assistant/donor-states");

const MOSHE = "aaaaaaaa-0000-0000-0000-000000000001";
const OTHER_CHARITY_DONOR = "bbbbbbbb-0000-0000-0000-000000000009";
const CHARITY = "11111111-2222-3333-4444-555555555555";

const donor = (over: Partial<DonorSummary> & { name: string }): DonorSummary => ({
  gifts: 2,
  totalCents: 125_000,
  firstGift: "01/03/2026",
  lastGift: "01/11/2026",
  monthly: false,
  monthlyState: "none",
  monthlyCents: 0,
  stopped: null,
  newIn: { this_month: false, last_month: false, this_tax_year: true },
  firstAt: "2026-03-01T10:00:00Z",
  s18aAsked: false,
  ...over,
});

// The source deliberately carries contact and identity details it should never pass on.
const leaky = { email: "leak@x.co", phone: "0821234567", id_number: "8001015009087", address: "1 Main Road", bank_account: "123456789", card_last4: "4242" };
const BOOK: DonorSummary[] = [
  { ...donor({ name: "Moshe Katz", id: MOSHE, monthlyState: "running", monthlyCents: 30_000, s18aAsked: true }), ...leaky } as DonorSummary,
  donor({ name: "Moshe Katzenberg", id: "aaaaaaaa-0000-0000-0000-000000000003", lastGift: "02/10/2026" }),
  donor({ name: "Sarah Levi", id: "aaaaaaaa-0000-0000-0000-000000000004", lastGift: "05/11/2026", monthlyState: "stopped", stopped: { on: "10/11/2026", how: "ended", at: "2026-11-10T10:00:00Z" } }),
  donor({ name: "Sarah Levi", id: "aaaaaaaa-0000-0000-0000-000000000005", lastGift: "07/07/2026", newIn: { this_month: true, last_month: false, this_tax_year: true } }),
  donor({ name: "Anonymous donor", id: "aaaaaaaa-0000-0000-0000-000000000006", hidden: true, monthlyState: "stopped", stopped: { on: "01/11/2026", how: "card declined", at: "2026-11-01T10:00:00Z" } }),
  donor({ name: "Erased at the donor's request", id: "aaaaaaaa-0000-0000-0000-000000000002", hidden: true, s18aAsked: true }),
  donor({ name: "Call me on 082 123 4567 or me@spam.co", id: "aaaaaaaa-0000-0000-0000-000000000007", newIn: { this_month: true, last_month: false, this_tax_year: true } }),
];

const source = (over: Partial<HelperSource> = {}): HelperSource => ({
  totals: async () => { throw new Error("not used"); },
  byMonth: async () => [],
  monthly: async () => { throw new Error("not used"); },
  setup: async () => { throw new Error("not used"); },
  receipts: async () => [],
  recentGifts: async () => [],
  donors: async () => BOOK,
  donorGifts: async (id) => ({
    taxYear: "2026/27 tax year",
    gifts: id === MOSHE ? [
      { date: "01/11/2026", amountCents: 30_000, status: "paid", monthly: true, thisTaxYear: true, ...leaky } as never,
      { date: "01/10/2026", amountCents: 30_000, status: "paid", monthly: true, thisTaxYear: true },
      { date: "01/02/2026", amountCents: 65_000, status: "paid", monthly: false, thisTaxYear: false },
    ] : [],
  }),
  s18aMissing: async () => new Map([[MOSHE, ["SA ID number"]], ["aaaaaaaa-0000-0000-0000-000000000002", ["address"]]]),
  donorContact: async (id) => (id === MOSHE ? { ...leaky, email: "moshe@x.co", phone: "082 123 4567" } as never : { email: null, phone: null }),
  ...over,
});

const run = async (name: string, input: unknown, src = source(), opts = { donorData: true, canContact: false }) => {
  const call = checkToolCall(name, input, opts.donorData, false, opts.canContact);
  if (!call.ok) throw new Error(call.error);
  return runTool(call, src, opts.donorData);
};

const NEVER = /8001015009087|1 Main Road|123456789|4242|leak@x\.co|0821234567/;

describe("with the names switch off", () => {
  it("offers no name tool, whatever the role", () => {
    const names = toolDefinitions(false, true, true).map((t) => t.name);
    for (const t of ["top_donors", "find_donor", "donor_giving", "donor_list", "donor_contact", "prepare_thank_you_to_donor"]) expect(names).not.toContain(t);
    expect(names).toContain("prepare_thank_you");
  });

  it("refuses every name tool if asked for anyway", () => {
    expect(checkToolCall("donor_giving", { name: "Moshe", last_gift: "" }, false)).toEqual({ ok: false, error: NO_DONOR_DATA });
    expect(checkToolCall("donor_list", { list: "stopped_monthly" }, false)).toEqual({ ok: false, error: NO_DONOR_DATA });
    expect(checkToolCall("prepare_thank_you_to_donor", { donor_name: "Moshe", last_gift: "", subject: "Thank you", message: "Thank you for standing with us." }, false, true)).toEqual({ ok: false, error: NO_DONOR_DATA });
    expect(checkToolCall("donor_contact", { name: "Moshe", last_gift: "" }, false, true, true)).toEqual({ ok: false, error: NO_CONTACT });
  });

  it("tells Givy to say contact details are on the Donors page", () => {
    expect(stableInstructions({ whatsApp: null, email: null }, false)).toMatch(/I can't look up contact details here; they're on the Donors page/);
    expect(stableInstructions({ whatsApp: null, email: null }, true, false)).toMatch(/I can't look up contact details here; they're on the Donors page/);
    expect(stableInstructions({ whatsApp: null, email: null }, true, true)).toMatch(/donor_contact tool, one named donor at a time/);
  });
});

describe("the contact switch", () => {
  it("is off unless both switches say yes, and never on by default", () => {
    const on = { ASSISTANT: "yes", ANTHROPIC_API_KEY: "k" };
    expect(assistantContactDataOn({ ...on })).toBe(false);
    expect(assistantContactDataOn({ ...on, ASSISTANT_CONTACT_DATA: "yes" })).toBe(false);
    expect(assistantContactDataOn({ ...on, ASSISTANT_DONOR_DATA: "yes" })).toBe(false);
    expect(assistantContactDataOn({ ...on, ASSISTANT_DONOR_DATA: "yes", ASSISTANT_CONTACT_DATA: "yes" })).toBe(true);
    expect(assistantContactDataOn({ ASSISTANT_DONOR_DATA: "yes", ASSISTANT_CONTACT_DATA: "yes" })).toBe(false);
  });

  it("is offered only with names on and a role that sees contact details; refused otherwise", () => {
    expect(toolDefinitions(true, false, false).map((t) => t.name)).not.toContain("donor_contact");
    expect(toolDefinitions(true, false, true).map((t) => t.name)).toContain("donor_contact");
    expect(checkToolCall("donor_contact", { name: "Moshe", last_gift: "" }, true, false, false)).toEqual({ ok: false, error: NO_CONTACT });
    expect(checkToolCall("donor_contact", { name: "Moshe", last_gift: "" }, true, false, true)).toMatchObject({ ok: true });
    // A role that can't see contact details is told to ask the owner or admin.
    expect(askerContext("viewer", null, false, { contactOn: true, canContact: false })).toMatch(/can't see donors' contact details.*owner or admin/);
    expect(askerContext("owner", null, true, { contactOn: true, canContact: true })).not.toMatch(/contact details/);
  });

  it("gives one named donor's email and phone, and nothing else", async () => {
    const out = JSON.parse(await run("donor_contact", { name: "Moshe Katz", last_gift: "" }, source(), { donorData: true, canContact: true }));
    expect(out).toMatchObject({ name: "Moshe Katz", email: "moshe@x.co", phone: "082 123 4567" });
    expect(Object.keys(out).sort()).toEqual(["email", "name", "note", "phone"]);
    expect(JSON.stringify(out)).not.toMatch(NEVER);
  });

  it("asks which one when several match, without anyone's contact details", async () => {
    let asked = 0;
    const src = source({ donorContact: async () => (asked++, { email: "x@x.co", phone: "0820000000" }) });
    const text = await run("donor_contact", { name: "Sarah Levi", last_gift: "" }, src, { donorData: true, canContact: true });
    expect(JSON.parse(text)).toMatchObject({ found: 2, several_match: [{ name: "Sarah Levi", last_gift: "05/11/2026" }, { name: "Sarah Levi", last_gift: "07/07/2026" }] });
    expect(text).not.toMatch(/@|082/);
    expect(asked).toBe(0);
    // Then the chosen one, by their last gift.
    const one = JSON.parse(await run("donor_contact", { name: "Sarah Levi", last_gift: "07/07/2026" }, src, { donorData: true, canContact: true }));
    expect(one).toMatchObject({ name: "Sarah Levi", email: "x@x.co" });
  });

  it("never finds an anonymous or erased donor, and shows an erased address only as the placeholder", async () => {
    expect(JSON.parse(await run("donor_contact", { name: "Anonymous", last_gift: "" }, source(), { donorData: true, canContact: true }))).toMatchObject({ found: 0 });
    expect(JSON.parse(await run("donor_contact", { name: "Erased", last_gift: "" }, source(), { donorData: true, canContact: true }))).toMatchObject({ found: 0 });
    const src = source({ donorContact: async () => ({ email: "erased+9@erased.invalid", phone: "0821111111" }) });
    const out = JSON.parse(await run("donor_contact", { name: "Moshe Katz", last_gift: "" }, src, { donorData: true, canContact: true }));
    expect(out.email).toBe("Erased at the donor's request");
    expect(JSON.stringify(out)).not.toMatch(/erased\.invalid|0821111111/);
  });

  it("refuses anything that isn't an email address or phone number in those fields", async () => {
    const src = source({ donorContact: async () => ({ email: "8001015009087", phone: "1 Main Road, Joburg" }) });
    const out = JSON.parse(await run("donor_contact", { name: "Moshe Katz", last_gift: "" }, src, { donorData: true, canContact: true }));
    expect(JSON.stringify(out)).not.toMatch(NEVER);
    expect(JSON.stringify(out)).not.toMatch(/Joburg/);
  });
});

describe("finding one donor by name", () => {
  it("picks an exact full name over a longer one, asks when it's ambiguous, and says when there's nobody", () => {
    expect(resolveDonor(BOOK, "Moshe Katz")).toMatchObject({ one: { id: MOSHE } });
    expect(resolveDonor(BOOK, "moshe")).toMatchObject({ several: [{ name: "Moshe Katz" }, { name: "Moshe Katzenberg" }] });
    expect(resolveDonor(BOOK, "Sarah Levi")).toMatchObject({ several: [{}, {}] });
    expect(resolveDonor(BOOK, "Sarah Levi", "07/07/2026")).toMatchObject({ one: { id: "aaaaaaaa-0000-0000-0000-000000000005" } });
    expect(resolveDonor(BOOK, "Nobody")).toMatchObject({ none: true });
  });

  it("never finds an anonymous or erased donor", () => {
    expect(resolveDonor(BOOK, "Anonymous donor")).toMatchObject({ none: true });
    expect(resolveDonor(BOOK, "Erased at the donor's request")).toMatchObject({ none: true });
  });

  it("only looks among the donors the source gives (this charity's own list)", () => {
    expect(resolveDonor([], "Moshe Katz")).toMatchObject({ none: true });
  });
});

describe("questions by name", () => {
  it("answers about one donor: last gift, this tax year, monthly, s18A, recent gifts, in Rand", async () => {
    const out = JSON.parse(await run("donor_giving", { name: "Moshe Katz", last_gift: "" }));
    expect(out).toMatchObject({
      name: "Moshe Katz",
      total_given: "R1 250",
      last_gift: "01/11/2026",
      monthly: "gives every month (running now), R300 a month",
      asked_for_an_s18a_receipt: true,
      s18a_details_missing: ["SA ID number"],
      this_tax_year: { tax_year: "2026/27 tax year", gifts: 2, given: "R600" },
    });
    expect(out.recent_gifts).toHaveLength(3);
    expect(JSON.stringify(out)).not.toMatch(NEVER);
  });

  it("asks which donor when a name matches several, and looks nothing else up", async () => {
    let read = 0;
    const out = JSON.parse(await run("donor_giving", { name: "Moshe", last_gift: "" }, source({ donorGifts: async () => (read++, { taxYear: "", gifts: [] }) })));
    expect(out).toMatchObject({ found: 2, note: expect.stringMatching(/Ask which one/) });
    expect(read).toBe(0);
  });

  it("lists who stopped their monthly donation, newest first, with anonymous donors never named", async () => {
    const out = JSON.parse(await run("donor_list", { list: "stopped_monthly" }));
    expect(out.donors.map((d: { name: string }) => d.name)).toEqual(["Sarah Levi", "Anonymous donor"]);
    expect(out.donors[0]).toMatchObject({ stopped_on: "10/11/2026", how: "ended" });
  });

  it("lists first-time donors this month, cutting contact details out of a name", async () => {
    const out = JSON.parse(await run("donor_list", { list: "first_gift_this_month" }));
    expect(out.count).toBe(2);
    expect(JSON.stringify(out)).not.toMatch(/082 123 4567|me@spam\.co/);
    expect(JSON.stringify(out)).toMatch(/\[number removed\]/);
  });

  it("lists who asked for an s18A receipt and still has details missing: what is missing, the erased donor only as the placeholder", async () => {
    const out = JSON.parse(await run("donor_list", { list: "s18a_details_missing" }));
    expect(out.donors).toEqual([
      { name: "Moshe Katz", still_needed: ["SA ID number"] },
      { name: "Erased at the donor's request", still_needed: ["address"] },
    ]);
  });

  it("says plainly when the s18A check couldn't be done, rather than an empty list", async () => {
    const out = JSON.parse(await run("donor_list", { list: "s18a_details_missing" }, source({ s18aMissing: async () => null })));
    expect(out.error).toMatch(/couldn't be checked/);
  });

  it("names at most 25, then says how many more", async () => {
    const many = Array.from({ length: 40 }, (_, k) => donor({ name: `Donor ${String.fromCharCode(65 + (k % 26))}${k}`, id: `cccccccc-0000-0000-0000-0000000000${String(k).padStart(2, "0")}`, monthlyState: "running", monthlyCents: 10_000 }));
    const out = JSON.parse(await run("donor_list", { list: "gives_monthly" }, source({ donors: async () => many })));
    expect(out).toMatchObject({ count: 40, and_more: 15 });
    expect(out.donors).toHaveLength(25);
  });

  it("refuses an unknown list", () => {
    expect(checkToolCall("donor_list", { list: "everyones_emails" }, true)).toMatchObject({ ok: false });
  });

  it("no name tool's answer carries a contact, ID, address, card or bank detail", async () => {
    for (const [name, input] of [
      ["donor_giving", { name: "Moshe Katz", last_gift: "" }],
      ["find_donor", { name: "Moshe" }],
      ["top_donors", { limit: 10 }],
      ...["stopped_monthly", "paused_monthly", "gives_monthly", "first_gift_this_month", "first_gift_last_month", "first_gift_this_tax_year", "s18a_asked", "s18a_details_missing"].map((list) => ["donor_list", { list }]),
    ] as [string, unknown][]) {
      expect(await run(name, input)).not.toMatch(NEVER);
    }
  });
});

describe("monthly states and first gifts, as the Donors page shows them", () => {
  it("running beats paused beats stopped; a stopped one says when and how", () => {
    const s = monthlyStates(
      [{ donor_id: "a", recurring_id: "r1" }, { donor_id: "a", recurring_id: "r2" }, { donor_id: "b", recurring_id: "r3" }, { donor_id: "c", recurring_id: "r4" }],
      [
        { recurring_id: "r1", status: "cancelled", amount_cents: 10_000, ended_at: "2026-10-01T10:00:00Z" },
        { recurring_id: "r2", status: "active", amount_cents: 20_000, ended_at: null },
        { recurring_id: "r3", status: "failed", amount_cents: 5_000, ended_at: "2026-11-02T10:00:00Z" },
        { recurring_id: "r4", status: "paused", amount_cents: 5_000, ended_at: null },
      ],
    );
    expect(s.get("a")).toMatchObject({ state: "running", perMonthCents: 20_000 });
    expect(s.get("b")).toMatchObject({ state: "stopped", stopped: { on: "02/11/2026", how: "card declined" } });
    expect(s.get("c")).toMatchObject({ state: "paused" });
  });

  it("counts a first gift in this month, last month and this tax year in Johannesburg time", () => {
    const f = newFlags(new Date("2026-11-24T10:00:00+02:00"));
    expect(f("2026-11-01T00:30:00+02:00")).toEqual({ this_month: true, last_month: false, this_tax_year: true });
    expect(f("2026-10-31T23:30:00+02:00")).toEqual({ this_month: false, last_month: true, this_tax_year: true });
    expect(f("2026-02-20T10:00:00+02:00")).toEqual({ this_month: false, last_month: false, this_tax_year: false });
  });
});

describe("thank-yous by name", () => {
  const preparer = () => {
    const seen: unknown[] = [];
    return {
      seen,
      p: {
        async prepare(d: { audience: string }) {
          seen.push(d);
          return { count: d.audience.startsWith("donor:") ? 1 : 30, label: "Gave this month", draftId: null, names: Array.from({ length: 30 }, (_, k) => (k === 0 ? "Anonymous donor" : `Donor ${k}`)) };
        },
      },
    };
  };
  const words = { subject: "Thank you", message: "Thank you for standing with us this year." };

  it("a group thank-you says who is in it (25, then how many more) only with names on", async () => {
    const { p } = preparer();
    const call = checkToolCall("prepare_thank_you", { audience: "gave:this_month", ...words }, true, true);
    if (!call.ok) throw new Error(call.error);
    const on = JSON.parse((await runPrepare(call, p, { donorData: true, source: source() })).text);
    expect(on.who_is_in_it).toHaveLength(25);
    expect(on.who_is_in_it[0]).toBe("Anonymous donor");
    expect(on.and_more).toBe(5);
    const off = JSON.parse((await runPrepare(call, p, { donorData: false })).text);
    expect(off.who_is_in_it).toBeUndefined();
  });

  it("one named donor: addressed by the id found on the server, never one the model writes", async () => {
    const { p, seen } = preparer();
    const call = checkToolCall("prepare_thank_you_to_donor", { donor_name: "Moshe Katz", last_gift: "", ...words, audience: `donor:${OTHER_CHARITY_DONOR}` }, true, true);
    if (!call.ok) throw new Error(call.error);
    const r = await runPrepare(call, p, { donorData: true, source: source() });
    expect(r.isError).toBe(false);
    expect(seen).toEqual([{ audience: `donor:${MOSHE}`, subject: "Thank you", body: words.message }]);
    expect(r.prepared).toEqual({ draftId: null, audience: `donor:${MOSHE}` });
    expect(JSON.parse(r.text).reach).toMatch(/for Moshe Katz only/);
    expect(JSON.parse(r.text).who_is_in_it).toBeUndefined();
  });

  it("several matches or nobody: nothing is prepared, and Givy asks which one", async () => {
    const { p, seen } = preparer();
    for (const donor_name of ["Moshe", "Nobody here", "Anonymous donor"]) {
      const call = checkToolCall("prepare_thank_you_to_donor", { donor_name, last_gift: "", ...words }, true, true);
      if (!call.ok) throw new Error(call.error);
      const r = await runPrepare(call, p, { donorData: true, source: source() });
      expect(r).toMatchObject({ isError: true, prepared: null });
    }
    expect(seen).toEqual([]);
  });

  it("is refused without names, or for a role that can't email donors", () => {
    expect(checkToolCall("prepare_thank_you_to_donor", { donor_name: "Moshe", last_gift: "", ...words }, true, false)).toMatchObject({ ok: false, error: expect.stringMatching(/can't email donors/) });
    expect(toolDefinitions(true, false).map((t) => t.name)).not.toContain("prepare_thank_you_to_donor");
    expect(toolDefinitions(true, true).map((t) => t.name)).toContain("prepare_thank_you_to_donor");
  });

  it("the panel's button opens only this dashboard's Email donors page with that one donor", () => {
    const base = `/charity-admin/${CHARITY}`;
    expect(thanksMark({ draftId: null, audience: `donor:${MOSHE}` })).toBe(`\n[[thanks:to=donor:${MOSHE}]]`);
    expect(thanksHref(`to=donor:${MOSHE}`, base)).toBe(`${base}/email-donors?to=${encodeURIComponent(`donor:${MOSHE}`)}`);
    expect(thanksHref("to=donor:not-an-id", base)).toBeNull();
    expect(isDraftAudience(`donor:${MOSHE}`)).toBe(true);
    expect(isDraftAudience("donor:everyone")).toBe(false);
  });
});

describe("Email donors' one-donor audience", () => {
  beforeEach(() => {
    tables = {
      donations: ownDonors.map((d) => ({ donor_id: d.donor_id, charity_id: "c1", status: "paid", gateway: "card", id: `g-${d.donor_id}` })),
      charity_email_opt_outs: [],
      thank_you_opt_outs: [],
      charity_donor_thanks: [],
      charity_appeal_recipients: [],
      charity_thank_you_recipients: [],
      donors: [],
    };
  });

  it("is read and written as donor:<id>", () => {
    expect(parseAudience(`donor:${MOSHE}`)).toEqual({ kind: "donor", donorId: MOSHE });
    expect(audienceValue({ kind: "donor", donorId: MOSHE })).toBe(`donor:${MOSHE}`);
    expect(parseAudience("donor:nope")).toBeNull();
    expect(parseAudience(`donor:${MOSHE}:extra`)).toBeNull();
  });

  it("reaches just that donor, with the usual checks", async () => {
    const pick = await pickAudience("c1", { kind: "donor", donorId: MOSHE });
    expect(pick?.donors.map((d) => d.donor_id)).toEqual([MOSHE]);
    expect(pick?.label).toBe("Only Moshe Katz");
    tables.charity_email_opt_outs = [{ charity_id: "c1", email_hash: (await import("@/lib/email-fingerprint")).emailHash("moshe@x.co") }];
    expect((await pickAudience("c1", { kind: "donor", donorId: MOSHE }))?.donors).toEqual([]);
  });

  it("finds nobody for another charity's donor, or an erased one", async () => {
    expect(await pickAudience("c1", { kind: "donor", donorId: OTHER_CHARITY_DONOR })).toBeNull();
    expect(await pickAudience("c1", { kind: "donor", donorId: "aaaaaaaa-0000-0000-0000-000000000002" })).toBeNull();
  });
});

describe("starting questions", () => {
  it("offer questions by name only when names are on", () => {
    expect(startingSuggestions(true, true, true)).toContain("Who stopped their monthly donation?");
    expect(startingSuggestions(true, true, false)).not.toContain("Who stopped their monthly donation?");
    expect(startingSuggestions(false, true, true)).not.toContain("Who stopped their monthly donation?");
  });
});
