import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { charityPageUrl, qrSvg } = await import("@/lib/charity/qr");

describe("charity QR poster", () => {
  it("points at the charity's public Givezy page", () => {
    expect(charityPageUrl("northcliff-meals-fund", "https://givezy.test/")).toBe("https://givezy.test/c/northcliff-meals-fund");
  });
  it("draws a QR code as SVG in the brand's navy", async () => {
    const svg = await qrSvg("https://givezy.test/c/northcliff-meals-fund");
    expect(svg).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);
    expect(svg.toLowerCase()).toContain("#102848");
  });
});
