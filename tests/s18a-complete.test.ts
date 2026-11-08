/**
 * Adding s18A details after paying (04/11/2026), with the database faked (its eq, is and in filters are honoured,
 * so a conditional write only changes rows whose target columns are still empty): only the person who made the
 * donation, only a gift that still needs them, only the fields that are missing and never over a value on file,
 * every read and write error changing nothing, the completion window, and a monthly donation's first gift and
 * other gifts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
type Filter = { op: "eq" | "is" | "in"; col: string; val: unknown };
let tables: Record<string, Row[]>;
let limited = false;
let failures: { op: "read" | "update"; table: string; nth?: number }[];
let calls: Record<string, number>;
/** Runs just before an update applies (another save landing at the same moment). */
let beforeUpdate: ((table: string) => void) | null;
const updates: { table: string; row: Row; ids: string[] }[] = [];
const audits: Row[] = [];

const matches = (r: Row, filters: Filter[]) =>
  filters.every((f) => {
    const v = f.col === "s18a_receipts.status" ? r.status : r[f.col];
    if (f.op === "eq") return v === f.val;
    if (f.op === "is") return v === null || v === undefined;
    return (f.val as unknown[]).includes(v);
  });

function shouldFail(op: "read" | "update", table: string): boolean {
  const key = `${op}:${table}`;
  calls[key] = (calls[key] ?? 0) + 1;
  return failures.some((f) => f.op === op && f.table === table && (f.nth === undefined || f.nth === calls[key]));
}

function embed(table: string, r: Row, columns: string): Row {
  if (table !== "donations") return r;
  const out = { ...r };
  if (columns.includes("donation_checkout_details(")) out.donation_checkout_details = tables.donation_checkout_details.find((d) => d.donation_id === r.id) ?? null;
  if (columns.includes("charities(")) out.charities = { name_en: "Meals for All" };
  return out;
}

function builder(table: string) {
  const filters: Filter[] = [];
  let patch: Row | null = null;
  let columns = "";
  let limit = Infinity;
  const b: Record<string, unknown> = {};
  b.select = (c = "*") => ((columns = c), b);
  b.eq = (col: string, val: unknown) => (filters.push({ op: "eq", col, val }), b);
  b.is = (col: string, val: unknown) => (filters.push({ op: "is", col, val }), b);
  b.in = (col: string, val: unknown[]) => (filters.push({ op: "in", col, val }), b);
  b.order = () => b;
  b.limit = (n: number) => ((limit = n), b);
  b.update = (row: Row) => ((patch = row), b);
  const run = () => {
    if (patch) {
      if (shouldFail("update", table)) return { data: null, error: { message: "update failed" } };
      beforeUpdate?.(table);
      const hit = tables[table].filter((r) => matches(r, filters));
      for (const r of hit) Object.assign(r, patch);
      if (hit.length) updates.push({ table, row: patch, ids: hit.map((r) => String(r.donation_id ?? r.id)) });
      return { data: hit.map((r) => ({ donation_id: r.donation_id, id: r.id })), error: null };
    }
    if (shouldFail("read", table)) return { data: null, error: { message: "read failed" } };
    return { data: tables[table].filter((r) => matches(r, filters)).slice(0, limit).map((r) => embed(table, r, columns)), error: null };
  };
  b.maybeSingle = async () => {
    const r = run();
    return { data: r.error ? null : ((r.data as Row[])[0] ?? null), error: r.error };
  };
  b.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad);
  return b;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: builder }) }));
vi.mock("@/lib/rate-limit", () => ({ hitRateLimit: async () => limited, ipKeys: (ip: string) => [`ip:${ip}`] }));
vi.mock("@/lib/audit", () => ({ logAudit: async (e: Row) => void audits.push(e) }));
vi.mock("@/lib/crypto", () => ({
  encrypt: (s: string) => `enc(${s})`,
  decrypt: (s: string) => s.replace(/^enc\((.*)\)$/, "$1"),
  last4: (s: string) => s.replace(/\s/g, "").slice(-4),
  receiptIdentity: (v: { donorType: string; idNumber?: string; registrationNumber?: string }) => `fp:${v.donorType}:${v.idNumber ?? v.registrationNumber}`,
}));
vi.mock("@/lib/donations/confirmation-access", () => ({ confirmationTokenMatches: async (_id: string, t?: string) => t === "good-credential" }));

