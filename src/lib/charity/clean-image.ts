import "server-only";
import sharp from "sharp";

/**
 * Re-encodes an uploaded photo so it carries no hidden details: phone photos often hold the GPS
 * position where they were taken, which could locate the families a charity helps. The picture is
 * first turned the right way up (from its orientation tag), then saved again without any metadata.
 * Same format out as in (JPG, PNG or WebP), already checked by the caller.
 */
export async function cleanImage(file: File): Promise<Blob> {
  const image = sharp(Buffer.from(await file.arrayBuffer())).rotate();
  const out =
    file.type === "image/png" ? await image.png().toBuffer()
    : file.type === "image/webp" ? await image.webp({ quality: 88 }).toBuffer()
    : await image.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  return new Blob([new Uint8Array(out)], { type: file.type });
}
