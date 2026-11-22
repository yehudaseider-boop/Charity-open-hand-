/** Below this width (in points) a phone counts as narrow: smaller ring, smaller amounts. */
export const NARROW_SCREEN = 380;

/**
 * Big Rand figures next to a goal ring: a step smaller for long amounts on narrow phones, so
 * "R12 940" never breaks over two lines or gets cut off.
 */
export function bigAmountSize(text: string, screenWidth: number, base: number): { fontSize: number; lineHeight: number } {
  // 360-wide Android phones count as narrow too (22/11/2026: "R2 940" broke over two lines there).
  const narrow = screenWidth < NARROW_SCREEN;
  const size = text.length <= 5 ? base : narrow ? Math.round(base * (text.length <= 7 ? 0.7 : 0.6)) : Math.round(base * (text.length <= 8 ? 0.9 : 0.75));
  return { fontSize: size, lineHeight: Math.round(size * 1.2) };
}
