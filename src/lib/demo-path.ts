/**
 * The public dashboard demo (`/demo/...`) is a closed room (Yehuda, 09/11/2026): a charity sent the link sees the
 * charity dashboard and nothing else, so the site's own header and footer, with their ways to the rest of Givezy,
 * give way to a plain demo bar. Pure, so it is tested without a request.
 */
export function isDemoPath(path: string | null | undefined): boolean {
  if (!path) return false;
  const p = path.split(/[?#]/)[0];
  return p === "/demo" || p.startsWith("/demo/");
}
