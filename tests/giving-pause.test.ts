/** The pause switch: GIVING_PAUSED=yes stops new gifts everywhere, in plain words, and nothing else (19/11/2026). */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GIVING_PAUSED_MESSAGE, givingPaused } from "../src/lib/giving-pause";
import { settingsCheck } from "../src/lib/ops/settings-check";

describe("the pause switch", () => {
  it("is on only for exactly yes", () => {
    expect(givingPaused({ GIVING_PAUSED: "yes" })).toBe(true);
    for (const v of [undefined, "", "no", "YES", "true", "1", " yes"]) expect(givingPaused({ GIVING_PAUSED: v })).toBe(false);
  });

  it("tells a donor what did and didn't happen, with no exclamation mark", () => {
    expect(GIVING_PAUSED_MESSAGE).toMatch(/Nothing has been charged/);
    expect(GIVING_PAUSED_MESSAGE).not.toMatch(/[!—]/);
  });
});

vi.mock("server-only", () => ({}));
let charity: Record<string, unknown> | null = null;
vi.mock("@/lib/donations/charity", () => ({ loadDonatableCharity: async () => charity }));
vi.mock("@/lib/donations/checkout", () => ({ loadOpenCampaign: async () => null }));
vi.mock("@/lib/rate-limit", () => ({ ipKeys: () => [], hitRateLimit: async () => false }));
vi.mock("@/lib/app-auth", () => ({ appAccount: async () => null }));
vi.mock("@/lib/donations/saved-id", () => ({ savedIdLast4: async () => null }));

describe("the Admin settings check", () => {
  const line = (env: Record<string, string | undefined>) => settingsCheck(env).find((c) => c.name === "GIVING_PAUSED");
  it("shows the switch as a problem while it is on, so it is never left on by mistake", () => {
    expect(line({ GIVING_PAUSED: "yes" })?.status).toBe("fix");
    expect(line({ GIVING_PAUSED: "yes" })?.says).toMatch(/nobody can give/i);
  });
  it("shows it as fine while it is off", () => {
    expect(line({})?.status).toBe("ok");
  });
});

describe("the Admin settings check for the daily check-in", () => {
  const line = (env: Record<string, string | undefined>) => settingsCheck(env).find((c) => c.name === "HEARTBEAT_DAILY_URL");
  it("reminds you while it is not set, and is quiet once it is", () => {
    expect(line({})?.status).toBe("later");
    expect(line({ HEARTBEAT_DAILY_URL: "http://nope.example/x" })?.status).toBe("later");
    expect(line({ HEARTBEAT_DAILY_URL: "https://uptime.example/hb/x" })?.status).toBe("ok");
  });
});

describe("what the phone app is told while paused", () => {
  beforeEach(() => {
    process.env.APP_GIVING = "yes";
    charity = { id: "c1", slug: "meals", acceptingPayments: false, givingPaused: true, receiptsAvailable: false, suggestedCents: [] };
  });

  it("the ready answer says paused, and not accepting", async () => {
    const { POST } = await import("@/app/api/app/ready/route");
    const res = await POST(new Request("https://site.test/x", { method: "POST", body: JSON.stringify({ slug: "meals" }), headers: { "content-type": "application/json" } }) as never);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.accepting).toBe(false);
    expect(j.paused).toBe(true);
  });

  it("a charity that simply isn't connected yet is not called paused", async () => {
    charity = { ...charity, givingPaused: false };
    const { POST } = await import("@/app/api/app/ready/route");
    const res = await POST(new Request("https://site.test/x", { method: "POST", body: JSON.stringify({ slug: "meals" }), headers: { "content-type": "application/json" } }) as never);
    const j = await res.json();
    expect(j.accepting).toBe(false);
    expect(j.paused).toBe(false);
  });
});
