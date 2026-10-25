/**
 * The splash from the Givezy logo: the lilac, orange and blue drops together, cut straight out of the logo
 * file (the same image as the app's), never redrawn and never split up. One per page at most, always whole:
 * placed beside or behind a picture, never over words and never cut off by an edge. Hidden from screen readers.
 */
export function Splash({ className = "" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/splash.png" alt="" aria-hidden width={640} height={451} className={`pointer-events-none select-none ${className}`} />;
}
