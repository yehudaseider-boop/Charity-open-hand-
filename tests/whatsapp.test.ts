import { describe, expect, it } from "vitest";
import { waNumber, whatsAppChat, whatsAppShare } from "@/lib/whatsapp";

describe("whatsapp links", () => {
  it("reads South African numbers in any common spelling", () => {
    expect(waNumber("078 616 0489")).toBe("27786160489");
    expect(waNumber("+27 78 616 0489")).toBe("27786160489");
    expect(waNumber("0786160489")).toBe("27786160489");
  });
  it("refuses anything that isn't a full number", () => {
    expect(waNumber("078 616")).toBeNull();
    expect(waNumber("")).toBeNull();
    expect(waNumber(null)).toBeNull();
    expect(whatsAppChat("12")).toBeNull();
  });
  it("builds chat and share links with the message encoded", () => {
    expect(whatsAppChat("078 616 0489")).toBe("https://wa.me/27786160489");
    expect(whatsAppChat("078 616 0489", "Hi & hello")).toBe("https://wa.me/27786160489?text=Hi%20%26%20hello");
    expect(whatsAppShare("a b")).toBe("https://wa.me/?text=a%20b");
  });
});

describe("waNumber, more ways of writing the same number (review 19/11/2026)", () => {
  it("reads +27 (0)78, 0027 78 and dashes as the same number", async () => {
    const { waNumber } = await import("@/lib/whatsapp");
    for (const n of ["+27 (0)78 616 0489", "0027 78 616 0489", "+27 78-616-0489", "078 616 0489", "27786160489"]) expect(waNumber(n), n).toBe("27786160489");
  });
  it("still refuses what isn't a South African mobile-length number", async () => {
    const { waNumber } = await import("@/lib/whatsapp");
    for (const n of ["", "12345", "+44 20 7946 0958", "0027 78 616 048"]) expect(waNumber(n), n).toBeNull();
  });
});
