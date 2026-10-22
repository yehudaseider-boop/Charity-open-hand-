/** Launch pieces: the cause list rules, the daily safety-net email, and the scheduler check. */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { causeSlug, checkCauseName, SUGGESTED_CAUSES, causeMessages } = await import("@/lib/charity/causes");
const { dailyDigest } = await import("@/lib/ops/daily");
const { cronAllowed } = await import("@/lib/ops/alert");
import type { DailyChecks, JobProblems } from "@/lib/ops/daily";

describe("causes", () => {
  it("makes a stable web address from the name", () => {
    expect(causeSlug("Food and welfare")).toBe("food-and-welfare");
    expect(causeSlug("  Arts & Culture ")).toBe("arts-and-culture");
    expect(causeSlug("Café ")).toBe("cafe");
  });
  it("takes a sensible name and refuses empty, too long or symbol-only ones", () => {
    expect(checkCauseName("  Elderly   care ")).toEqual({ ok: true, name: "Elderly care", slug: "elderly-care" });
    expect(checkCauseName(" ")).toMatchObject({ ok: false, code: "empty" });
    expect(checkCauseName("x".repeat(41))).toMatchObject({ ok: false, code: "long" });
    expect(checkCauseName("!!! ???")).toMatchObject({ ok: false, code: "letters" });
  });
  it("the launch list gives twelve different addresses, and every outcome has words", () => {
    expect(new Set(SUGGESTED_CAUSES.map(causeSlug)).size).toBe(12);
    for (const code of ["empty", "long", "letters"]) expect(causeMessages[code]).toBeTruthy();
  });
});

const quiet: DailyChecks = { pending: { checked: 3, paid: 2, failed: 1, still: 0, errors: 0 }, stuckPending: 0, confirmations: { resent: 1, failedAgain: 0 }, unhandledEvents: 0, held: {} };
const fine: JobProblems = { monthlyErrors: 0, monthlyReview: 0, monthlyStopped: 0, payoutsFailed: false, monthlyFailed: false };

describe("the daily safety-net email", () => {
  it("stays quiet when everything sorted itself out", () => {
    expect(dailyDigest(quiet, fine)).toEqual([]);
  });
  it("lists, in plain words, each thing that needs a person", () => {
    const lines = dailyDigest(
      { ...quiet, stuckPending: 1, unhandledEvents: 2, confirmations: { resent: 0, failedAgain: 3 }, held: { "donation.dispute_opened": 1, "monthly.paid_twice": 1 } },
      { ...fine, monthlyFailed: true, monthlyStopped: 2, payoutsFailed: true },
    );
    expect(lines.join("\n")).toContain("The monthly collection did not run today. Nothing was charged by it.");
    expect(lines).toContain("1 payment has been pending for more than 3 days.");
    expect(lines).toContain("2 messages from the payment provider were not handled within an hour.");
    expect(lines).toContain("3 confirmation emails to donors still could not be sent.");
    expect(lines).toContain("Dispute (chargeback) opened: 1");
    expect(lines.some((l) => l.startsWith("A monthly donation was paid twice"))).toBe(true);
    expect(lines.join("\n")).not.toMatch(/!|—/);
  });
});

describe("the scheduler's key", () => {
  const req = (auth?: string) => new Request("https://x.test/api/jobs/daily", { headers: auth ? { authorization: auth } : {} });
  it("is off without CRON_SECRET, and lets in only the exact key", () => {
    delete process.env.CRON_SECRET;
    expect(cronAllowed(req("Bearer x"))).toBeNull();
    process.env.CRON_SECRET = "s3cret-value";
    expect(cronAllowed(req("Bearer s3cret-value"))).toBe(true);
    expect(cronAllowed(req("Bearer s3cret-valuE"))).toBe(false);
    expect(cronAllowed(req())).toBe(false);
  });
});
