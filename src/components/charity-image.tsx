import { getImageProps } from "next/image";

/**
 * A charity's own picture (logo, cover, update or gallery photo) from our public storage (24/11/2026). On the live
 * site it goes through Next's image service: the right size for the screen, in a lighter format, at quality 90 so it
 * stays sharp. `sizes` says how wide it is shown: a phone gets the file for its own pixel density (three pixels per
 * one on an iPhone), and from 640 px up `sizes` states double the width it is shown at, so even a laptop at normal
 * density gets two pixels per one (the brand's "everything ultra HD" rule). The width and height are the picture's
 * shape, so nothing moves when it loads.
 *
 * Built with getImageProps and a plain <img>, so no image script is sent to the browser for it.
 *
 * On a developer's machine the storage address is local (http://127.0.0.1), which the image service refuses to fetch
 * for safety, so the picture is shown as it is stored, exactly as before.
 */
export function CharityImage({
  src,
  alt,
  width,
  height,
  sizes,
  className,
  priority = false,
}: {
  src: string;
  alt: string;
  /** The picture's shape (not its size on screen): the real size comes from `sizes` and the screen. */
  width: number;
  height: number;
  /** How wide it is shown, for each screen width: what the browser uses to pick the file. */
  sizes: string;
  className?: string;
  /** The first big picture on the page: fetched first. */
  priority?: boolean;
}) {
  // Vercel's image service is billed by use, so it stays off until Yehuda says yes (CHARITY_IMAGE_SERVICE=yes,
  // 24/11/2026). Off, the picture is shown as it is stored, exactly as before.
  const service = process.env.CHARITY_IMAGE_SERVICE === "yes" && src.startsWith("https://");
  const { props } = getImageProps({ src, alt, width, height, sizes, quality: 90, priority, unoptimized: !service });
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={alt} className={className} />;
}
