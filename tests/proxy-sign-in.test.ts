/**
 * The proxy keeps a session fresh without asking Supabase's sign-in service on every request (24/11/2026). It checks
 * the token's signature itself (getClaims, which also renews a token that is expiring); getUser, the trip of about
 * 170 ms, is left to the pages, which decide access. Public visitors (no sign-in cookie) never create a client.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const calls = { clients: 0, getUser: 0, getClaims: 0 };
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => {
    calls.clients++;
    return {
      auth: {
        getUser: async () => {
          calls.getUser++;
          return { data: { user: null }, error: null };
        },
        getClaims: async () => {
          calls.getClaims++;
          return { data: null, error: null };
        },
      },
    };
  },
}));

const { proxy } = await import("@/proxy");

beforeEach(() => {
  calls.clients = calls.getUser = calls.getClaims = 0;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "pk";
});

describe("the proxy and the sign-in", () => {
  it("checks a signed-in request's token locally and never asks the sign-in service", async () => {
    await proxy(new NextRequest("https://test.givezy.co.za/charity-admin", { headers: { cookie: "sb-abcd-auth-token=base64-x" } }));
    expect(calls.getClaims).toBe(1);
    expect(calls.getUser).toBe(0);
  });

  it("does nothing for a visitor with no sign-in cookie", async () => {
    await proxy(new NextRequest("https://test.givezy.co.za/charities"));
    expect(calls.clients).toBe(0);
  });
});
