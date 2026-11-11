/**
 * The website give form's quiet bot checks (card-testing protection, 11/11/2026): a filled-in hidden field or a
 * form sent the instant the page opened stops before checkout, with a plain "press Give again" and nothing started.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const started: unknown[] = [];
vi.mock("@/lib/donations/checkout", () => ({
  startDonation: async (args: unknown) => (started.push(args), { ok: true, redirectUrl: "https://pay.test/x", reference: "r", token: "t" }),
}));
const blocked: string[] = [];
vi.mock("@/lib/donations/giving-guard", () => ({ recordBlocked: async (reason: string) => void blocked.push(reason) }));
vi.mock("@/lib/donations/charity", () => ({ loadDonatableCharity: async () => ({ id: "c1", receiptsAvailable: true, acceptingPayments: true }) }));
vi.mock("@/lib/auth", () => ({ getViewer: async () => null }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { url }); } }));

const { submitDonation } = await import("@/app/c/[slug]/donate/actions");

afterEach(() => {
  started.length = 0;
  blocked.length = 0;
});

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ donor_type: "individual", first_name: "Dana", last_name: "Dube", email: "dana@example.com", age_confirmed: "on", popia_consent: "on", ...fields })) fd.set(k, v);
  return fd;
}
const give = (fd: FormData) => submitDonation("meals", 25_000, 0, false, 25_000, false, undefined, { ok: false }, fd);

describe("the give form's quiet bot checks", () => {
  it("a person who took their time goes through to the payment page", async () => {
    await expect(give(form({ form_open_ms: "42000" }))).rejects.toMatchObject({ url: "https://pay.test/x" });
    expect(started).toHaveLength(1);
    // The timing never reaches checkout or the saved details.
    expect(JSON.stringify(started[0])).not.toContain("form_open_ms");
  });

  it("the hidden field filled in: nothing starts, plain words, and the reason is counted", async () => {
    const r = await give(form({ website: "https://spam.example", form_open_ms: "42000" }));
    expect(r).toEqual({ ok: false, message: "Please check your details and press Give again. Nothing was charged." });
    expect(started).toHaveLength(0);
    expect(blocked).toEqual(["bot"]);
  });

  it("sent the instant the page opened: asked to press Give again", async () => {
    const r = await give(form({ form_open_ms: "400" }));
    expect(r.message).toMatch(/press Give again/);
    expect(started).toHaveLength(0);
  });

  it("an older page with no timing still goes through (the attempt limits still apply in checkout)", async () => {
    await expect(give(form({}))).rejects.toMatchObject({ url: "https://pay.test/x" });
    expect(started).toHaveLength(1);
  });
});
