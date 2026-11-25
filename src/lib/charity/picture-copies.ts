import "server-only";
import sharp from "sharp";
import { cleanImageBytes, MAX_IMAGE_PIXELS } from "./clean-image";
import { copyPath, copyWidths, pictureFiles, pictureKind, withSize } from "./picture-sizes";

/**
 * "Resize at upload" (Yehuda, 25/11/2026): a charity's picture is cleaned once (no GPS or other hidden details, the
 * right way up, at most 2 400 px; clean-image.ts, as journey email pictures are), and lighter WebP copies are made
 * from the cleaned picture at the widths in picture-sizes.ts, never wider than it. Everything goes in the same public
 * folder. Vercel's image service is not used for this (it is billed per use and stays off: CHARITY_IMAGE_SERVICE).
 */

/** Photos at 86 (sharp at three pixels per point, a fraction of the file); logos at 90 with their see-through parts kept exactly. */
const WEBP = {
  photo: { quality: 86, effort: 5 },
  logo: { quality: 90, alphaQuality: 100, smartSubsample: true, effort: 5 },
} as const;

/** The copies a cleaned original gets, given its stored name (with its size in it). */
export async function makeCopies(original: Buffer, path: string): Promise<{ path: string; width: number; bytes: Buffer }[]> {
  const kind = pictureKind(path);
  return Promise.all(
    copyWidths(path).map(async (width) => ({
      path: copyPath(path, width),
      width,
      bytes: await sharp(original, { limitInputPixels: MAX_IMAGE_PIXELS }).resize({ width, withoutEnlargement: true }).webp(WEBP[kind]).toBuffer(),
    })),
  );
}

/**
 * Clean an uploaded picture and make its copies. `basePath` is where it would go without copies
 * (`<charity>/cover-<uuid>.jpg`); the stored name adds the cleaned picture's width and height.
 */
export async function preparePicture(bytes: Buffer, type: string, basePath: string) {
  const original = await cleanImageBytes(bytes, type);
  const { width, height } = await sharp(original).metadata();
  if (!width || !height) throw new Error("The picture has no size");
  const path = withSize(basePath, width, height);
  return { path, original, copies: await makeCopies(original, path) };
}

/** The part of a storage bucket this needs (Supabase's `storage.from(bucket)`). */
export type PictureBucket = {
  upload(path: string, body: Blob, options: { contentType: string }): Promise<{ error: unknown }>;
  remove(paths: string[]): Promise<{ error: unknown }>;
};

/**
 * Store an uploaded picture with its copies. The copies go up first: a page only asks for them once the original,
 * whose name announces them, is there. If a copy can't be stored, the copies already up are removed and the picture
 * is stored as before (no size in its name), so it still shows everywhere, only full size. If the original can't be
 * stored, nothing is left behind. Never throws: a picture that can't be read is an error like any other.
 */
export async function storePicture(bucket: PictureBucket, basePath: string, file: File): Promise<{ path: string; error?: undefined } | { error: unknown; path?: undefined }> {
  let prepared: Awaited<ReturnType<typeof preparePicture>>;
  try {
    prepared = await preparePicture(Buffer.from(await file.arrayBuffer()), file.type, basePath);
  } catch (error) {
    // A file that starts like a picture but can't be read as one: nothing was stored.
    return { error };
  }
  const blob = (b: Buffer, type: string) => new Blob([new Uint8Array(b)], { type });
  const ups = await Promise.all(prepared.copies.map((c) => bucket.upload(c.path, blob(c.bytes, "image/webp"), { contentType: "image/webp" }).then((r) => ({ path: c.path, error: r.error }))));
  let path = prepared.path;
  if (ups.some((u) => u.error)) {
    console.error("[picture] a copy didn't store; keeping the picture full size only", ups.find((u) => u.error)?.error);
    const stored = ups.filter((u) => !u.error).map((u) => u.path);
    if (stored.length) await bucket.remove(stored);
    path = basePath;
  }
  const up = await bucket.upload(path, blob(prepared.original, file.type), { contentType: file.type });
  if (up.error) {
    if (path !== basePath) await bucket.remove(prepared.copies.map((c) => c.path));
    return { error: up.error };
  }
  return { path };
}

/** Remove a picture whole: the original and every copy of it (an old picture has none). */
export async function removePicture(bucket: Pick<PictureBucket, "remove">, path: string) {
  return bucket.remove(pictureFiles(path));
}
