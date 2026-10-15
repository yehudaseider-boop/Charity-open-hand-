import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { cleanImage } = await import("@/lib/charity/clean-image");

describe("charity photos are re-encoded without hidden details", () => {
  it("drops the GPS position and other metadata, keeping the format", async () => {
    const withGps = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#1848a8" } })
      .jpeg()
      .withExif({ IFD0: { Make: "PhoneCo" }, IFD3: { GPSLatitudeRef: "S", GPSLatitude: "26/1 9/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "28/1 2/1 0/1" } })
      .toBuffer();
    expect((await sharp(withGps).metadata()).exif).toBeDefined();

    const cleaned = await cleanImage(new File([new Uint8Array(withGps)], "family.jpg", { type: "image/jpeg" }));
    const meta = await sharp(Buffer.from(await cleaned.arrayBuffer())).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.format).toBe("jpeg");
    expect(cleaned.type).toBe("image/jpeg");
    expect([meta.width, meta.height]).toEqual([40, 30]);
  });
});
