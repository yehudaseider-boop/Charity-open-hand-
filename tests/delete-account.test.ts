import { describe, expect, it } from "vitest";
import {
  CHARGE_IN_FLIGHT_MS,
  DELETED_LIST,
  DELETE_MESSAGES,
  ERASE_KEPT_TEXT,
  KEPT_LIST,
  RECENT_SIGN_IN_MS,
  confirmationOk,
  deletionEmail,
  lastSignInSeconds,
  outcomeFor,
  refusalIsDeadEnd,
  signInIsRecent,
  type DeleteCode,
} from "@/lib/delete-account";

const NOW = Date.UTC(2026, 10, 25, 10, 0, 0);
const sec = (msAgo: number) => Math.floor((NOW - msAgo) / 1000);

describe("when did they last sign in", () => {
  it("takes the newest time among the ways the session was started", () => {
    expect(lastSignInSeconds([{ method: "otp", timestamp: 100 }, { method: "otp", timestamp: 300 }, { method: "magiclink", timestamp: 200 }])).toBe(300);
  });
  it("is null when the token gives no time, so the person signs in again", () => {
    expect(lastSignInSeconds([{ method: "otp" }])).toBeNull();
    expect(lastSignInSeconds(undefined)).toBeNull();
    expect(lastSignInSeconds("x")).toBeNull();
    expect(lastSignInSeconds([{ timestamp: "soon" }, { timestamp: -5 }, null])).toBeNull();
  });
  it("reads Supabase's real shape: an array of { method, timestamp } with unix seconds, and counts no amr, or entries without a timestamp, as not recent", () => {
    const real = [{ method: "otp", timestamp: sec(60_000) }];
    expect(lastSignInSeconds(real)).toBe(sec(60_000));
    expect(signInIsRecent(lastSignInSeconds(real), NOW)).toBe(true);
    for (const amr of [[{ method: "otp" }], [{ method: "otp", timestamp: undefined }], undefined, null, []]) {
      expect(signInIsRecent(lastSignInSeconds(amr), NOW)).toBe(false);
    }
    // An old session that was only refreshed stays old.
    expect(signInIsRecent(lastSignInSeconds([{ method: "otp", timestamp: sec(3 * 3_600_000) }]), NOW)).toBe(false);
  });
});

describe("a recent sign-in", () => {
  it("is within ten minutes", () => {
    expect(RECENT_SIGN_IN_MS).toBe(600_000);
    expect(signInIsRecent(sec(0), NOW)).toBe(true);
    expect(signInIsRecent(sec(9 * 60_000), NOW)).toBe(true);
    expect(signInIsRecent(sec(11 * 60_000), NOW)).toBe(false);
    expect(signInIsRecent(sec(3 * 60 * 60_000), NOW)).toBe(false);
  });
  it("is not recent when there is no time on record, or the time is far in the future", () => {
    expect(signInIsRecent(null, NOW)).toBe(false);
    expect(signInIsRecent(sec(-60 * 60_000), NOW)).toBe(false);
  });
});

describe("the typed confirmation", () => {
  it("accepts DELETE in any case with spaces round it, or their own email", () => {
    expect(confirmationOk("DELETE", "a@example.com")).toBe(true);
    expect(confirmationOk("  delete ", "a@example.com")).toBe(true);
    expect(confirmationOk("A@Example.com", "a@example.com ")).toBe(true);
  });
  it("refuses anything else, empty, or not text", () => {
    for (const typed of ["", " ", "yes", "DELET", "delete my account", "b@example.com", null, undefined, 5, {}]) expect(confirmationOk(typed, "a@example.com")).toBe(false);
    // An empty email on file never makes an empty box right.
    expect(confirmationOk("", "")).toBe(false);
  });
});

