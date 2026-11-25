/**
 * The app's side of deleting your own account (25/11/2026): the calls, how each answer reads, when the button is ready,
 * and what this phone forgets. The screen itself is checked by eye (see docs/decisions.md); these are its pure parts.
 */
import { describe, expect, it } from "vitest";
import { checkDeletion, deleteReady, phoneKeysFor, requestDeletion } from "../apps/mobile/src/lib/delete-account";
import { DELETE_MESSAGES } from "@/lib/delete-account";

const site = "https://givezy.example/";
const sender = (reply: { status: number; json: unknown } | Error) => {
  const seen: { method: string; url: string; token: string; body?: unknown }[] = [];
  return {
    seen,
    send: async (method: "GET" | "POST", url: string, token: string, body?: unknown) => {
      seen.push({ method, url, token, body });
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
};

describe("the check before anything is typed", () => {
  it("asks our own server with the person's token, and reads 'ok' with whether to sign in again", async () => {
    const s = sender({ status: 200, json: { ok: true, signInAgain: true } });
    expect(await checkDeletion(site, "tok", s.send)).toEqual({ kind: "ok", signInAgain: true });
    expect(s.seen).toEqual([{ method: "GET", url: "https://givezy.example/api/app/delete-account", token: "tok", body: undefined }]);
    expect(await checkDeletion(site, "tok", sender({ status: 200, json: { ok: true } }).send)).toEqual({ kind: "ok", signInAgain: false });
  });

  it("shows a refusal up front, in the server's plain words", async () => {
    const r = await checkDeletion(site, "tok", sender({ status: 409, json: { ok: false, code: "manager", message: "x" } }).send);
    expect(r).toEqual({ kind: "refused", code: "manager", message: DELETE_MESSAGES.manager });
  });

  it("an ended sign-in is not a refusal: the person signs in again", async () => {
    expect(await checkDeletion(site, "tok", sender({ status: 401, json: { ok: false, message: "Please sign in again." } }).send)).toEqual({ kind: "ok", signInAgain: true });
  });

  it("offline or a busy server: says nothing was deleted, and which side is the problem", async () => {
    const offline = await checkDeletion(site, "tok", sender(new Error("Network request failed")).send);
    expect(offline).toMatchObject({ kind: "no_answer" });
    expect((offline as { message: string }).message).toMatch(/connection/i);
    expect((offline as { message: string }).message).toMatch(/Nothing was deleted/);
    const busy = await checkDeletion(site, "tok", sender({ status: 503, json: null }).send);
    expect((busy as { message: string }).message).toMatch(/isn't answering properly/);
  });
});

describe("deleting", () => {
  it("sends exactly what was typed, to our server only", async () => {
    const s = sender({ status: 200, json: { ok: true } });
    expect(await requestDeletion(site, "tok", "delete", false, s.send)).toEqual({ kind: "done" });
    expect(s.seen[0]).toMatchObject({ method: "POST", url: "https://givezy.example/api/app/delete-account", token: "tok", body: { confirm: "delete" } });
  });

  it("a refusal says what was and was not deleted", async () => {
    const o = await requestDeletion(site, "tok", "DELETE", false, sender({ status: 502, json: { ok: false, code: "cancel_failed" } }).send);
    expect(o).toMatchObject({ kind: "refused", code: "cancel_failed" });
    expect(o.kind === "refused" && o.message).toMatch(/deleted nothing/);
  });

  it("an answer that is too old a sign-in goes to the fresh code step", async () => {
    expect((await requestDeletion(site, "tok", "DELETE", false, sender({ status: 401, json: { ok: false, code: "sign_in_again" } }).send)).kind).toBe("sign_in_again");
  });

  it("no answer keeps what was typed (nothing is cleared here) and says nothing was deleted that we know of", async () => {
    const o = await requestDeletion(site, "tok", "DELETE", false, sender(new Error("timeout")).send);
    expect(o.kind).toBe("no_answer");
    expect(o.kind === "no_answer" && o.message).toMatch(/still here/);
  });

  it("after an unanswered try, a dead sign-in means the account may already be gone", async () => {
    const o = await requestDeletion(site, "tok", "DELETE", true, sender({ status: 401, json: { ok: false, message: "Please sign in again." } }).send);
    expect(o.kind).toBe("maybe_done");
  });
});

describe("the button", () => {
  it("is ready only for DELETE or the person's own email, and never while it is running", () => {
    expect(deleteReady("DELETE", "a@example.com", false)).toBe(true);
    expect(deleteReady("a@example.com", "a@example.com", false)).toBe(true);
    expect(deleteReady("delete", "a@example.com", true)).toBe(false);
    expect(deleteReady("", "a@example.com", false)).toBe(false);
    expect(deleteReady("nope", null, false)).toBe(false);
    expect(deleteReady("", null, false)).toBe(false);
  });
});

describe("what the phone forgets", () => {
  it("only this person's own copies, never the shared slot or someone else's", () => {
    const keys = phoneKeysFor("user-1");
    expect(keys.length).toBeGreaterThan(4);
    for (const k of keys) {
      expect(k).toMatch(/^nediv-lev\..+\.u\.user-1$/);
      expect(k).not.toContain("user-2");
    }
    expect(keys).toContain("nediv-lev.giving-goals.u.user-1");
    expect(keys).toContain("nediv-lev.income-log.u.user-1");
  });
});
