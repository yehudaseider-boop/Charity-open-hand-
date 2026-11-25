import { getImageProps } from "next/image";
import { publicImageUrl } from "@/lib/charity/queries";
import { pictureSizes, pictureSrcSet, type PictureSlot } from "@/lib/charity/picture-sizes";

/**
 * A charity's own picture (logo, cover, update or gallery photo) from our public storage. Since 25/11/2026 ("Resize
 * at upload", Yehuda) the server makes lighter copies of each picture once, when it is uploaded
 * (src/lib/charity/picture-copies.ts), and this gives the browser the list (`srcset`) with how wide the picture is
 * shown (`sizes`, from `slots`): a phone takes the copy for its own pixel density (three pixels per one on an
 * iPhone), and from 640 px up `slots` ask for double the width, so even a laptop at normal density gets two pixels per
 * one (the brand's "everything ultra HD" rule). A picture uploaded before copies were made is shown as it is stored,
 * exactly as before. The width and height are the box's shape, so nothing moves when it loads.
 *
 * A plain <img>: no image script is sent to the browser for it.
 *
 * Vercel's image service (billed per use) is not the chosen way and stays off: only CHARITY_IMAGE_SERVICE=yes (not
 * set anywhere) would send pictures through it, as before 25/11/2026.
 */
export function CharityImage({
  path,
  alt,
  width,
  height,
  slots,
  className,
  priority = false,
}: {
  /** The picture's stored name in the charity's public folder. */
  path: string;
  alt: string;
  /** The box's shape (not its size on screen): the real size comes from `slots` and the screen. */
  width: number;
  height: number;
  /** Where it is shown, for each screen width: what the browser uses to pick the file. */
  slots: PictureSlot[];
  className?: string;
  /** The first big picture on the page: fetched first. */
  priority?: boolean;
}) {
  const src = publicImageUrl(path)!;
  const sizes = pictureSizes(slots, path);
  if (process.env.CHARITY_IMAGE_SERVICE === "yes" && src.startsWith("https://")) {
    const { props } = getImageProps({ src, alt, width, height, sizes, quality: 90, priority });
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} alt={alt} className={className} />;
  }
  const srcSet = pictureSrcSet(path, (p) => publicImageUrl(p)!);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      srcSet={srcSet || undefined}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      // As next/image drew it before: no alt text flashes while the picture loads.
      style={{ color: "transparent" }}
      className={`picture-soft-fail${className ? ` ${className}` : ""}`}
    />
  );
}
