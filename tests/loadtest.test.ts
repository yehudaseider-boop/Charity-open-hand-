/**
 * The load test's safety checks and its signed test payload (scripts/loadtest/lib.mjs).
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { checkTarget, judge, parseDuration, plannedRequests, rateAt, signedWebhook, summarise } from "../scripts/loadtest/lib.mjs";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

beforeAll(() => {
  process.env.TEST_GATEWAY_SECRET = "test-secret";
});

describe("load test target checks", () => {
  it("has no default address", () => {
    expect(checkTarget({ baseUrl: undefined, allowHosts: ["localhost"] }).ok).toBe(false);
  });
  it("refuses the live site, subdomains, and a live site on the allow list", () => {
    for (const baseUrl of ["https://givezy.co.za", "https://www.givezy.co.za/x", "https://GIVEZY.CO.ZA."]) {
      expect(checkTarget({ baseUrl, allowHosts: [new URL(baseUrl).hostname], approvedBy: "Yehuda" }).ok).toBe(false);
    }
    expect(checkTarget({ baseUrl: "https://staging.test", allowHosts: ["staging.test", "givezy.co.za"], approvedBy: "x" }).ok).toBe(false);
  });
  it("refuses a host that is not on the allow list, wildcards and an empty list", () => {
    expect(checkTarget({ baseUrl: "http://localhost:3000", allowHosts: [] }).ok).toBe(false);
    expect(checkTarget({ baseUrl: "http://localhost:3000", allowHosts: ["other.test"] }).ok).toBe(false);
    expect(checkTarget({ baseUrl: "https://a.test", allowHosts: ["*.test"], approvedBy: "x" }).ok).toBe(false);
  });
  it("allows this machine when listed, and others only with an approver", () => {
    expect(checkTarget({ baseUrl: "http://127.0.0.1:4010", allowHosts: ["127.0.0.1"] }).ok).toBe(true);
    expect(checkTarget({ baseUrl: "https://staging.test", allowHosts: ["staging.test"] }).ok).toBe(false);
    expect(checkTarget({ baseUrl: "https://staging.test", allowHosts: ["staging.test"], approvedBy: "Yehuda, 24/11/2026" }).ok).toBe(true);
  });
});

describe("signed test webhook", () => {
  it("is accepted by the test gateway's own parser", async () => {
    const { testGateway } = await import("@/lib/gateway/test-gateway");
    const { body, headers } = signedWebhook({ id: "evt-1", reference: "ref-1", amountCents: 5000, secret: "test-secret" });
    const event = await testGateway.parseWebhook(body, new Headers(headers));
    expect(event?.type).toBe("payment_succeeded");
    expect(event?.reference).toBe("ref-1");
    const bad = signedWebhook({ id: "evt-1", reference: "ref-1", amountCents: 5000, secret: "other" });
    expect(await testGateway.parseWebhook(bad.body, new Headers(bad.headers))).toBeNull();
  });
});

describe("ramp and numbers", () => {
  it("ramps linearly then holds, and plans the request count", () => {
    expect(rateAt(0, { targetRate: 10, rampSec: 10 })).toBe(0);
    expect(rateAt(5, { targetRate: 10, rampSec: 10 })).toBe(5);
    expect(rateAt(30, { targetRate: 10, rampSec: 10 })).toBe(10);
    expect(plannedRequests({ targetRate: 10, rampSec: 10, durationSec: 30 })).toBe(250);
  });
  it("summarises and never passes a threshold that was not set", () => {
    const s = summarise([
      { ms: 10, status: 200, ok: true },
      { ms: 20, status: 200, ok: true },
      { ms: 30, status: 500, ok: false },
      { ms: 40, status: 200, ok: true },
    ]);
    expect(s.errorPct).toBe(25);
    expect(s.p95).toBe(40);
    expect(judge(s, {}).every((c) => c.state === "not set")).toBe(true);
    expect(judge(s, { maxErrorPct: 1, maxP95Ms: 100 }).map((c) => c.state)).toEqual(["fail", "pass"]);
  });
  it("reads durations", () => {
    expect(parseDuration("5m")).toBe(300);
    expect(parseDuration("90")).toBe(90);
    expect(parseDuration("soon")).toBeNull();
  });
});
