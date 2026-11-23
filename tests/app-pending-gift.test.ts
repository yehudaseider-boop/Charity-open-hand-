import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The phone's secure storage, as a plain map.
const store = new Map<string, string>();
vi.mock("../apps/mobile/src/lib/secure-storage", () => ({
  secureStorage: {
    getItem: async (k: string) => store.get(k) ?? null,
    getItemStrict: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => void store.set(k, v),
    removeItem: async (k: string) => void store.delete(k),
  },
}));
const { adoptSignedOut, cleanPendingGift, cleanPendingGifts, dropsRecord, inHistory, settles, snapshotTotal, PENDING_KEEP_MS } = await import("../apps/mobile/src/lib/pending-gift");
const { clearDetailsLater, dropPendingGift, keepPendingGift, loadDetailsLater, loadPendingGift, loadPendingGifts, markDetailsLater, onPendingGiftsChange } = await import(
  "../apps/mobile/src/lib/pending-gift-store"
);
const { countsTowardsReceipts } = await import("../apps/mobile/src/lib/live-giving");

const now = new Date("2026-11-12T10:00:00Z");
const gift = (over: Record<string, unknown> = {}) => ({
  slug: "meals",
  charityName: "Meals Fund",
  reference: "d1",
  token: "tok",
  charged: false,
  attemptId: null,
  detailsLater: false,
  summary: { cents: 18_000, contributionCents: 1_000, email: "ann@example.co.za", monthly: false, label: null },
  sentAt: "2026-11-12T09:58:00Z",
  ...over,
});

describe("a gift waiting for its answer", () => {
  it("keeps a started payment with its reference and token", () => {
    expect(cleanPendingGift(gift(), now)).toMatchObject({ slug: "meals", reference: "d1", token: "tok", summary: { cents: 18_000 } });
  });

  it("keeps a saved-card attempt with no reference yet", () => {
    expect(cleanPendingGift(gift({ reference: null, token: null, charged: true, attemptId: "a1" }), now)).toMatchObject({ reference: null, attemptId: "a1" });
  });

  it("drops damaged, half-there and month-old records", () => {
    expect(cleanPendingGift(null, now)).toBeNull();
    expect(cleanPendingGift(gift({ reference: null, token: null }), now)).toBeNull();
    expect(cleanPendingGift(gift({ reference: "d1", token: null, attemptId: null }), now)).toBeNull();
    expect(cleanPendingGift(gift({ summary: { cents: -1, contributionCents: 0, email: "x" } }), now)).toBeNull();
    expect(cleanPendingGift(gift({ summary: { cents: 1.5, contributionCents: 0, email: "x" } }), now)).toBeNull();
    expect(cleanPendingGift(gift({ sentAt: "not a date" }), now)).toBeNull();
    expect(cleanPendingGift(gift({ sentAt: new Date(now.getTime() - PENDING_KEEP_MS - 1).toISOString() }), now)).toBeNull();
    expect(cleanPendingGifts({ meals: gift(), junk: 4 }, now)).toEqual({ meals: expect.objectContaining({ slug: "meals" }) });
    expect(cleanPendingGifts([gift()], now)).toEqual({});
  });

  it("is settled only by paid, declined, not found or refunded", () => {
    for (const o of ["paid", "failed", "not_found", "reversed"]) expect(settles(o)).toBe(true);
    for (const o of ["pending", "review", "unknown"]) expect(settles(o)).toBe(false);
  });
});

describe("forgetting the right gift", () => {
  it("drops a record only for the payment that made it", () => {
    expect(dropsRecord({ reference: "d1" }, "d1")).toBe(true);
    expect(dropsRecord({ reference: "d2" }, "d1")).toBe(false);
    expect(dropsRecord({ reference: null }, "d1")).toBe(false);
    expect(dropsRecord(undefined, "d1")).toBe(false);
  });
});

describe("a gift left waiting while signed out", () => {
  const ann = cleanPendingGift(gift(), now)!;
  const bens = cleanPendingGift(gift({ slug: "hall", reference: "d2", summary: { cents: 5_000, contributionCents: 0, email: "ben@example.co.za", monthly: false, label: null } }), now)!;

  it("moves to the signed-in person only when it was given with their account's email", () => {
    const r = adoptSignedOut({ meals: ann, hall: bens }, {}, "ANN@example.co.za");
    expect(r.moved).toBe(1);
    expect(Object.keys(r.own)).toEqual(["meals"]);
    expect(Object.keys(r.shared)).toEqual(["hall"]);
  });

  it("stays where it is with no email, someone else's email, or a gift already theirs for that charity", () => {
    expect(adoptSignedOut({ meals: ann }, {}, null).moved).toBe(0);
    expect(adoptSignedOut({ meals: ann }, {}, "ben@example.co.za").moved).toBe(0);
    const mine = cleanPendingGift(gift({ reference: "d9" }), now)!;
    const r = adoptSignedOut({ meals: ann }, { meals: mine }, "ann@example.co.za");
    expect(r.moved).toBe(0);
    expect(r.own.meals.reference).toBe("d9");
    expect(r.shared.meals.reference).toBe("d1");
  });
});

