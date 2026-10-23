/** "Update my card" for a monthly donation whose card was declined: who may, when it is offered, and the job holding off. */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64");
const { newCardLink, newCardLinkValid, newCardPath, needsNewCard, newCardPatch, DECLINED_REASON, NEW_CARD_NOT_REUSABLE } = await import("@/lib/donations/new-card");
const { runMonthlyCharges } = await import("@/lib/donations/monthly-job");
import type { DueMonthly, MonthlyDeps } from "@/lib/donations/monthly-job";
import { toRecurring, type RecurringRow } from "../apps/mobile/src/lib/live-giving";
import { requestNewCardPage } from "../apps/mobile/src/lib/pay-api";


const NOW = new Date("2026-11-20T08:00:00Z");
const ID = "6f52c335-dd9e-4ee2-8843-7eee93fceb76";
const parts = (url: string) => Object.fromEntries(new URL(url, "https://x.test").searchParams) as { m: string; e: string; s: string };

describe("the signed link", () => {
  it("works for its own monthly donation, for 30 days", () => {
    const p = parts(newCardLink("https://givezy.test/", ID, NOW));
    expect(p.m).toBe(ID);
    expect(newCardLinkValid(p.m, p.e, p.s, NOW)).toBe(true);
    expect(newCardLinkValid(p.m, p.e, p.s, new Date(NOW.getTime() + 29 * 86_400_000))).toBe(true);
    expect(newCardLinkValid(p.m, p.e, p.s, new Date(NOW.getTime() + 31 * 86_400_000))).toBe(false);
  });

  it("refuses another donation's id, a stretched expiry, a changed signature or a missing part", () => {
    const p = parts(newCardPath(ID, NOW));
    expect(newCardLinkValid("00000000-0000-4000-8000-000000000000", p.e, p.s, NOW)).toBe(false);
    expect(newCardLinkValid(p.m, String(Number(p.e) + 86_400), p.s, NOW)).toBe(false);
    expect(newCardLinkValid(p.m, p.e, `${p.s.slice(0, -1)}${p.s.endsWith("A") ? "B" : "A"}`, NOW)).toBe(false);
    expect(newCardLinkValid(p.m, p.e, "", NOW)).toBe(false);
    expect(newCardLinkValid("not-an-id", p.e, p.s, NOW)).toBe(false);
  });
});

describe("when a new card is offered", () => {
  const base = { status: "active", failed_attempts: 0, attempt_period: null as string | null, last_paid_period: "2026-10", ended_reason: null as string | null };
  it("after a declined try this month, or once it stopped after three", () => {
    expect(needsNewCard({ ...base, failed_attempts: 1, attempt_period: "2026-11" }, NOW)).toBe(true);
    expect(needsNewCard({ ...base, status: "failed", failed_attempts: 3, attempt_period: "2026-11", ended_reason: DECLINED_REASON }, NOW)).toBe(true);
  });
  it("not while all is well, paused, stopped for another reason, or with this month already paid", () => {
    expect(needsNewCard(base, NOW)).toBe(false);
    expect(needsNewCard({ ...base, status: "paused", failed_attempts: 1, attempt_period: "2026-11" }, NOW)).toBe(false);
    expect(needsNewCard({ ...base, status: "failed", ended_reason: "the first payment failed" }, NOW)).toBe(false);
    // A new card that can't be used monthly: this month is paid and nothing is due, so no second payment is offered.
    expect(needsNewCard({ ...base, status: "failed", ended_reason: NEW_CARD_NOT_REUSABLE, last_paid_period: "2026-11" }, NOW)).toBe(false);
    expect(needsNewCard({ ...base, status: "failed", ended_reason: DECLINED_REASON, last_paid_period: "2026-11" }, NOW)).toBe(false);
  });
});

describe("what a paid new card does to the monthly donation", () => {
  const enc = (c: string) => `enc(${c})`;
  const card = { code: "AUTH_new", reusable: true, last4: "1111", brand: "visa", expires: "12/2030" };
  const r = { charge_day: 15, last_paid_period: "2026-09" };
  it("keeps the card, counts the month as paid and schedules the next one", () => {
    const x = newCardPatch(r, "2026-11", card, enc);
    expect(x.reusable).toBe(true);
    expect(x.patch).toMatchObject({ status: "active", ended_reason: null, authorization_encrypted: "enc(AUTH_new)", card_last4: "1111", last_paid_period: "2026-11", attempt_period: null, failed_attempts: 0, next_charge_at: "2026-12-15T06:00:00.000Z" });
  });
  it("never moves a later paid month backwards (a page opened before midnight, paid after it)", () => {
    const x = newCardPatch({ ...r, last_paid_period: "2026-12" }, "2026-11", card, enc);
    expect(x.patch).not.toHaveProperty("last_paid_period");
    expect(x.patch).not.toHaveProperty("next_charge_at");
    expect(x.patch).toMatchObject({ authorization_encrypted: "enc(AUTH_new)", status: "active" });
  });
  it("a card that can't be charged again stops the monthly donation, with the month marked paid and no card kept", () => {
    const x = newCardPatch(r, "2026-11", { ...card, reusable: false }, enc);
    expect(x.reusable).toBe(false);
    expect(x.patch).toMatchObject({ status: "failed", ended_reason: NEW_CARD_NOT_REUSABLE, authorization_encrypted: null, last_paid_period: "2026-11" });
    expect(newCardPatch(r, "2026-11", undefined, enc).reusable).toBe(false);
  });
});

