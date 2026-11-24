/**
 * The picture of the thank-you email on the home page. Phones get a 1056 px wide copy (over three times the width it is
 * shown at, so it stays sharp at iPhone sharpness); everything wider than a phone gets the full 1584 px one (at least
 * twice its width on a laptop). Both have the same shape, and the width and height are given so nothing moves when it
 * loads (24/11/2026). Not run through the image optimiser on purpose: its small text stays exactly as drawn.
 */
export function EmailPicture() {
  return (
    <picture>
      <source media="(min-width: 640px)" srcSet="/home/email-v6.webp" width={1584} height={1347} />
      <img src="/home/email-v6-1056.webp" width={1056} height={898} alt="" fetchPriority="high" decoding="async" className="block h-auto w-full rounded-[1rem]" />
    </picture>
  );
}
