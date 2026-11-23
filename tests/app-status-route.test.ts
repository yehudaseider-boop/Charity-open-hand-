import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/donations/confirmation-access", () => ({ confirmationAccess: async () => "valid" }));
vi.mock("@/lib/donations/confirm", () => ({ confirmPayment: async () => "pending" }));
vi.mock("@/lib/rate-limit", () => ({ hitRateLimit: async () => false, ipKeys: () => ["ip"] }));

describe("POST /api/app/status", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("still answers for a started gift when giving in the app is switched off", async () => {
    vi.stubEnv("APP_GIVING", "");
    const { POST } = await import("@/app/api/app/status/route");
    const body = JSON.stringify({ reference: "5b0c1b9e-8f6c-4f0e-9d0a-3c1d2e4f5a6b", token: "t".repeat(43) });
    const res = await POST(new Request("http://x/api/app/status", { method: "POST", body }) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, outcome: "pending" });
  });
});