describe("the reasons the server writes and the app reads", () => {
  it("are the same text in one shared file", async () => {
    const shared = await import("../src/lib/donations/monthly-reasons");
    expect(shared.DECLINED_REASON).toBe(DECLINED_REASON);
    expect(shared.NEW_CARD_NOT_REUSABLE).toBe(NEW_CARD_NOT_REUSABLE);
  });
});

describe("the monthly job", () => {
  it("never tries the old card while the donor is putting in a new one", async () => {
    const r: DueMonthly = {
      id: ID, charitySlug: "meals", charityName: "Meals Fund", amountCents: 18_000, contributionCents: 0, chargeDay: 15, authorizationCode: "AUTH_x",
      email: "d@example.co.za", cardLast4: "4081", lastPaidPeriod: "2026-10", attemptPeriod: "2026-11", failedAttempts: 1, nextChargeAt: new Date("2026-11-19T06:00:00Z"),
    };
    const charged: string[] = [];
    const deps: MonthlyDeps = {
      now: NOW,
      store: {
        due: async () => ({ rows: [r], unreadable: [] }),
        claim: async () => true,
        attemptStatus: async () => null,
        stillActive: async () => true,
        createAttempt: async () => {},
        reschedule: async () => {},
        recordPaid: async () => {},
        recordFailure: async () => {},
        failAttempt: async () => {},
        newCardPending: async () => true,
      },
      charge: async ({ reference }) => void charged.push(reference),
      confirm: async () => "paid",
      charityState: async () => ({ accepting: true }),
      isNotFound: () => false,
      isRefused: () => false,
      notifyFailed: async () => {},
    };
    const s = await runMonthlyCharges(deps);
    expect(charged).toEqual([]);
    expect(s.waiting).toEqual([{ id: ID, reason: "the donor is putting in a new card" }]);
  });
});

describe("in the app", () => {
  const row = (o: Partial<RecurringRow>): RecurringRow => ({ id: "r1", amount_cents: 18000, status: "active", next_charge_at: null, charities: { slug: "meals", name_en: "Meals Fund" }, ...o });
  it("marks a declined or stopped monthly donation as needing a card, and nothing else", () => {
    expect(toRecurring([row({ failed_attempts: 1 })])[0].needsCard).toBe(true);
    expect(toRecurring([row({ status: "failed", failed_attempts: 3, ended_reason: DECLINED_REASON })])[0].needsCard).toBe(true);
    // Stopped because the new card can't be used monthly, or for another reason: a new monthly donation, not "Update card".
    expect(toRecurring([row({ status: "failed", ended_reason: NEW_CARD_NOT_REUSABLE })])[0].needsCard).toBeUndefined();
    expect(toRecurring([row({ status: "failed", ended_reason: "the first payment failed" })])[0].needsCard).toBeUndefined();
    expect(toRecurring([row({ failed_attempts: 0 })])[0].needsCard).toBeUndefined();
    expect(toRecurring([row({ status: "paused", failed_attempts: 1 })])[0].needsCard).toBeUndefined();
  });

  it("opens only our own new-card page, and says plainly when it can't", async () => {
    const ok = await requestNewCardPage("https://givezy.test/", "r1", "tok", async () => ({ status: 200, json: { ok: true, path: "/monthly/new-card?m=r1&e=1&s=x" } }));
    expect(ok).toEqual({ ok: true, url: "https://givezy.test/monthly/new-card?m=r1&e=1&s=x" });
    const elsewhere = await requestNewCardPage("https://givezy.test", "r1", "tok", async () => ({ status: 200, json: { ok: true, path: "https://evil.test/x" } }));
    expect(elsewhere.ok).toBe(false);
    const offline = await requestNewCardPage("https://givezy.test", "r1", "tok", async () => { throw new Error("offline"); });
    expect(offline).toMatchObject({ ok: false, message: expect.stringContaining("connection") });
  });
});