describe("what a waiting gift charged", () => {
  it("keeps the card charge, and reads an older gift without one as none", () => {
    const withCharge = cleanPendingGift(gift({ summary: { cents: 10_000, contributionCents: 1_000, cardChargeCents: 230, email: "a@b.co", monthly: false, label: null } }), now)!;
    expect(withCharge.summary.cardChargeCents).toBe(230);
    expect(snapshotTotal(withCharge.summary)).toBe(11_230);
    const older = cleanPendingGift(gift({ summary: { cents: 10_000, contributionCents: 1_000, email: "a@b.co", monthly: false, label: null } }), now)!;
    expect(older.summary.cardChargeCents).toBeUndefined();
    expect(snapshotTotal(older.summary)).toBe(11_000);
  });
});

describe("counting a gift once", () => {
  it("knows when the refreshed history already has the gift, and when it is the only one", () => {
    expect(inHistory([], "d1")).toEqual({ counted: false, firstOnly: false });
    expect(inHistory([{ id: "d1" }], "d1")).toEqual({ counted: true, firstOnly: true });
    expect(inHistory([{ id: "d1" }, { id: "d0" }], "d1")).toEqual({ counted: true, firstOnly: false });
    expect(inHistory([{ id: "d0" }], "d1")).toEqual({ counted: false, firstOnly: false });
    expect(inHistory([{ id: "d0" }], null)).toEqual({ counted: false, firstOnly: false });
  });
});

describe("kept on the phone, per person", () => {
  // The store drops gifts older than a month by the real clock, so freeze it at the gifts' own date.
  beforeEach(() => {
    store.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
  });
  afterEach(() => vi.useRealTimers());

  it("survives the app closing, and is the giver's own", async () => {
    expect(await keepPendingGift("ann", gift() as never)).toBe(true);
    expect(await loadPendingGift("ann", "meals")).toMatchObject({ reference: "d1" });
    expect(await loadPendingGift("ben", "meals")).toBeNull();
    // Kept while signed out: never handed to whoever signs in next.
    await keepPendingGift(null, gift({ slug: "hall" }) as never);
    expect(await loadPendingGift("ben", "hall")).toBeNull();
    expect(await loadPendingGift(null, "hall")).toMatchObject({ slug: "hall" });
  });

  it("holds one per charity, and forgets it once settled", async () => {
    const changed = vi.fn();
    const off = onPendingGiftsChange(changed);
    await keepPendingGift("ann", gift() as never);
    await keepPendingGift("ann", gift({ slug: "hall", reference: "d2", sentAt: "2026-11-12T09:59:00Z" }) as never);
    expect((await loadPendingGifts("ann")).map((g) => g.slug)).toEqual(["hall", "meals"]);
    await dropPendingGift("ann", "meals", "d1");
    expect((await loadPendingGifts("ann")).map((g) => g.slug)).toEqual(["hall"]);
    expect(changed).toHaveBeenCalledTimes(3);
    off();
  });

  it("forgets only the payment it was asked to: another attempt's record for the charity stays (23/11/2026)", async () => {
    await keepPendingGift("ann", gift({ reference: "d2" }) as never);
    // The first attempt's page failed to open after the second had replaced its record: the second's is kept.
    await dropPendingGift("ann", "meals", "d1");
    expect(await loadPendingGift("ann", "meals")).toMatchObject({ reference: "d2" });
    await dropPendingGift("ann", "meals", "d2");
    expect(await loadPendingGift("ann", "meals")).toBeNull();
  });

  it("moves a gift left waiting while signed out to the person who gave it, on sign-in (23/11/2026)", async () => {
    await keepPendingGift(null, gift() as never);
    await keepPendingGift(null, gift({ slug: "hall", reference: "d2", summary: { cents: 5_000, contributionCents: 0, email: "ben@example.co.za", monthly: false, label: null } }) as never);
    // Without the account's email nothing moves (as before).
    expect(await loadPendingGift("ann", "meals")).toBeNull();
    expect(await loadPendingGift("ann", "meals", " Ann@Example.co.za ")).toMatchObject({ reference: "d1" });
    // Gone from the signed-out record; someone else's gift stays there, never handed over.
    expect((await loadPendingGifts(null)).map((g) => g.slug)).toEqual(["hall"]);
    expect(await loadPendingGifts("ann", "ann@example.co.za")).toHaveLength(1);
  });

  it("reads a damaged record as nothing waiting, never a crash", async () => {
    store.set("nediv-lev.pending-gifts.u.ann", "{not json");
    expect(await loadPendingGifts("ann")).toEqual([]);
  });
});

describe("s18A details still to add", () => {
  beforeEach(() => store.clear());

  it("doesn't count a gift paid with 'Add my details after paying' towards a receipt", async () => {
    await markDetailsLater("ann", "d1");
    const later = await loadDetailsLater("ann");
    expect(countsTowardsReceipts({ id: "d1", with18a: true }, later)).toBe(false);
    expect(countsTowardsReceipts({ id: "d2", with18a: true }, later)).toBe(true);
    expect(countsTowardsReceipts({ id: "d3", with18a: false }, later)).toBe(false);
    expect((await loadDetailsLater("ben")).size).toBe(0);
    await clearDetailsLater("ann", ["d1"]);
    expect(countsTowardsReceipts({ id: "d1", with18a: true }, await loadDetailsLater("ann"))).toBe(true);
  });
});
