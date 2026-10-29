/**
 * A single burst of confetti in Givezy colours, for the thank-you page. Pure CSS: it plays once on arrival and is
 * hidden for people who ask their device for reduced motion (see .confetti-piece in globals.css). Decoration only.
 */
const colours = ["bg-brand", "bg-coral", "bg-honey", "bg-sage", "bg-brand-soft"];

export function ConfettiBurst() {
  // Fixed positions and timings (no randomness), so the server and the browser draw the same thing.
  const pieces = Array.from({ length: 30 }, (_, i) => {
    const left = (i * 37) % 100;
    const delay = ((i * 53) % 60) * 10;
    const drift = (((i * 29) % 21) - 10) * 6;
    const spin = 180 + ((i * 71) % 360);
    const round = i % 3 === 0;
    return { i, left, delay, drift, spin, round, colour: colours[i % colours.length], w: 6 + (i % 4) * 2, h: round ? 6 + (i % 4) * 2 : 12 + (i % 3) * 3 };
  });
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[26rem] overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.i}
          className={`confetti-piece ${p.colour} ${p.round ? "rounded-full" : "rounded-[2px]"}`}
          style={{ left: `${p.left}%`, width: p.w, height: p.h, animationDelay: `${p.delay}ms`, ["--drift" as string]: `${p.drift}px`, ["--spin" as string]: `${p.spin}deg` }}
        />
      ))}
    </div>
  );
}
