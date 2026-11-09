/** "Pay with a new card" for a monthly donation: a rate-limit check that fails counts as limited, never as a pass. */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
let limit: boolean | "broken" = false;
let started = 0;
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;${to}`, to });
  },
}));
vi.mock("@/lib/auth", () => ({ getViewer: async () => ({ userId: "u1" }) }));
vi.mock("@/lib/rate-limit", () => ({
  hitRateLimit: async () => {
    if (limit === "broken") throw new Error("rate limit store down");
    return limit;
  },
}));
vi.mock("@/lib/donations/new-card", () => ({
  newCardLinkValid: () => false,
  ownsMonthly: async () => true,
  startNewCardPayment: async () => (started++, { ok: true, redirectUrl: "https://pay.test/x" }),
}));

const { payWithNewCard } = await import("@/app/monthly/new-card/actions");
const go = async () => {
  const f = new FormData();
  f.set("m", "11111111-1111-4111-8111-111111111111");
  return payWithNewCard(f).then(
    () => "",
    (e: { to?: string }) => e.to ?? "",
  );
};

beforeEach(() => {
  limit = false;
  started = 0;
});

describe("paying a monthly donation with a new card", () => {
  it("opens the payment page under the limit", async () => {
    expect(await go()).toBe("https://pay.test/x");
    expect(started).toBe(1);
  });
  it("over the limit, says to wait", async () => {
    limit = true;
    expect(await go()).toMatch(/x=limit/);
    expect(started).toBe(0);
  });
  it("a limit check that fails opens nothing and shows the plain 'try again' message", async () => {
    limit = "broken";
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await go()).toMatch(/x=error/);
    expect(started).toBe(0);
  });
});
