/** "Update my card" on a paused monthly donation (23/11/2026): the payment counts, the new card is kept, it stays paused. */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64");
const { newCardPatch } = await import("@/lib/donations/new-card");

describe("a paid new card on a paused monthly donation", () => {
  const enc = (c: string) => `enc(${c})`;
  const card = { code: "AUTH_new", reusable: true, last4: "1111", brand: "visa", expires: "12/2030" };
  const r = { charge_day: 15, last_paid_period: "2026-09", status: "paused" };

  it("keeps the new card and counts the month as paid, without un-pausing", () => {
    const x = newCardPatch(r, "2026-11", card, enc);
    expect(x.reusable).toBe(true);
    expect(x.patch).not.toHaveProperty("status");
    expect(x.patch).not.toHaveProperty("ended_reason");
    expect(x.patch).toMatchObject({ authorization_encrypted: "enc(AUTH_new)", last_paid_period: "2026-11" });
  });

  it("a card that can't be charged again does not end a paused monthly donation: only the month is counted", () => {
    const x = newCardPatch(r, "2026-11", { ...card, reusable: false }, enc);
    expect(x.reusable).toBe(false);
    expect(x.patch).toEqual({ last_paid_period: "2026-11" });
  });

  it("an active one still becomes active as before", () => {
    expect(newCardPatch({ ...r, status: "failed" }, "2026-11", card, enc).patch).toMatchObject({ status: "active" });
  });
});
