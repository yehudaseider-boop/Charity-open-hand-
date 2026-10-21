import "server-only";
import sharp from "sharp";

/**
 * Re-encodes an uploaded photo so it carries no hidden details: phone photos often hold the GPS
 * position where they were taken, which could locate the families a charity helps. The picture is
 * first turned the right way up (from its orientation tag), then saved again without any metadata.
 * Same format out as in (JPG, PNG or WebP), already checked by the caller.
 *
 * A small file can describe a huge picture (a 5 MB PNG can decode to a gigabyte), so decoding stops
 * at 30 million pixels, and nothing larger than 2 400 px on a side is stored.
 */
export const MAX_IMAGE_PIXELS = 30_000_000;
export const MAX_IMAGE_SIDE = 2_400;

export async function cleanImage(file: File): Promise<Blob> {
  const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: MAX_IMAGE_PIXELS })
    .rotate()
    .resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: "inside", withoutEnlargement: true });
  const out =
    file.type === "image/png" ? await image.png().toBuffer()
    : file.type === "image/webp" ? await image.webp({ quality: 88 }).toBuffer()
    : await image.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  return new Blob([new Uint8Array(out)], { type: file.type });
}
