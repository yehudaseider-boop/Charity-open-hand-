/**
 * Opening an s18A receipt: one that can't be handed out goes back to a list page that shows the
 * "unavailable" notice. The Referer only picks which of the three list pages; the address always
 * comes from SITE_URL, so a forged header can't send anyone off the site.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
let user: { id: string } | null = { id: "u1" };
let receipt: Record<string, unknown> | null = null;
let amr: { method: string }[] = [{ method: "otp" }];
vi.mock("@/lib/audit", () => ({ logAudit: async () => undefined }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }), getClaims: async () => ({ data: { claims: { amr } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: receipt }) }) }) }),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://files.test/r.pdf" }, error: null }) }) } }),
}));

const { GET } = await import("@/app/receipts/[id]/route");
const ID = "6f1c2a52-3b7e-4d0a-9c41-2f6e8d5b7a10";
const CHARITY = "0b9d3c1e-5a7f-4e2b-8c6d-1f2e3a4b5c6d";
const open = (referer?: string) => {
  const req = new Request(`https://evil.test/receipts/${ID}`, { headers: referer ? { referer } : {} });
  return GET(Object.assign(req, { nextUrl: new URL(req.url) }) as never, { params: Promise.resolve({ id: ID }) } as never);
};
const sentTo = (r: Response) => r.headers.get("location");

beforeEach(() => {
  process.env.SITE_URL = "https://givezy.test";
  user = { id: "u1" };
  receipt = null;
  amr = [{ method: "otp" }];
});
afterEach(() => {
  delete process.env.SITE_URL;
});

describe("an unavailable receipt", () => {
  it("goes back to the account page, on the site's own address, when nothing says where it was opened from", async () => {
    expect(sentTo(await open())).toBe("https://givezy.test/account?receipt=unavailable");
  });

  it("goes back to the admin or charity list the person opened it from", async () => {
    expect(sentTo(await open("https://givezy.test/admin/receipts?status=issued"))).toBe("https://givezy.test/admin/receipts?receipt=unavailable");
    expect(sentTo(await open(`https://givezy.test/charity-admin/${CHARITY}/receipts`))).toBe(`https://givezy.test/charity-admin/${CHARITY}/receipts?receipt=unavailable`);
  });

  it("never follows a Referer to another site or page", async () => {
    expect(sentTo(await open("https://evil.test/admin/receipts"))).toBe("https://givezy.test/admin/receipts?receipt=unavailable");
    expect(sentTo(await open("https://givezy.test/receipts/other"))).toBe("https://givezy.test/account?receipt=unavailable");
    expect(sentTo(await open("https://givezy.test/charity-admin/not-an-id/receipts"))).toBe("https://givezy.test/account?receipt=unavailable");
    expect(sentTo(await open("not a url"))).toBe("https://givezy.test/account?receipt=unavailable");
  });

  it("sends a signed-out person to sign in, on the site's own address", async () => {
    user = null;
    expect(sentTo(await open())).toBe(`https://givezy.test/login?next=${encodeURIComponent(`/receipts/${ID}`)}`);
  });

  it("sends a session started with a password to sign in again, and hands out nothing", async () => {
    receipt = { id: ID, charity_id: CHARITY, status: "issued", pdf_path: "r.pdf" };
    amr = [{ method: "password" }];
    expect(sentTo(await open())).toBe(`https://givezy.test/login?next=${encodeURIComponent(`/receipts/${ID}`)}`);
  });

  it("hands out an issued receipt", async () => {
    receipt = { id: ID, charity_id: CHARITY, status: "issued", pdf_path: "r.pdf" };
    expect(sentTo(await open())).toBe("https://files.test/r.pdf");
  });
});
