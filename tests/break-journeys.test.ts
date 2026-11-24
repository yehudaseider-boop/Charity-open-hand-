/**
 * "Try to break it" pass of 24/11/2026 on giving, sign-in and the s18A details: what a real person can paste or meet,
 * as pure rules. Each case failed before its fix.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { cleanSignInCode } from "@/lib/sign-in-code";
import { isValidSaIdNumber, saIdDigits, saIdProblem } from "@/lib/sa-id";
import { supabaseRefusal } from "@/lib/sign-in";
import { checkS18aCompletion } from "@/lib/donations/s18a-details";
import { parseDedication } from "@/lib/donations/dedication";
import { toCheckoutInput } from "@/lib/donations/app-api";
import { checkDonorDetails } from "@/lib/donations/validation";
import { checkReady, isNetworkError, newCardNoReplyMessage, noReplyMessage, recordAgreement, requestNewCardPage, SERVER_BUSY, signInWithCode, type ReviewerAnswer } from "../apps/mobile/src/lib/pay-api";

/** A valid test ID: date + sequence + citizenship + 8 + Luhn digit (as in sa-id.test.ts). */
function makeId(first12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    let d = Number(first12[11 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return first12 + ((10 - (sum % 10)) % 10);
}
const ID = makeId("800101500908");

describe("a sign-in code pasted from an email or a message", () => {
  it("is read through hidden marks, full-width digits and any dash", () => {
    expect(cleanSignInCode("​12345678")).toBe("12345678");
    expect(cleanSignInCode("⁨ 1234 5678⁩")).toBe("12345678");
    expect(cleanSignInCode("１２３４５６７８")).toBe("12345678");
    expect(cleanSignInCode("1234–5678")).toBe("12345678");
  });
  it("still needs 6 to 10 digits and nothing else", () => {
    expect(cleanSignInCode("1234567a")).toBeNull();
    expect(cleanSignInCode("​")).toBeNull();
    expect(cleanSignInCode("12345678901")).toBeNull();
  });
});

describe("an SA ID number pasted with a hidden mark", () => {
  it("is the same number, and passes", () => {
    expect(ID).toHaveLength(13);
    expect(isValidSaIdNumber(ID)).toBe(true);
    for (const pasted of [`‎${ID}`, `${ID}​`, `⁦${ID.slice(0, 6)} ${ID.slice(6)}⁩`, ID.replace(/\d/g, (d) => String.fromCharCode(0xff10 + Number(d)))]) {
      expect(saIdDigits(pasted)).toBe(ID);
      expect(saIdProblem(pasted)).toBeNull();
    }
  });
  it("is kept without the mark at checkout", () => {
    const r = toCheckoutInput({ donor_type: "individual", email: "a@b.co", first_name: "Thandi", last_name: "Mokoena", wants_18a: true, id_number: `‎${ID}`, address_line1: "1 Main Road", city: "Johannesburg", postal_code: "2196", age_confirmed: true, popia_consent: true });
    expect(r.ok && r.input.id_number).toBe(ID);
    expect(r.ok && checkDonorDetails(r.input, true)).toEqual({});
  });
  it("a box holding only a hidden mark counts as empty on 'Add my s18A details' when the ID is already on file", () => {
    const r = checkS18aCompletion({ id_number: "​", address_line1: "1 Main Road", city: "Johannesburg", postal_code: "2196" }, "individual", new Date(), ["address"]);
    expect(r.ok).toBe(true);
  });
  it("letters are still letters", () => {
    expect(saIdProblem(`${ID.slice(0, 12)}O`)).toMatch(/digits only/);
  });
});

describe("a dedication name with no letters", () => {
  it("is refused in plain words, as the donor's own name is", () => {
    expect(parseDedication("memory", "---")).toEqual({ error: "Enter their name in letters" });
    expect(parseDedication("honour", "😀😀")).toEqual({ error: "Enter their name in letters" });
  });
  it("a name in any script is fine", () => {
    expect(parseDedication("memory", "محمد")).toEqual({ kind: "memory", name: "محمد" });
    expect(parseDedication("honour", "Zoë O'Brien")).toEqual({ kind: "honour", name: "Zoë O'Brien" });
  });
});

describe("Supabase's refusals, read by status and code", () => {
  it("busy, down, an address it won't send to, or a plain wrong code", () => {
    expect(supabaseRefusal({ status: 429 })).toBe("busy");
    expect(supabaseRefusal({ status: 503 })).toBe("down");
    expect(supabaseRefusal({ name: "AuthRetryableFetchError", status: 0 })).toBe("down");
    expect(supabaseRefusal({ status: 400, code: "email_address_invalid" })).toBe("address");
    expect(supabaseRefusal({ status: 403, code: "otp_expired" })).toBeNull();
    expect(supabaseRefusal({ status: 400, code: "email_address_not_authorized" })).toBeNull();
    expect(supabaseRefusal(null)).toBeNull();
  });
});

describe("the app's sign-in when Supabase is busy or down", () => {
  const run = (error: { name?: string; status?: number }) => {
    const asked: string[] = [];
    return signInWithCode({
      verifyCode: async () => ({ error }),
      isNetworkError,
      offline: "offline",
      reviewer: async (): Promise<ReviewerAnswer> => (asked.push("reviewer"), null),
      verifyToken: async () => ({ error: null }),
    }).then((r) => ({ r, asked }));
  };
  it("says it couldn't check the code, never that the code didn't work", async () => {
    const busy = await run({ name: "AuthApiError", status: 429 });
    expect(busy.r).toEqual({ ok: false, message: expect.stringMatching(/couldn't check yours/) });
    const down = await run({ name: "AuthApiError", status: 500 });
    expect(down.r).toEqual({ ok: false, message: expect.stringMatching(/Nothing is wrong with it/) });
    // What @supabase/auth-js really throws for a 500 to 504 answer: AuthRetryableFetchError carrying the status.
    const outage = await run({ name: "AuthRetryableFetchError", status: 503 });
    expect(outage.r).toEqual({ ok: false, message: expect.stringMatching(/Nothing is wrong with it/) });
    expect([...busy.asked, ...down.asked, ...outage.asked]).toEqual([]);
  });
  it("an answer Supabase wouldn't give (no status) says sign-in is down, not \"check your connection\" (review 24/11/2026)", async () => {
    const odd = await run({ name: "AuthUnknownError" });
    expect(odd.r).toEqual({ ok: false, message: expect.stringMatching(/Nothing is wrong with it/) });
    expect(odd.asked).toEqual([]);
    expect((await run({ name: "AuthRetryableFetchError", status: 0 })).r).toEqual({ ok: false, message: "offline" });
  });
  it("only no answer at all (status 0) is the phone's connection", () => {
    expect(isNetworkError({ name: "AuthRetryableFetchError", status: 0 })).toBe(true);
    expect(isNetworkError({ name: "AuthUnknownError" })).toBe(false);
    expect(isNetworkError({ name: "AuthRetryableFetchError", status: 503 })).toBe(false);
    expect(isNetworkError({ name: "AuthApiError", status: 429 })).toBe(false);
  });
  it("a wrong code still reads as a wrong code", async () => {
    expect((await run({ name: "AuthApiError", status: 403 })).r).toEqual({ ok: false, message: expect.stringMatching(/didn't work/) });
  });
});

describe("the app when our server answers with an outage page", () => {
  const site = "https://test.givezy.co.za";
  const outage = (status: number) => async () => ({ status, json: null });
  it("says Givezy isn't answering, not 'check your connection'", async () => {
    expect(await checkReady(site, "demo", undefined, outage(503))).toEqual({ ok: false, message: SERVER_BUSY });
    expect(await checkReady(site, "demo", undefined, async () => ({ status: 500, json: { ok: false, message: "boom" } }))).toEqual({ ok: false, message: SERVER_BUSY });
    expect(await requestNewCardPage(site, "r1", "t", outage(504))).toEqual({ ok: false, message: SERVER_BUSY });
    expect(await recordAgreement(site, "t", "v1", outage(429))).toEqual({ ok: false, message: SERVER_BUSY });
  });
  it("no answer at all is still the phone's connection", async () => {
    const offline = async () => Promise.reject(new Error("Network request failed"));
    expect(await checkReady(site, "demo", undefined, offline)).toEqual({ ok: false, message: expect.stringMatching(/check your connection/) });
    expect(noReplyMessage(null)).toMatch(/check your connection/);
    expect(noReplyMessage(502)).toBe(SERVER_BUSY);
  });
  it("a new-card gift says our server is busy, and that nothing was charged", () => {
    expect(newCardNoReplyMessage(SERVER_BUSY)).toBe(`${SERVER_BUSY} Nothing was charged, and your details are still here.`);
    expect(newCardNoReplyMessage(noReplyMessage(null))).toMatch(/nothing was charged.*Check your connection/);
  });
});