const { completeS18aDetails, listS18aToComplete } = await import("@/lib/donations/s18a-complete");

const ID = "3f9a2c71-0b1d-4e5f-9a8b-123456789abc";
const FIRST = "11111111-0b1d-4e5f-9a8b-123456789abc";
const REC = "r-1";
const NOW = new Date("2026-11-04T10:00:00+02:00");
const form = { id_number: "8001015009087", address_line1: "5 Rissik Street", city: "Johannesburg", postal_code: "2001" };
const run = (who: { token: string } | { userId: string } = { token: "good-credential" }, f: Record<string, unknown> = form, now = NOW) =>
  completeS18aDetails({ donationId: ID, who, form: f, ip: "203.0.113.7", now });

const giftRow = (id: string, o: Row = {}): Row => ({ id, status: "paid", wants_18a: true, tax_year: 2027, donor_id: "donor-1", recurring_id: null, charity_id: "c1", paid_at: "2026-10-01T10:00:00Z", amount_cents: 25_000, ...o });
const emptyDetails = (id: string, o: Row = {}): Row => ({
  donation_id: id, donor_type: "individual", id_number_encrypted: null, id_number_last4: null, tax_reference_encrypted: null, registration_number: null, receipt_identity: null,
  address_line1: null, address_line2: null, suburb: null, city: null, postal_code: null, erased_at: null, ...o,
});
const details = (id: string) => tables.donation_checkout_details.find((d) => d.donation_id === id)!;
const detailWrites = () => updates.filter((u) => u.table === "donation_checkout_details");

beforeEach(() => {
  tables = {
    donations: [giftRow(ID)],
    donation_checkout_details: [emptyDetails(ID)],
    donors: [{ id: "donor-1", user_id: "u1", id_number_last4: null, address_line1: null, address_line2: null, suburb: null, city: null, postal_code: null }],
    recurring_donations: [],
    s18a_receipt_donations: [],
  };
  limited = false;
  failures = [];
  calls = {};
  beforeUpdate = null;
  updates.length = 0;
  audits.length = 0;
});

describe("who may add the details", () => {
  it("the visitor with the credential from the payment link", async () => {
    const r = await run();
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/^Saved\./);
  });
  it("not with a wrong credential: nothing is written", async () => {
    const r = await run({ token: "guessed" });
    expect(r.ok).toBe(false);
    expect(updates).toHaveLength(0);
  });
  it("the signed-in donor, for their own gift only", async () => {
    expect((await run({ userId: "u1" })).ok).toBe(true);
    tables.donation_checkout_details = [emptyDetails(ID)];
    updates.length = 0;
    const r = await run({ userId: "u2" });
    expect(r.ok).toBe(false);
    expect(updates).toHaveLength(0);
  });
});

describe("which gifts", () => {
  it("refuses a gift that is complete, on an issued receipt, not s18A, not paid or too old", async () => {
    for (const change of [
      () => Object.assign(details(ID), { id_number_encrypted: "enc(8001015009087)", address_line1: "1 Road" }),
      () => tables.s18a_receipt_donations.push({ donation_id: ID, status: "issued" }),
      () => Object.assign(tables.donations[0], { wants_18a: false }),
      () => Object.assign(tables.donations[0], { status: "pending" }),
      () => Object.assign(tables.donations[0], { tax_year: 2025 }),
      // The tax year just closed, but after 31 May of the year it closed.
      () => Object.assign(tables.donations[0], { tax_year: 2026 }),
    ]) {
      change();
      const r = await run();
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/Nothing has changed/);
      expect(updates).toHaveLength(0);
      tables.donations = [giftRow(ID)];
      tables.donation_checkout_details = [emptyDetails(ID)];
      tables.s18a_receipt_donations = [];
    }
  });
});

