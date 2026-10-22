/**
 * One of the logo's three drops (cut from the logo, never redrawn), as a decorative splash. Placed with
 * `className` (position, size, rotation); behind or beside words, never on top of them. Hidden from screen readers.
 */
export function Drop({ colour, className }: { colour: "blue" | "lilac" | "orange"; className: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/brand/drop-${colour}.png`} alt="" aria-hidden className={`pointer-events-none absolute select-none ${className}`} />;
}
