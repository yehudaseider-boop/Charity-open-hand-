/** Sign-out only from our own pages (security review 18/11/2026): another site can't sign someone out. */
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let signedOut = 0;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { signOut: async () => void signedOut++ } }) }));

process.env.SITE_URL = "https://givezy.test";
const { POST } = await import("@/app/auth/signout/route");
const post = (headers: Record<string, string>) =>
  POST(new NextRequest("https://givezy.test/auth/signout", { method: "POST", headers: { host: "givezy.test", ...headers } }));

describe("sign out", () => {
  it("works from our own page", async () => {
    const before = signedOut;
    const res = await post({ origin: "https://givezy.test" });
    expect(res.status).toBe(303);
    expect(signedOut).toBe(before + 1);
  });

  it("is ignored from another site (back to the home page, still signed in), or with no sign of where it came from", async () => {
    const before = signedOut;
    for (const h of [{ origin: "https://evil.example" }, { "sec-fetch-site": "cross-site" }, {}] as Record<string, string>[]) {
      expect((await post(h)).status).toBe(303);
    }
    expect(signedOut).toBe(before);
  });
});
