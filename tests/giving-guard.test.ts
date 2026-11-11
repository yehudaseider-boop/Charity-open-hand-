import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The limits store, as the guard sees it: each bucket answers from `over` (hitRateLimit) or `reached` (read only).
const calls: { fn: string; bucket: string; keys: string[]; limit: number; minutes: number }[] = [];
let over = new Set<string>();
let reached = new Set<string>();
let storeDown = false;
// Recent declines per stand-in key, for the read-only decline check.
let declines: Record<string, number> = {};
vi.mock("@/lib/rate-limit", () => ({
  hitRateLimit: async (bucket: string, keys: string[], limit: number, minutes: number) => {
    if (storeDown) throw new Error("store down");
    calls.push({ fn: "hit", bucket, keys, limit, minutes });
    return over.has(bucket);
  },
  rateLimitReached: async (bucket: string, keys: string[], limit: number, minutes: number) => {
    if (storeDown) throw new Error("store down");
    calls.push({ fn: "reached", bucket, keys, limit, minutes });
    return reached.has(bucket) || keys.some((k) => (declines[k] ?? 0) >= limit);
  },
  ipKeys: (ip: string) => (ip && ip !== "unknown" ? [`ip#${ip}`] : []),
  hashedKey: (kind: string, value: string) => `${kind}#${value.trim().toLowerCase()}`,
}));

// The admin database client: inserts and reads of the limits table, and the donation and charity rows.
const inserts: { table: string; rows: unknown }[] = [];
let startRows: { key: string }[] = [];
let insertFails = false;
// Alarm claims: each claim gets the next id; `earlierClaim` stands for another request that claimed first.
let nextId = 1;
let earlierClaim = false;
const myClaims: number[] = [];
function table(name: string) {
  const b: Record<string, unknown> = {};
  let bucket = "";
  b.insert = (rows: unknown) => {
    const result = insertFails ? { error: new Error("insert failed") } : (inserts.push({ table: name, rows }), { error: null });
    const id = nextId++;
    return {
      then: (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok),
      select: () => ({ single: async () => (myClaims.push(id), { data: { id }, error: result.error }) }),
    };
  };
  b.select = () => b;
  b.eq = (col: string, v: string) => ((col === "bucket" ? (bucket = v) : null), b);
  b.gte = () => b;
  b.order = () => b;
  b.limit = () => b;
  b.like = async () => ({ data: startRows, error: null });
  b.maybeSingle = async () => {
    if (name === "rate_limit_events" && bucket === "giving-alarm") return { data: { id: earlierClaim ? 0 : myClaims[0] }, error: null };
    return { data: name === "donations" ? { charity_id: "c1" } : { name_en: "Sample Kitchen" }, error: null };
  };
  return b;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: table }) }));
const audits: unknown[] = [];
vi.mock("@/lib/audit", () => ({ logAudit: async (e: unknown) => void audits.push(e) }));
const alerts: { subject: string; lines: string[] }[] = [];
vi.mock("@/lib/ops/alert", () => ({ alertGivezy: async (subject: string, lines: string[]) => (alerts.push({ subject, lines }), "sent") }));
// after(): the email waits for the response. `outsideRequest` stands for a scheduled job, where after() can't be used.
const later: (() => Promise<void>)[] = [];
let outsideRequest = false;
vi.mock("next/server", () => ({
  after: (fn: () => Promise<void>) => {
    if (outsideRequest) throw new Error("after() was called outside a request scope");
    later.push(fn);
  },
}));
const runLater = async () => {
  for (const fn of later.splice(0)) await fn();
};

const { checkGivingAllowed, recordDecline, rememberGiftStart, recordBlocked } = await import("@/lib/donations/giving-guard");

beforeEach(() => {
  calls.length = 0;
  inserts.length = 0;
  audits.length = 0;
  alerts.length = 0;
  over = new Set();
  reached = new Set();
  storeDown = false;
  declines = {};
  insertFails = false;
  startRows = [];
  nextId = 1;
  earlierClaim = false;
  myClaims.length = 0;
  later.length = 0;
  outsideRequest = false;
});

const start = { email: " Donor@Example.com ", ip: "196.1.2.3", charityId: "c1" };

