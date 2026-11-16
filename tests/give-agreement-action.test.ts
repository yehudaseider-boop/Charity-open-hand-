/**
 * The website's give action with one agreement tick or two (platformConfig.checkout.singleAgreementTick, 04/11/2026):
 * either way the same agreements reach checkout (which records popia_consent_at, age_confirmed_at and the consent
 * row), and a missing tick is one plain problem on the box that is on screen.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { platformConfig } from "@/config/platform";
import type { CheckoutInput } from "@/lib/donations/validation";

vi.mock("server-only", () => ({}));
const started: CheckoutInput[] = [];
// Checkout runs the shared rules on what it is given, as the real one does, before anything is recorded.
vi.mock("@/lib/donations/checkout", async () => {
  const { checkDonorDetails } = await import("@/lib/donations/validation");
  return {
    startDonation: async (args: { input: CheckoutInput }) => {
      const fieldErrors = checkDonorDetails(args.input, true);
      if (Object.keys(fieldErrors).length) return { ok: false, message: "Please check the highlighted fields.", fieldErrors };
      started.push(args.input);
      return { ok: true, redirectUrl: "https://pay.test/x", reference: "r", token: "t" };
    },
  };
});
vi.mock("@/lib/donations/charity", () => ({ loadDonatableCharity: async () => ({ id: "c1", receiptsAvailable: true, acceptingPayments: true }) }));
vi.mock("@/lib/auth", () => ({ getViewer: async () => null }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { url }); } }));

const { submitDonation } = await import("@/app/c/[slug]/donate/actions");

const setSingle = (on: boolean) => ((platformConfig.checkout as { singleAgreementTick: boolean }).singleAgreementTick = on);
// The shipped setting is on; each test sets the one it is about.
const SHIPPED = platformConfig.checkout.singleAgreementTick;
afterEach(() => {
  setSingle(SHIPPED);
  started.length = 0;
});

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ donor_type: "individual", first_name: "Dana", last_name: "Dube", email: "dana@example.com", ...fields })) fd.set(k, v);
  return fd;
}
const give = (fd: FormData) => submitDonation("meals", 25_000, 0, false, 25_000, false, undefined, { ok: false }, fd);

describe("the single agreement tick", () => {
  it("on: the one tick sends both agreements to checkout", async () => {
    setSingle(true);
    await expect(give(form({ agreement: "on" }))).resolves.toEqual({ ok: true, redirectUrl: "https://pay.test/x" });
    expect(started[0]).toMatchObject({ age_confirmed: "on", popia_consent: "on" });
  });
  it("on, not ticked: one problem, on the one box, and nothing started", async () => {
    setSingle(true);
    const r = await give(form({ age_confirmed: "on", popia_consent: "on" }));
    expect(r.ok).toBe(false);
    expect(Object.keys(r.fieldErrors ?? {})).toEqual(["agreement"]);
    expect(r.message).toBe("Please fix the field marked in red above.");
    expect(started).toHaveLength(0);
  });
  it("off: the two ticks as before; the single box alone is not enough", async () => {
    setSingle(false);
    await expect(give(form({ age_confirmed: "on", popia_consent: "on" }))).resolves.toEqual({ ok: true, redirectUrl: "https://pay.test/x" });
    expect(started[0]).toMatchObject({ age_confirmed: "on", popia_consent: "on" });
    const r = await give(form({ agreement: "on" }));
    expect(Object.keys(r.fieldErrors ?? {}).sort()).toEqual(["age_confirmed", "popia_consent"]);
    expect(started).toHaveLength(1);
  });
  it("after paying: an s18A gift starts without the ID number and address", async () => {
    await expect(give(form({ agreement: "on", wants_18a: "on", s18a_when: "later" }))).resolves.toEqual({ ok: true, redirectUrl: "https://pay.test/x" });
    expect(started[0]).toMatchObject({ wants_18a: "on", s18a_when: "later" });
    expect(started[0].id_number).toBeUndefined();
  });
});