describe("the window: this tax year, and the one just closed until 31 May (Johannesburg time)", () => {
  beforeEach(() => Object.assign(tables.donations[0], { tax_year: 2026 }));
  it("31 May 23:59 is still in time, and the donor is told which year's receipt it goes on", async () => {
    const r = await run(undefined, form, new Date("2026-05-31T23:59:00+02:00"));
    expect(r.ok).toBe(true);
    expect(r.message).toBe("Saved. This gift will be on your s18A receipt for 2025/26.");
    expect(r.saved?.correction).toMatch(/before 31\/05\/2026/);
  });
  it("1 June 00:00 is too late, and nothing is written", async () => {
    const r = await run(undefined, form, new Date("2026-06-01T00:00:00+02:00"));
    expect(r.ok).toBe(false);
    expect(updates).toHaveLength(0);
  });
  it("this tax year's gift: on the receipt after the tax year closes at the end of February", async () => {
    tables.donations = [giftRow(ID)];
    const r = await run();
    expect(r.message).toBe("Saved. This gift will be on your s18A receipt after the tax year closes on 28/02/2027.");
  });
});

describe("what is written", () => {
  it("exactly as checkout writes it: encrypted ID, last four, receipt identity and address", async () => {
    const r = await run();
    const [write] = detailWrites();
    expect(write.ids).toEqual([ID]);
    expect(write.row).toEqual({
      id_number_encrypted: "enc(8001015009087)",
      id_number_last4: "9087",
      receipt_identity: "fp:individual:8001015009087",
      address_line1: "5 Rissik Street",
      address_line2: null,
      suburb: null,
      city: "Johannesburg",
      postal_code: "2001",
    });
    // What was saved is shown back, with a person to put a mistake right.
    expect(r.saved).toMatchObject({ idLast4: "9087", address: "5 Rissik Street, Johannesburg, 2001" });
    expect(r.saved?.correction).toMatch(/^Something wrong\? .* before the tax year ends and we'll correct it\.$/);
  });
  it("only the fields that are missing: an ID number on file is never written again", async () => {
    Object.assign(details(ID), { id_number_encrypted: "enc(8001015009087)", id_number_last4: "9087", receipt_identity: "fp:individual:8001015009087" });
    const r = await run(undefined, { address_line1: "5 Rissik Street", city: "Johannesburg", postal_code: "2001" });
    expect(r.ok).toBe(true);
    const [write] = detailWrites();
    expect(Object.keys(write.row).sort()).toEqual(["address_line1", "address_line2", "city", "postal_code", "suburb"]);
    expect(details(ID).id_number_encrypted).toBe("enc(8001015009087)");
  });
  it("an address on file is never written again either", async () => {
    Object.assign(details(ID), { address_line1: "1 Old Road", city: "Durban", postal_code: "4001" });
    await run();
    const [write] = detailWrites();
    expect(Object.keys(write.row).sort()).toEqual(["id_number_encrypted", "id_number_last4", "receipt_identity"]);
    expect(details(ID)).toMatchObject({ address_line1: "1 Old Road", city: "Durban" });
  });
  it("refuses an ID number that differs from the one on file, with a person to put it right, and writes nothing", async () => {
    Object.assign(details(ID), { id_number_encrypted: "enc(8001015009087)", id_number_last4: "9087" });
    const r = await run(undefined, { ...form, id_number: "9001014800089" });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/^This gift already has an ID number ending in 9087\. If that's wrong, .* and we'll correct it\. Nothing has changed\.$/);
    expect(r.fieldErrors).toHaveProperty("id_number");
    expect(updates).toHaveLength(0);
  });
  it("the same ID number typed again is fine, and only the address is written", async () => {
    Object.assign(details(ID), { id_number_encrypted: "enc(8001015009087)", id_number_last4: "9087" });
    const r = await run(undefined, { ...form, id_number: "8001 0150 09087" });
    expect(r.ok).toBe(true);
    expect(detailWrites()[0].row).not.toHaveProperty("id_number_encrypted");
  });
  it("a company: its registration number and its own identity; a different number than the one on file is refused", async () => {
    Object.assign(details(ID), { donor_type: "company" });
    await run(undefined, { registration_number: "2015/123456/07", address_line1: "1 Main Road", city: "Durban", postal_code: "4001" });
    expect(detailWrites()[0].row).toMatchObject({ registration_number: "2015/123456/07", receipt_identity: "fp:company:2015/123456/07" });
    expect(detailWrites()[0].row).not.toHaveProperty("id_number_encrypted");

    tables.donation_checkout_details = [emptyDetails(ID, { donor_type: "company", registration_number: "2015/123456/07" })];
    updates.length = 0;
    const r = await run(undefined, { registration_number: "2016/654321/07", address_line1: "1 Main Road", city: "Durban", postal_code: "4001" });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/already has the registration number 2015\/123456\/07/);
    expect(updates).toHaveLength(0);
  });
  it("a company's number typed at checkout: only the address is asked for, and its receipt identity is filled in", async () => {
    tables.donation_checkout_details = [emptyDetails(ID, { donor_type: "company", registration_number: "2015/123456/07" })];
    const r = await run(undefined, { address_line1: "1 Main Road", city: "Durban", postal_code: "4001" });
    expect(r.ok).toBe(true);
    expect(detailWrites()[0].row).toMatchObject({ receipt_identity: "fp:company:2015/123456/07", address_line1: "1 Main Road" });
    expect(detailWrites()[0].row).not.toHaveProperty("registration_number");
  });
  it("two saves at once: when another save fills the ID number first, this one writes nothing and says so", async () => {
    beforeUpdate = (table) => {
      if (table === "donation_checkout_details") Object.assign(details(ID), { id_number_encrypted: "enc(9001014800089)" });
      beforeUpdate = null;
    };
    const r = await run();
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/added already/);
    expect(detailWrites()).toHaveLength(0);
    expect(details(ID).id_number_encrypted).toBe("enc(9001014800089)");
  });
  it("keeps the form's problems with the boxes, and writes nothing", async () => {
    const r = await run(undefined, { id_number: "123" });
    expect(r.ok).toBe(false);
    expect(Object.keys(r.fieldErrors ?? {})).toEqual(expect.arrayContaining(["id_number", "address_line1", "city", "postal_code"]));
    expect(updates).toHaveLength(0);
  });
  it("is rate-limited", async () => {
    limited = true;
    const r = await run();
    expect(r.ok).toBe(false);
    expect(updates).toHaveLength(0);
  });
  it("is audit-logged with the last four digits only, never the ID number", async () => {
    await run({ userId: "u1" });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: "donor.s18a_details_added", entityType: "donation", entityId: ID, actorUserId: "u1" });
    expect(JSON.stringify(audits[0])).not.toContain("8001015009087");
    expect(JSON.stringify(audits[0])).toContain("9087");
  });
});

