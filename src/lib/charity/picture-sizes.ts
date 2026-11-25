/**
 * Charity pictures in smaller copies, made once at upload ("Resize at upload", Yehuda, 25/11/2026). Shared with the
 * phone app (`@shared/charity/picture-sizes`), so it stays dependency-free.
 *
 * When a charity uploads a logo, cover photo, update photo or gallery photo, the server keeps the cleaned picture
 * (the "original") and makes lighter WebP copies at a few widths, all in the same public folder:
 *
 *   <charity>/cover-<uuid>.2400x1800.jpg            the original; its name says its own width and height
 *   <charity>/cover-<uuid>.2400x1800.w640.webp      a copy 640 px wide
 *   <charity>/cover-<uuid>.2400x1800.w1280.webp     ...
 *
 * The width and height in the name are how a page or the app knows the copies exist: a picture uploaded before
 * this change has no size in its name and no copies, and is shown as it is stored, exactly as before. A copy is only
 * made narrower than the original (never enlarged); for anything wider the original itself is used.
 *
 * Widths are chosen from where each picture is shown, so a phone gets at least three pixels per screen point and a
 * laptop at least two ("everything ultra HD"): see docs/decisions.md, 25/11/2026.
 */

/** Logos are shown small (64 to 128 points): 128, 256, 512. Photos fill a card or the page width: 640, 1280, 1920. */
export const PICTURE_WIDTHS = { logo: [128, 256, 512], photo: [640, 1280, 1920] } as const;
export type PictureKind = keyof typeof PICTURE_WIDTHS;

/** WebP, as the website's other pictures: about a third of a JPG's size at the same look, and it keeps a logo's see-through parts. */
export const COPY_EXTENSION = "webp";

/** A logo's file name starts "logo-"; covers, update photos and gallery photos are all photos. */
export function pictureKind(path: string): PictureKind {
  return /(^|\/)logo-[^/]*$/.test(path) ? "logo" : "photo";
}

const ORIGINAL = /^(.*)\.([1-9]\d{0,4})x([1-9]\d{0,4})\.(jpg|png|webp)$/;

/** The stored original's name with its size in it: `a/cover-1.jpg` -> `a/cover-1.2400x1800.jpg`. */
export function withSize(path: string, width: number, height: number): string {
  const dot = path.lastIndexOf(".");
  if (dot <= path.lastIndexOf("/")) throw new Error("A picture's name needs its extension");
  return `${path.slice(0, dot)}.${Math.round(width)}x${Math.round(height)}${path.slice(dot)}`;
}

/** The original's width and height, from its name; null for a picture uploaded before copies were made. */
export function pictureSize(path: string): { width: number; height: number } | null {
  const m = ORIGINAL.exec(path);
  return m ? { width: Number(m[2]), height: Number(m[3]) } : null;
}

/** Where the copy of this width lives (next to the original). */
export function copyPath(path: string, width: number): string {
  return `${path.slice(0, path.lastIndexOf("."))}.w${width}.${COPY_EXTENSION}`;
}

/** The widths this picture has copies at: every width of its kind narrower than the original. None for an old picture. */
export function copyWidths(path: string): number[] {
  const size = pictureSize(path);
  if (!size) return [];
  return PICTURE_WIDTHS[pictureKind(path)].filter((w) => w < size.width);
}

/**
 * Every file that belongs to this picture: the original, each copy its name allows, and the full-size file it may
 * have had before it was given copies (the one-off run, scripts/make-picture-copies.ts, keeps that file for a day:
 * `a.2400x1800.jpg` was `a.jpg`). Used to remove a picture whole, so no copy of a picture the charity removed stays
 * reachable. Removing a file that isn't there is harmless.
 */
export function pictureFiles(path: string): string[] {
  const m = ORIGINAL.exec(path);
  if (!m) return [path];
  return [path, ...PICTURE_WIDTHS[pictureKind(path)].map((w) => copyPath(path, w)), `${m[1]}.${m[4]}`];
}

/** What a page or the app can choose from, narrowest first: the copies, then the original at its own width. */
export function pictureCandidates(path: string): { path: string; width: number }[] {
  const size = pictureSize(path);
  if (!size) return [{ path, width: 0 }];
  return [...copyWidths(path).map((w) => ({ path: copyPath(path, w), width: w })), { path, width: size.width }];
}

/**
 * How many times wider than its box a picture must be drawn when it fills the box and is cut to fit (object-fit:
 * cover): 1 for a picture no wider in shape than the box, more for a wider one (its height then fills the box).
 */
export function coverStretch(size: { width: number; height: number } | null, boxAspect: number): number {
  if (!size || !(boxAspect > 0)) return 1;
  return Math.max(1, size.width / size.height / boxAspect);
}

/**
 * The phone app's choice: the narrowest file that still gives `density` pixels per point in a box of this size
 * (filled and cut to fit), or the original when no copy is wide enough. An old picture always gives the original.
 * Works on a full address too (the size and copy names sit at the end of it).
 */
export function pictureForBox(pathOrUrl: string, boxWidth: number, boxHeight: number, density: number): string {
  const size = pictureSize(pathOrUrl);
  if (!size || !(boxWidth > 0) || !(boxHeight > 0)) return pathOrUrl;
  const needed = boxWidth * coverStretch(size, boxWidth / boxHeight) * Math.max(1, density);
  return pictureCandidates(pathOrUrl).find((c) => c.width >= needed)?.path ?? pathOrUrl;
}

/**
 * Where a picture sits on a website page, for each screen width, widest screens first: `media` is the screen it
 * applies to (none on the last, the phone), `width` how wide the box is (a CSS length: "96px", "50vw",
 * "calc(100vw - 32px)"), `aspect` the box's width over its height, and `laptop` true from 640 px up, which asks for
 * twice the width so even a laptop at normal density gets two pixels per one (a phone's own density already gives three).
 */
export type PictureSlot = { media?: string; width: string; aspect: number; laptop?: boolean };

/** The `sizes` for these slots and this picture (wider pictures in narrower boxes ask for more). */
export function pictureSizes(slots: PictureSlot[], path: string): string {
  const size = pictureSize(path);
  return slots
    .map((s) => {
      const times = coverStretch(size, s.aspect) * (s.laptop ? 2 : 1);
      const px = /^(\d+(?:\.\d+)?)px$/.exec(s.width);
      const width = times === 1 ? s.width : px ? `${Math.ceil(Number(px[1]) * times)}px` : `calc(${s.width.replace(/^calc/, "")} * ${Number(times.toFixed(3))})`;
      return s.media ? `${s.media} ${width}` : width;
    })
    .join(", ");
}

/** The `srcset` for a picture, given how to make a file's address; empty for an old picture (it has only its original). */
export function pictureSrcSet(path: string, url: (path: string) => string): string {
  if (!pictureSize(path)) return "";
  return pictureCandidates(path).map((c) => `${url(c.path)} ${c.width}w`).join(", ");
}
