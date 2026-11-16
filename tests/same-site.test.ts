/** Where a download or the SARS file request came from (src/lib/same-site.ts). */
import { describe, expect, it } from "vitest";
import { crossSiteRequest, fromThisSite } from "@/lib/same-site";

const h = (headers: Record<string, string>) => new Headers({ host: "givezy.co.za", ...headers });

describe("crossSiteRequest (downloads)", () => {
  it("lets a click on our own page, a bookmark and an older browser through", () => {
    expect(crossSiteRequest(h({ "sec-fetch-site": "same-origin" }))).toBe(false);
    expect(crossSiteRequest(h({ "sec-fetch-site": "same-site" }))).toBe(false);
    expect(crossSiteRequest(h({ "sec-fetch-site": "none" }))).toBe(false);
    expect(crossSiteRequest(h({}))).toBe(false);
    expect(crossSiteRequest(h({ origin: "https://givezy.co.za" }))).toBe(false);
  });

  it("refuses a request another site started", () => {
    expect(crossSiteRequest(h({ "sec-fetch-site": "cross-site" }))).toBe(true);
    expect(crossSiteRequest(h({ origin: "https://evil.example" }))).toBe(true);
    expect(crossSiteRequest(h({ origin: "null" }))).toBe(true);
  });
});

describe("fromThisSite (the SARS file, strict)", () => {
  it("needs this site's Origin, or same-origin when there is no Origin", () => {
    expect(fromThisSite(h({ origin: "https://givezy.co.za" }))).toBe(true);
    expect(fromThisSite(h({ "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(fromThisSite(h({}))).toBe(false);
    expect(fromThisSite(h({ origin: "https://evil.example" }))).toBe(false);
  });
});
