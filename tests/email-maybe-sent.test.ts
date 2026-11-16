/**
 * Which failed sends may have gone (review 12/11/2026). Only the transport decides, and only around the call to the
 * email service: a dropped connection or a time limit there "may have gone" (never resent by itself); the service
 * saying no, or a time limit already past before anything left, is sure not to have gone (tried again).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { resendTransport, EmailError, EmailMaybeSent } = await import("@/lib/email");
const { wasCutOff } = await import("@/lib/email/retry-plan");
const { retryRowSettled } = await import("@/lib/email/retry");

const transport = resendTransport({ RESEND_API_KEY: "re_test", EMAIL_FROM: "Givezy <hello@givezy.co.za>" });
const mail = { to: "dana@example.com", subject: "Thank you", text: "Thank you." };
const thrown = async (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

afterEach(() => vi.unstubAllGlobals());

describe("the email transport", () => {
  it("a dropped connection during the send may have gone", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    const e = await thrown(transport.send(mail));
    expect(e).toBeInstanceOf(EmailMaybeSent);
    expect(wasCutOff(e)).toBe(true);
  });

  it("a time limit firing during the send may have gone", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }))));
    expect(wasCutOff(await thrown(transport.send({ ...mail, signal: new AbortController().signal })))).toBe(true);
  });

  it("the email service saying no is sure not to have gone", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 422 })));
    const e = await thrown(transport.send(mail));
    expect(e).toBeInstanceOf(EmailError);
    expect(wasCutOff(e)).toBe(false);
  });

  it("a time limit already past before anything left is sure not to have gone", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const c = new AbortController();
    c.abort();
    const e = await thrown(transport.send({ ...mail, signal: c.signal }));
    expect(fetch).not.toHaveBeenCalled();
    expect(wasCutOff(e)).toBe(false);
  });
});

describe("an email already dealt with through the retry list", () => {
  const now = new Date("2026-11-12T08:00:00Z");
  it("is settled once sent, closed, possibly sent, or skipped on purpose", () => {
    for (const status of ["sent", "gone", "unknown", "skipped"]) expect(retryRowSettled({ status, claimed_at: null }, now)).toBe(true);
  });
  it("is settled while a run is sending it, but not once that claim is old", () => {
    expect(retryRowSettled({ status: "waiting", claimed_at: "2026-11-12T07:55:00Z" }, now)).toBe(true);
    expect(retryRowSettled({ status: "waiting", claimed_at: "2026-11-12T07:00:00Z" }, now)).toBe(false);
  });
  it("is not settled while still waiting, or after the tries gave up", () => {
    expect(retryRowSettled({ status: "waiting", claimed_at: null }, now)).toBe(false);
    expect(retryRowSettled({ status: "gave_up", claimed_at: null }, now)).toBe(false);
  });
});
