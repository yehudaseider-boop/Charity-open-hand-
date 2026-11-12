/**
 * The short line shown on the give form's closed "Your choices" row, so a choice made inside it is never hidden
 * (12/11/2026). Null when nothing is chosen. Pure and dependency-free.
 */
export function choicesSummary(c: { anonymous: boolean; noNews: boolean }): string | null {
  const parts = [c.anonymous ? "Anonymous" : null, c.noNews ? "No news" : null].filter((p): p is string => p !== null);
  return parts.length ? parts.join(" · ") : null;
}
