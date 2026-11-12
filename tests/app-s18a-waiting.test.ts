// The phone app's "Counts towards your s18A receipts" leaves out gifts still waiting for their s18A details, as the
// website's account page does (12/11/2026): the pure rule, the app's call, and the route's checks.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitingForS18aDetails } from "@/lib/donations/s18a-details";
import { requestS18aWaiting } from "../apps/mobile/src/lib/pay-api";

const auth = vi.hoisted(() => ({ who: null as null | { userId: string; email: string }, limited: false, waiting: [] as string[], fail: false }));
vi.mock("@/lib/app-auth", () => ({ appAccount: async () => auth.who }));
vi.mock("@/lib/rate-limit", () => ({ hitRateLimit: async () => auth.limited }));
vi.mock("@/lib/donations/s18a-complete", () => ({
  giftsWaitingForS18aDetails: async () => {
    if (auth.fail) throw new Error("db down");
    return auth.waiting;
  },
}));

const complete = { donor_type: "individual", id_number_encrypted: "enc", tax_reference_encrypted: null, registration_number: null, address_line1: "1 Main Road", erased_at: null };

describe("which gifts are waiting for their s18A details", () => {
  const gift = { id: "g1", wants_18a: true, status: "paid" };
  it("waits while the ID number or address is still to come", () => {
    expect(waitingForS18aDetails(gift, { ...complete, id_number_encrypted: null }, new Set())).toBe(true);
    expect(waitingForS18aDetails(gift, { ...complete, address_line1: " " }, new Set())).toBe(true);
    expect(waitingForS18aDetails(gift, { ...complete, donor_type: "company", registration_number: null }, new Set())).toBe(true);
  });
  it("waits when there are no details at all, or they were erased", () => {
    expect(waitingForS18aDetails(gift, null, new Set())).toBe(true);
    expect(waitingForS18aDetails(gift, { ...complete, erased_at: "2026-11-01" }, new Set())).toBe(true);
  });
  it("doesn't wait once the details are complete, a tax number stands in for the ID, or it's on an issued receipt", () => {
    expect(waitingForS18aDetails(gift, complete, new Set())).toBe(false);
    expect(waitingForS18aDetails(gift, { ...complete, id_number_encrypted: null, tax_reference_encrypted: "enc" }, new Set())).toBe(false);
    expect(waitingForS18aDetails(gift, null, new Set(["g1"]))).toBe(false);
  });
  it("never counts a gift that didn't ask for a receipt or isn't paid", () => {
    expect(waitingForS18aDetails({ ...gift, wants_18a: false }, null, new Set())).toBe(false);
    expect(waitingForS18aDetails({ ...gift, status: "pending" }, null, new Set())).toBe(false);
  });
});

describe("the app asking which gifts are waiting", () => {
  it("posts with the sign-in token and returns the ids", async () => {
    const seen: { url: string; token?: string | null }[] = [];
    const ids = await requestS18aWaiting("https://x.test/", "tok", async (url, _body, token) => {
      seen.push({ url, token });
      return { status: 200, json: { ok: true, waiting: ["a", "b"] } };
    });
    expect([...(ids ?? [])]).toEqual(["a", "b"]);
    expect(seen[0]).toEqual({ url: "https://x.test/api/app/s18a-waiting", token: "tok" });
  });
  it("gives no answer when offline, refused or garbled, so the phone's own list stands in", async () => {
    expect(await requestS18aWaiting("https://x.test", "tok", async () => { throw new Error("offline"); })).toBeNull();
    expect(await requestS18aWaiting("https://x.test", "tok", async () => ({ status: 401, json: { ok: false } }))).toBeNull();
    expect(await requestS18aWaiting("https://x.test", "tok", async () => ({ status: 200, json: { ok: true, waiting: [1] } }))).toBeNull();
  });
  it("never sends the token over plain http", async () => {
    await expect(requestS18aWaiting("http://x.test", "tok", async () => ({ status: 200, json: { ok: true, waiting: [] } }))).rejects.toThrow(/https/);
  });
});

describe("the s18a-waiting route", () => {
  beforeEach(() => {
    auth.who = { userId: "u1", email: "a@b.co" };
    auth.limited = false;
    auth.waiting = ["g1"];
    auth.fail = false;
  });
  const call = async () => {
    const { POST } = await import("@/app/api/app/s18a-waiting/route");
    const res = await POST(new Request("https://x.test/api/app/s18a-waiting", { method: "POST" }) as never);
    return { status: res.status, body: await res.json() };
  };
  it("answers a signed-in donor with their waiting gift ids", async () => {
    expect(await call()).toEqual({ status: 200, body: { ok: true, waiting: ["g1"] } });
  });
  it("refuses without a live sign-in, and when rate limited", async () => {
    auth.who = null;
    expect((await call()).status).toBe(401);
    auth.who = { userId: "u1", email: "a@b.co" };
    auth.limited = true;
    expect((await call()).status).toBe(429);
  });
  it("says so plainly when the database can't be read", async () => {
    auth.fail = true;
    const r = await call();
    expect(r.status).toBe(503);
    expect(r.body.ok).toBe(false);
  });
});
