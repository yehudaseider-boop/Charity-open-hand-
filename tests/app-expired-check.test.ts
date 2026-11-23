/**
 * A gift whose check link has expired (the website's 30 days, 23/11/2026): the app hears "expired" only from our
 * server's own answer for it, says plainly what did and didn't happen, and stops asking (the gift is settled on the phone).
 */
import { describe, expect, it } from "vitest";
import { afterPaymentMessage, afterPaymentTone, expiredCheckMessage, paymentStatus } from "../apps/mobile/src/lib/pay-api";
import { settles } from "../apps/mobile/src/lib/pending-gift";
import { waitingGiftLine } from "../apps/mobile/src/lib/give-checks";

const expiredReply = async () => ({ status: 410, json: { ok: false, expired: true, message: "This gift's check link has expired." } });

describe("an expired check link in the app", () => {
  it("is read from the server's expired answer only", async () => {
    expect(await paymentStatus("https://x.test", "r", "t", expiredReply)).toBe("expired");
    // "Not found" (no link, a wrong one) stays a plain no-answer, and an odd reply is never taken as expired.
    expect(await paymentStatus("https://x.test", "r", "t", async () => ({ status: 404, json: { ok: false, message: "Donation not found." } }))).toBe("unknown");
    expect(await paymentStatus("https://x.test", "r", "t", async () => ({ status: 410, json: { ok: false, expired: "yes" } }))).toBe("unknown");
    expect(await paymentStatus("https://x.test", "r", "t", async () => ({ status: 200, json: { ok: true, outcome: "expired" } }))).toBe("unknown");
  });

  it("settles the gift on the phone, so nothing keeps asking about it", () => {
    expect(settles("expired")).toBe(true);
    expect(settles("pending")).toBe(false);
  });

  it("says what happened, that nothing was changed, and where the gift is: signed in, under Progress", () => {
    const m = expiredCheckMessage(true);
    expect(m).toMatch(/check link has expired, for your safety/);
    expect(m).toMatch(/Nothing was changed\./);
    expect(m).toMatch(/confirmation is in your email, and the gift is under Progress\.$/);
    expect(afterPaymentMessage("expired", false, undefined, true)).toBe(m);
  });

  it("signed out, it says to sign in to see the gifts", () => {
    const m = afterPaymentMessage("expired");
    expect(m).toBe(expiredCheckMessage(false));
    expect(m).toMatch(/Sign in with the email you gave with to see your gifts under Progress\.$/);
  });

  it("is a calm note, never a red error, and uses the house style", () => {
    expect(afterPaymentTone("expired")).toBe("wait");
    for (const m of [expiredCheckMessage(true), expiredCheckMessage(false)]) {
      expect(m).not.toMatch(/[!—]/);
      expect(m).not.toMatch(/charged|declined/);
    }
  });

  it("reads well after the waiting-gift line on the give screen", () => {
    const line = waitingGiftLine({ charityName: "Demo Charity", sentAt: "2026-10-20T14:39:00Z", summary: { cents: 3_000, contributionCents: 100 } });
    expect(`Your gift of ${line} ${expiredCheckMessage(false)}`).toBe(
      "Your gift of R31 to Demo Charity, started at 16:39 on 20/10/2026. This gift's check link has expired, for your safety, so the app can't check it any more. Nothing was changed. If the gift was paid, its confirmation is in your email. Sign in with the email you gave with to see your gifts under Progress.",
    );
  });
});
