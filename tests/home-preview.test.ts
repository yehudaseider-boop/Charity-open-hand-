import { describe, expect, it } from "vitest";
import { metadata as one } from "@/app/home-preview/page";
import { metadata as two } from "@/app/home-preview-2/page";

// The home page previews (16/11/2026) are for Yehuda to look at, not for search engines.
describe("home page previews", () => {
  it("are kept out of search results", () => {
    expect(one.robots).toEqual({ index: false, follow: false });
    expect(two.robots).toEqual({ index: false, follow: false });
  });
});