describe("checkGivingAllowed", () => {
  it("lets a normal gift through and counts it against every limit", async () => {
    expect(await checkGivingAllowed(start)).toBeNull();
    expect(calls.map((c) => [c.fn, c.bucket, c.limit, c.minutes])).toEqual([
      ["reached", "checkout-declined", 3, 60],
      ["reached", "checkout-declined", 15, 60],
      ["hit", "checkout", 5, 10],
      ["hit", "checkout-ip", 30, 10],
      ["hit", "checkout-day", 20, 1_440],
      ["hit", "checkout-ip-day", 150, 1_440],
      ["hit", "checkout-charity", 60, 10],
    ]);
    // The email is compared without spaces or capitals; addresses only ever as stand-ins.
    expect(calls[2].keys).toEqual(["email:donor@example.com"]);
    expect(calls[0].keys).toEqual(["email#donor@example.com"]);
    expect(calls[1].keys).toEqual(["ip#196.1.2.3"]);
  });

  it.each([
    ["checkout", "email", /in 10 minutes/],
    ["checkout-ip", "address", /in 10 minutes/],
    ["checkout-day", "email-day", /tomorrow/],
    ["checkout-ip-day", "address-day", /tomorrow/],
  ])("refuses once the %s limit is used up, says nothing was charged, and counts the reason", async (bucket, reason, wait) => {
    over.add(bucket);
    const refused = await checkGivingAllowed(start);
    expect(refused?.reason).toBe(reason);
    expect(refused?.message).toMatch(/^Too many tries .*Nothing was charged\./);
    expect(refused?.message).toMatch(wait);
    expect(inserts).toEqual([{ table: "rate_limit_events", rows: { bucket: "giving-blocked", key: `reason:${reason}` } }]);
  });

  it("makes a donor wait after several declined cards, without extending the wait", async () => {
    reached.add("checkout-declined");
    const refused = await checkGivingAllowed(start);
    expect(refused).toMatchObject({ reason: "declines" });
    expect(refused?.message).toMatch(/in an hour/);
    // Only read: this try isn't counted anywhere, so waiting the hour is enough.
    expect(calls.filter((c) => c.fn === "hit")).toHaveLength(0);
  });

  it("raises an alarm when one charity gets a rush of gift starts, after the response, and never blocks the donor", async () => {
    over.add("checkout-charity");
    expect(await checkGivingAllowed(start)).toBeNull();
    // Nothing is sent while the donor waits.
    expect(alerts).toHaveLength(0);
    await runLater();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].subject).toMatch(/Sample Kitchen/);
    expect(alerts[0].lines.join(" ")).toMatch(/Nobody has been blocked/);
    expect(audits).toEqual([expect.objectContaining({ action: "giving.alarm", entityId: "c1", details: expect.objectContaining({ kind: "starts" }) })]);
  });

  it("sends only one alarm an hour, even when two requests trip it at once (the earliest claim wins)", async () => {
    over.add("checkout-charity");
    earlierClaim = true;
    expect(await checkGivingAllowed(start)).toBeNull();
    await runLater();
    expect(alerts).toHaveLength(0);
    // Its claim is still recorded, so the hour's other requests see it too.
    expect(inserts.some((i) => (i.rows as { bucket?: string }).bucket === "giving-alarm")).toBe(true);
  });

  it("outside a request (the daily job), the alarm is sent straight away", async () => {
    over.add("checkout-charity");
    outsideRequest = true;
    await checkGivingAllowed(start);
    expect(alerts).toHaveLength(1);
  });

  it("an address shared by many donors needs far more declines than one email before anyone waits", async () => {
    // 5 declines on a shared address: the email limit (3) would stop them, the address limit (15) doesn't.
    declines = { "ip#196.1.2.3": 5 };
    expect(await checkGivingAllowed(start)).toBeNull();
    declines = { "ip#196.1.2.3": 15 };
    expect((await checkGivingAllowed(start))?.reason).toBe("declines");
    // 3 declines on one email: that email waits.
    declines = { "email#donor@example.com": 3 };
    expect((await checkGivingAllowed(start))?.reason).toBe("declines");
  });

  it("lets the gift go ahead when the limits store is down (our outage never stops a donor)", async () => {
    storeDown = true;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await checkGivingAllowed(start)).toBeNull();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("with no known address, still limits the email", async () => {
    over.add("checkout");
    expect((await checkGivingAllowed({ ...start, ip: "unknown" }))?.reason).toBe("email");
  });
});

describe("declined cards", () => {
  it("remembers who started a gift as stand-ins only", async () => {
    await rememberGiftStart("d1", "Donor@Example.com", "196.1.2.3");
    expect(inserts[0].rows).toEqual([
      { bucket: "checkout-start", key: "d1|email#donor@example.com" },
      { bucket: "checkout-start", key: "d1|ip#196.1.2.3" },
    ]);
  });

  it("counts a decline against the email and address that started the gift", async () => {
    startRows = [{ key: "d1|email#donor@example.com" }, { key: "d1|ip#196.1.2.3" }];
    await recordDecline("d1");
    expect(inserts[0].rows).toEqual([
      { bucket: "checkout-declined", key: "email#donor@example.com" },
      { bucket: "checkout-declined", key: "ip#196.1.2.3" },
    ]);
    expect(calls).toEqual([expect.objectContaining({ bucket: "charity-declines", keys: ["charity:c1"], limit: 10, minutes: 60 })]);
  });

  it("ignores a decline with no recorded start (a monthly collection)", async () => {
    await recordDecline("monthly-1");
    expect(inserts).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it("raises a declines alarm for the charity when many cards are declined", async () => {
    startRows = [{ key: "d1|email#a" }];
    over.add("charity-declines");
    await recordDecline("d1");
    await runLater();
    expect(alerts[0].lines[0]).toMatch(/more than 10 declined cards in 60 minutes/);
  });

  it("never throws, so a payment result is always saved", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    insertFails = true;
    startRows = [{ key: "d1|email#a" }];
    await expect(recordDecline("d1")).resolves.toBeUndefined();
    await expect(rememberGiftStart("d1", "a@b.co", "1.1.1.1")).resolves.toBeUndefined();
    await expect(recordBlocked("bot")).resolves.toBeUndefined();
    err.mockRestore();
  });
});