describe("a monthly donation", () => {
  beforeEach(() => {
    tables.recurring_donations = [{ id: REC, donor_id: "donor-1", first_donation_id: FIRST, status: "active" }];
    tables.donations = [
      giftRow(ID, { recurring_id: REC }),
      giftRow(FIRST, { recurring_id: REC, paid_at: "2026-08-01T10:00:00Z" }),
      giftRow("sibling-paid", { recurring_id: REC }),
      giftRow("sibling-pending", { recurring_id: REC, status: "pending", tax_year: null, paid_at: null }),
      giftRow("sibling-failed", { recurring_id: REC, status: "failed", tax_year: null, paid_at: null }),
      giftRow("sibling-old", { recurring_id: REC, tax_year: 2025 }),
      giftRow("sibling-receipted", { recurring_id: REC, tax_year: 2026 }),
    ];
    tables.donation_checkout_details = tables.donations.map((d) => emptyDetails(d.id as string));
    tables.s18a_receipt_donations = [{ donation_id: "sibling-receipted", status: "issued" }];
  });
  it("updates this gift, then the first gift (copied to every future gift), then its other paid and pending gifts in the window", async () => {
    const r = await run();
    expect(r.ok).toBe(true);
    const written = detailWrites().flatMap((w) => w.ids);
    expect(written.slice(0, 2)).toEqual([ID, FIRST]);
    expect(written.sort()).toEqual([FIRST, ID, "sibling-paid", "sibling-pending"].sort());
    expect(r.message).toBe("Saved. This gift will be on your s18A receipt after the tax year closes on 28/02/2027. Your future monthly gifts will carry these details too.");
  });
  it("a first gift from an older tax year is left as it is, and the donor is not told future gifts are covered", async () => {
    Object.assign(tables.donations.find((d) => d.id === FIRST)!, { tax_year: 2025 });
    const r = await run();
    expect(r.ok).toBe(true);
    expect(detailWrites().flatMap((w) => w.ids)).not.toContain(FIRST);
    expect(r.message).not.toMatch(/will carry these details/);
    expect(r.message).toMatch(/Your future monthly gifts don't have them yet\. Please .* and we'll add them\./);
  });
  it("a failed write to the first gift, after this gift was saved, is said plainly", async () => {
    failures = [{ op: "update", table: "donation_checkout_details", nth: 2 }];
    const r = await run();
    expect(r.ok).toBe(true);
    expect(details(ID).id_number_encrypted).toBe("enc(8001015009087)");
    expect(details(FIRST).id_number_encrypted).toBeNull();
    expect(r.message).toMatch(/We couldn't add them to your future monthly gifts just now/);
    expect(r.message).not.toMatch(/will carry these details/);
  });
  it("a gift the receipt run issued since the first look is not changed", async () => {
    let lookups = 0;
    // The third issued-receipt lookup (the one right before writing) finds this gift issued.
    const original = tables.s18a_receipt_donations;
    tables.s18a_receipt_donations = new Proxy(original, {
      get(target, prop, recv) {
        if (prop === "filter") {
          lookups++;
          if (lookups === 3) return (fn: (r: Row) => boolean) => [...target, { donation_id: ID, status: "issued" }].filter(fn);
        }
        return Reflect.get(target, prop, recv);
      },
    });
    const r = await run();
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/now on an issued s18A receipt.*Nothing has changed/);
    expect(updates).toHaveLength(0);
  });
});