describe("the words (DRAFT for Yosef)", () => {
  it("every refusal says what happened to their data, and none shouts", () => {
    for (const [code, text] of Object.entries(DELETE_MESSAGES)) {
      expect(text, code).not.toMatch(/!/);
      // Never claims more than is true: a person may be part way through (charging stopped, data possibly erased).
      if (code !== "incomplete") expect(text, code).toMatch(/nothing was deleted|your account is still there|part of your data/i);
    }
    // A half-done run says what is already stopped, and that pressing again carries on.
    expect(DELETE_MESSAGES.incomplete).toMatch(/already stopped/);
    expect(DELETE_MESSAGES.incomplete).toMatch(/try again/i);
  });
  it("the manager refusal says to hand over the charity, the open request one says we are on it", () => {
    expect(DELETE_MESSAGES.manager).toMatch(/hand it over/i);
    expect(DELETE_MESSAGES.request_open).toMatch(/working on it/i);
  });
  it("claims 'nothing was deleted' only where that is always true", () => {
    // These can come after the cancel or part of the erasure, so they say the account is still there instead.
    for (const code of ["busy", "unavailable", "cancel_failed", "payment_in_progress", "sign_in_again", "confirm", "manager"] as DeleteCode[]) {
      expect(DELETE_MESSAGES[code], code).not.toMatch(/nothing was deleted|deleted nothing/i);
    }
    expect(DELETE_MESSAGES.busy).toMatch(/your account is still there/i);
    expect(DELETE_MESSAGES.unavailable).toMatch(/your account is still there/i);
    expect(DELETE_MESSAGES.cancel_failed).toMatch(/some of your monthly donations may already be stopped/i);
  });
  it("the manager refusal also says plainly that part of the data may already be gone, and to contact us", () => {
    expect(DELETE_MESSAGES.manager).toMatch(/part of your data was deleted before we could finish/);
    expect(DELETE_MESSAGES.manager).toMatch(/contact us/);
  });
  it("only a refusal that retrying cannot fix is a dead end", () => {
    for (const code of ["manager", "platform_admin", "request_open", "reviewer"] as DeleteCode[]) expect(refusalIsDeadEnd(code), code).toBe(true);
    for (const code of ["incomplete", "cancel_failed", "unavailable", "busy", "payment_in_progress", "confirm"] as DeleteCode[]) expect(refusalIsDeadEnd(code), code).toBe(false);
  });
  it("fits in the app's 300-character limit for a server message", () => {
    for (const text of Object.values(DELETE_MESSAGES)) expect(text.length).toBeLessThanOrEqual(300);
  });
  it("lists what is deleted and what is kept, with tax law as the reason", () => {
    expect(DELETED_LIST.join(" ")).toMatch(/monthly donations/);
    expect(KEPT_LIST.join(" ")).toMatch(/s18A receipt/);
    expect(ERASE_KEPT_TEXT).toMatch(/tax law requires/);
  });
  it("has no religious wording anywhere", () => {
    const all = [...Object.values(DELETE_MESSAGES), ...DELETED_LIST, ...KEPT_LIST, ERASE_KEPT_TEXT, deletionEmail("x").text].join(" ");
    expect(all).not.toMatch(/maaser|chomesh|tzedaka|hebrew|jewish|torah|shul/i);
  });
  it("the confirmation email is plain, says what was kept and why, and offers a person", () => {
    const withMail = deletionEmail("hello@givezy.co.za");
    expect(withMail.subject).toBe("Your Givezy account has been deleted");
    expect(withMail.text).not.toMatch(/!/);
    expect(withMail.text).toContain(ERASE_KEPT_TEXT);
    expect(withMail.text).toMatch(/not be charged again/);
    expect(withMail.text).toContain("hello@givezy.co.za");
    expect(deletionEmail(null).text).toMatch(/a person will help/);
  });
  it("holds off while a charge may be on its way for half an hour", () => {
    expect(CHARGE_IN_FLIGHT_MS).toBe(1_800_000);
  });
});

describe("what the app does with the server's answer", () => {
  it("done", () => {
    expect(outcomeFor(200, { ok: true }, false)).toEqual({ kind: "done" });
  });
  it("a refusal keeps the server's code and says nothing was deleted", () => {
    const o = outcomeFor(409, { ok: false, code: "manager", message: "x" }, false);
    expect(o).toMatchObject({ kind: "refused", code: "manager" });
    expect(o.kind === "refused" && o.message).toBe(DELETE_MESSAGES.manager);
  });
  it("sign in again asks for a fresh code", () => {
    expect(outcomeFor(401, { ok: false, code: "sign_in_again" }, false).kind).toBe("sign_in_again");
  });
  it("a dead sign-in is 'sign in again', unless an earlier try got no answer: then the account may be gone", () => {
    expect(outcomeFor(401, { ok: false, message: "Please sign in again." }, false).kind).toBe("sign_in_again");
    const maybe = outcomeFor(401, { ok: false, message: "Please sign in again." }, true);
    expect(maybe.kind).toBe("maybe_done");
    expect(maybe.kind === "maybe_done" && maybe.message).toMatch(/may already be deleted/);
  });
  it("no answer: says nothing was deleted that we know of, and the typed words are kept; a busy server is not the phone's connection", () => {
    const offline = outcomeFor(null, null, false);
    expect(offline.kind).toBe("no_answer");
    expect(offline.kind === "no_answer" && offline.message).toMatch(/check your connection/i);
    const busy = outcomeFor(503, "<html>", false);
    expect(busy.kind === "no_answer" && busy.message).toMatch(/isn't answering properly/);
    expect(busy.kind === "no_answer" && busy.message).not.toMatch(/connection/i);
  });
  it("an unknown code is never shown as a refusal", () => {
    expect(outcomeFor(400, { ok: false, code: "<script>" }, false).kind).toBe("no_answer");
  });
});
