import { Splash } from "./splash";

/** Where each of the logo's drops flies to (pixels from the middle of the picture), how it tilts and when it leaves. */
const DROPS = [
  { src: "/brand/drop-lilac.png", w: 22, dx: 150, dy: -34, rot: 28, delay: 300 },
  { src: "/brand/drop-orange.png", w: 26, dx: 185, dy: 18, rot: -24, delay: 360 },
  { src: "/brand/drop-blue.png", w: 42, dx: 120, dy: 62, rot: 16, delay: 420 },
] as const;

/**
 * The thank-you page's "ping" for a gift the payment provider has confirmed as paid: the logo's splash pops in, a tick
 * pops onto its corner, and the logo's own three drops fly out once. Only the paid card uses it, so a gift still being
 * confirmed, in review, declined or refunded never shows it. The box is the splash's own size and everything extra is
 * absolutely placed, so nothing moves while it plays. For anyone who asks their device for less motion the tick just
 * sits there and the drops are not shown (see .tick-pop and .drop-fly in globals.css). Decoration only: the words on
 * the page, and the line read aloud below, carry the news.
 */
export function PaidPing() {
  return (
    <div className="relative mb-4 w-28 sm:w-32">
      <p role="status" className="sr-only">Your gift is confirmed.</p>
      <Splash className="pop-in relative block h-auto w-full" />
      <span aria-hidden className="tick-pop absolute -bottom-3 -right-6 flex h-11 w-11 items-center justify-center rounded-full bg-sage ring-4 ring-surface">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {DROPS.map((d) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={d.src}
            src={d.src}
            alt=""
            width={d.w}
            className="drop-fly h-auto"
            style={{ ["--dx" as string]: `${d.dx}px`, ["--dy" as string]: `${d.dy}px`, ["--rot" as string]: `${d.rot}deg`, ["--delay" as string]: `${d.delay}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