describe("every failed read or write changes nothing", () => {
  const cases: [string, typeof failures][] = [
    ["reading the gift", [{ op: "read", table: "donations", nth: 1 }]],
    ["reading its details", [{ op: "read", table: "donation_checkout_details", nth: 1 }]],
    ["the gift's issued-receipt lookup", [{ op: "read", table: "s18a_receipt_donations", nth: 1 }]],
    ["reading the monthly donation", [{ op: "read", table: "recurring_donations" }]],
    ["reading its other gifts", [{ op: "read", table: "donations", nth: 2 }]],
    ["their issued-receipt lookup", [{ op: "read", table: "s18a_receipt_donations", nth: 2 }]],
    ["reading the donor record", [{ op: "read", table: "donors" }]],
    ["the issued-receipt lookup right before writing", [{ op: "read", table: "s18a_receipt_donations", nth: 3 }]],
    ["writing this gift's details", [{ op: "update", table: "donation_checkout_details", nth: 1 }]],
  ];
  it.each(cases)("%s", async (_label, f) => {
    tables.recurring_donations = [{ id: REC, donor_id: "donor-1", first_donation_id: FIRST, status: "active" }];
    tables.donations = [giftRow(ID, { recurring_id: REC }), giftRow(FIRST, { recurring_id: REC })];
    tables.donation_checkout_details = [emptyDetails(ID), emptyDetails(FIRST)];
    failures = f;
    const r = await run();
    expect(r.ok).toBe(false);
    expect(r.message).toBe("We couldn't save your details just now. Nothing has changed. Please try again.");
    expect(updates).toHaveLength(0);
    expect(details(ID).id_number_encrypted).toBeNull();
    expect(audits).toHaveLength(0);
  });
});

describe("the account page's list", () => {
  it("one line per monthly donation: its newest gift that can still be completed, after leaving out the ones that can't", async () => {
    tables.recurring_donations = [{ id: REC, donor_id: "donor-1", first_donation_id: FIRST, status: "active" }];
    tables.donations = [giftRow("newest", { recurring_id: REC, paid_at: "2026-11-01T10:00:00Z" }), giftRow("older", { recurring_id: REC, paid_at: "2026-10-01T10:00:00Z" })];
    tables.donation_checkout_details = [emptyDetails("newest", { id_number_encrypted: "enc(x)", address_line1: "1 Road" }), emptyDetails("older")];
    const list = await listS18aToComplete("u1", NOW);
    expect(list.map((g) => g.id)).toEqual(["older"]);
    expect(list[0].missing).toEqual(["id_number", "address"]);
  });
});
