/** The sign-in landing page: a link's code, or a one-time sign-in by its hashed form (the end-to-end robot, 18/11/2026). */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const calls: string[] = [];
let fail = false;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: async () => (calls.push("code"), { error: fail ? { message: "bad" } : null }),
      verifyOtp: async (a: { token_hash: string; type: string }) => (calls.push(`hash:${a.type}`), { error: fail ? { message: "used" } : null }),
      getUser: async () => ({ data: { user: { id: "u1", email: "e@example.co.za" } } }),
    },
  }),
}));
vi.mock("@/lib/donors/link", () => ({ linkDonorsToUser: async () => undefined }));

process.env.SITE_URL = "https://givezy.test";
const { GET } = await import("@/app/auth/callback/route");
const get = (q: string) => GET(new NextRequest(`https://givezy.test/auth/callback?${q}`, { headers: { host: "givezy.test" } }));
const where = (r: Response) => new URL(r.headers.get("location") ?? "").pathname;

beforeEach(() => {
  calls.length = 0;
  fail = false;
});

describe("the sign-in landing page", () => {
  it("signs in with a one-time sign-in's hashed form, and goes to the page asked for", async () => {
    const r = await get("token_hash=" + "ab12".repeat(14) + "&type=email&next=/account");
    expect(calls).toEqual(["hash:email"]);
    expect(where(r)).toBe("/account");
  });

  it("sends a used or wrong one back to sign-in", async () => {
    fail = true;
    expect(where(await get("token_hash=" + "ab12".repeat(14) + "&type=email"))).toBe("/login");
  });

  it("ignores a hashed form with an odd type or odd characters (never asks Supabase)", async () => {
    for (const q of ["token_hash=" + "ab12".repeat(14) + "&type=recovery", "token_hash=" + "ab12".repeat(14), "token_hash=not-hex!&type=email"]) {
      expect(where(await get(q))).toBe("/login");
    }
    expect(calls).toEqual([]);
  });

  it("still signs in with a link's code, and never sends anyone off our site", async () => {
    const r = await get("code=abc&next=https://evil.example/");
    expect(calls).toEqual(["code"]);
    expect(new URL(r.headers.get("location") ?? "").origin).toBe("https://givezy.test");
  });
});
