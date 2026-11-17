import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// The home page preview became the home page (17/11/2026). Its old address goes to the home page, and the home page
// uses the site's own header, so Account, Charity dashboard and Givezy admin show on it like everywhere else.
describe("home page", () => {
  it("the old preview address moves to the home page", () => {
    const src = readFileSync("src/app/home-preview/page.tsx", "utf8");
    expect(src).toMatch(/redirect\("\/"\)/);
  });
  it("uses the site's own header and is indexable", () => {
    const src = readFileSync("src/app/page.tsx", "utf8");
    expect(src).toMatch(/<HeaderNav tone="dark" \/>/);
    expect(src).not.toMatch(/robots:/);
    expect(src).toMatch(/organisationData/);
  });
});
