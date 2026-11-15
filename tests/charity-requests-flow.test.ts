/**
 * "Request a charity" (15/11/2026), with the database and email faked: the "it joined" email goes once per address
 * (however many requests carry it), a send that may have gone is never repeated, one that surely didn't is released
 * for Try again, and a request is saved, refused or pointed to an existing charity as it should be.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = { id: string; notify_email: string | null; notified_at: string | null; charity_id: string; status: string };
let rows: Row[] = [];
let charities: { id: string; name_en: string; slug: string; status: string }[] = [];
const inserts: Record<string, unknown>[] = [];
let insertError: { code: string; message: string } | null = null;
const sent: string[] = [];
let sendFails: "no" | "surely" | "maybe" = "no";
let limited = false;

function q(table: string) {
  const filters: ((r: Record<string, unknown>) => boolean)[] = [];
  let update: Record<string, unknown> | null = null;
  let selecting = false;
  const b: Record<string, unknown> = {};
  b.select = () => ((selecting = true), b);
  b.eq = (c: string, v: unknown) => (filters.push((r) => r[c] === v), b);
  b.in = (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b);
  b.is = (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b);
  b.not = (c: string) => (filters.push((r) => r[c] !== null && r[c] !== undefined), b);
  b.lt = (c: string, v: string) => (filters.push((r) => typeof r[c] === "string" && (r[c] as string) < v), b);
  b.ilike = (c: string, v: string) => (filters.push((r) => String(r[c]).toLowerCase() === v.replace(/\\/g, "").toLowerCase()), b);
  b.limit = () => b;
  b.update = (u: Record<string, unknown>) => ((update = u), b);
  b.insert = (row: Record<string, unknown>) => (inserts.push(row), Promise.resolve({ error: insertError }));
  b.maybeSingle = async () => ({ data: (table === "charities" ? charities : rows).find((r) => filters.every((f) => f(r as never))) ?? null, error: null });
  b.then = (ok: (v: unknown) => unknown) => {
    const source = (table === "charities" ? charities : rows) as Record<string, unknown>[];
    const hit = source.filter((r) => filters.every((f) => f(r)));
    if (update) for (const r of hit) Object.assign(r, update);
    void selecting;
    return Promise.resolve({ data: hit.map((r) => ({ ...r })), error: null }).then(ok);
  };
  return b;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: q }) }));
vi.mock("@/lib/rate-limit", () => ({ hitRateLimit: async () => limited, ipKeys: () => ["ip#x"], hashedKey: () => "email#x" }));
vi.mock("@/lib/email", () => {
  class EmailMaybeSent extends Error {}
  return {
    EmailMaybeSent,
    getEmailTransport: () => ({
      name: "test",
      send: async (m: { to: string }) => {
        if (sendFails === "surely") throw new Error("refused");
        sent.push(m.to);
        if (sendFails === "maybe") throw new EmailMaybeSent("cut off");
        return "sent";
      },
    }),
  };
});

const { notifyJoined, clearStaleClaims } = await import("@/lib/charity-requests-notify");
const { saveCharityRequest } = await import("@/lib/charity-requests-store");

const joined = (id: string, email: string | null): Row => ({ id, notify_email: email, notified_at: null, charity_id: "c1", status: "joined" });

beforeEach(() => {
  rows = [];
  charities = [{ id: "c1", name_en: "Hope House", slug: "hope-house", status: "approved" }];
  inserts.length = 0;
  insertError = null;
  sent.length = 0;
  sendFails = "no";
  limited = false;
  process.env.CHARITY_REQUESTS = "yes";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the email when a charity joins", () => {
  it("goes once per address, even when one person asked twice, and every address is deleted after", async () => {
    rows = [joined("r1", "thandi@example.co.za"), joined("r2", "Thandi@Example.co.za"), joined("r3", "sipho@example.co.za"), joined("r4", null)];
    expect(await notifyJoined("c1")).toEqual({ sent: 2, failed: 0 });
    expect(sent.sort()).toEqual(["sipho@example.co.za", "thandi@example.co.za"]);
    expect(rows.every((r) => r.notify_email === null)).toBe(true);
    // A second press sends nothing more.
    expect(await notifyJoined("c1")).toEqual({ sent: 0, failed: 0 });
    expect(sent).toHaveLength(2);
  });

  it("a send that surely didn't go keeps the address for Try again", async () => {
    rows = [joined("r1", "thandi@example.co.za")];
    sendFails = "surely";
    expect(await notifyJoined("c1")).toEqual({ sent: 0, failed: 1 });
    expect(rows[0]).toMatchObject({ notify_email: "thandi@example.co.za", notified_at: null });
  });

  it("a send that may have gone is never repeated, and the address is still deleted", async () => {
    rows = [joined("r1", "thandi@example.co.za")];
    sendFails = "maybe";
    expect(await notifyJoined("c1")).toEqual({ sent: 1, failed: 0 });
    expect(rows[0].notify_email).toBeNull();
    sendFails = "no";
    await notifyJoined("c1");
    expect(sent).toHaveLength(1);
  });

  it("an address left behind by a send that was cut off is deleted, not kept or sent again", async () => {
    rows = [{ ...joined("r1", "thandi@example.co.za"), notified_at: "2026-11-15T08:00:00.000Z" }];
    await clearStaleClaims(new Date("2026-11-15T09:00:00Z"));
    expect(rows[0].notify_email).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it("sends nothing for a charity that isn't live", async () => {
    charities[0].status = "pending_review";
    rows = [joined("r1", "thandi@example.co.za")];
    expect(await notifyJoined("c1")).toEqual({ sent: 0, failed: 0 });
    expect(rows[0].notify_email).toBe("thandi@example.co.za");
  });
});

describe("sending a request", () => {
  const ctx = { cameFrom: "website" as const, userId: null, ip: "1.2.3.4" };

  it("saves it, with the email and consent only when ticked", async () => {
    expect(await saveCharityRequest({ name: "Bright Futures", emailMe: "on", email: "a@example.co.za" }, ctx)).toMatchObject({ ok: true });
    expect(inserts[0]).toMatchObject({ name: "Bright Futures", name_key: "bright futures", notify_email: "a@example.co.za", consent_version: expect.any(String), came_from: "website" });
    await saveCharityRequest({ name: "Bright Futures", email: "a@example.co.za" }, ctx);
    expect(inserts[1]).toMatchObject({ notify_email: null, consent_version: null });
  });

  it("a bot is told it was sent, and nothing is saved", async () => {
    expect(await saveCharityRequest({ name: "Bright Futures", website: "spam" }, ctx)).toMatchObject({ ok: true });
    expect(inserts).toHaveLength(0);
  });

  it("a charity already on Givezy is pointed to, and nothing is saved", async () => {
    expect(await saveCharityRequest({ name: "hope house" }, ctx)).toMatchObject({ ok: true, existing: { slug: "hope-house" } });
    expect(inserts).toHaveLength(0);
  });

  it("too many tries, the switch off, or the table missing: plain words, nothing saved", async () => {
    limited = true;
    expect(await saveCharityRequest({ name: "Bright Futures" }, ctx)).toMatchObject({ ok: false, status: 429 });
    limited = false;
    insertError = { code: "PGRST205", message: "missing" };
    expect(await saveCharityRequest({ name: "Bright Futures" }, ctx)).toMatchObject({ ok: false, status: 404 });
    delete process.env.CHARITY_REQUESTS;
    expect(await saveCharityRequest({ name: "Bright Futures" }, ctx)).toMatchObject({ ok: false, status: 404 });
  });
});
