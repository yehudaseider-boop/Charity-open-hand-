import { describe, expect, it } from "vitest";
import { metadata } from "@/app/home-preview/page";

// The home page preview (16/11/2026) is for Yehuda to look at, not for search engines.
describe("home page preview", () => {
  it("is kept out of search results", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
