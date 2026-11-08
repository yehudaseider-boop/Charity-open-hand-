/**
 * The IT3(d) file download is a POST from the SARS page. It only works from this site: a request from another
 * site, or one that says nothing about where it came from, is refused before anyone is checked or anything built.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
let authorised = 0;
vi.mock("@/lib/charity/export", () => ({ audit: async () => undefined }));
vi.mock("@/lib/receipts/it3d-request", () => ({
  authoriseIt3d: async () => {
    authorised++;
    return { status: 401, message: "You're signed out." };
  },
  prepareIt3d: async () => {
    throw new Error("not reached");
  },
  readChoice: () => null,
}));

const { POST } = await import("@/app/charity-admin/[id]/receipts/sars/file/route");
const ID = "0b9d3c1e-5a7f-4e2b-8c6d-1f2e3a4b5c6d";
const post = (headers: Record<string, string>) =>
  POST(new Request(`https://givezy.test/charity-admin/${ID}/receipts/sars/file`, { method: "POST", headers: { host: "givezy.test", ...headers } }) as never, {
    params: Promise.resolve({ id: ID }),
  } as never);

beforeEach(() => {
  authorised = 0;
});

describe("the IT3(d) file download", () => {
  it("refuses a POST from another site", async () => {
    const r = await post({ origin: "https://evil.test" });
    expect(r.status).toBe(403);
    expect(await r.text()).toMatch(/only works from the SARS page on Givezy\. Nothing was downloaded\./);
    expect(authorised).toBe(0);
  });

  it("refuses a POST with no Origin and no same-origin Sec-Fetch-Site, with the same 403", async () => {
    for (const headers of [{} as Record<string, string>, { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" }, { "sec-fetch-site": "none" }, { origin: "null" }]) {
      const r = await post(headers);
      expect(r.status).toBe(403);
      expect(await r.text()).toMatch(/only works from the SARS page on Givezy/);
    }
    expect(authorised).toBe(0);
  });

  it("goes on to check the person for a POST from this site", async () => {
    expect((await post({ origin: "https://givezy.test" })).status).toBe(401);
    expect((await post({ "sec-fetch-site": "same-origin" })).status).toBe(401);
    expect(authorised).toBe(2);
  });
});
