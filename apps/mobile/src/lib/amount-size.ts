/**
 * Big Rand figures next to a goal ring: a step smaller for long amounts on narrow phones, so
 * "R12 940" never breaks over two lines or gets cut off.
 */
export function bigAmountSize(text: string, screenWidth: number, base: number): { fontSize: number; lineHeight: number } {
  const narrow = screenWidth < 360;
  const size = text.length <= 5 ? base : narrow ? Math.round(base * (text.length <= 7 ? 0.7 : 0.6)) : Math.round(base * (text.length <= 8 ? 0.9 : 0.75));
  return { fontSize: size, lineHeight: Math.round(size * 1.2) };
}
