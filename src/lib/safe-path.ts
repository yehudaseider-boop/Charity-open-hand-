/**
 * Where to send someone after signing in. Only a path on this site is
 * allowed, never an outside address. Browsers treat a backslash like a
 * slash, so "/\evil.example" would leave the site; it is refused too.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/account"): string {
  const value = typeof next === "string" ? next : "";
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}

/** As safeNextPath, but only back into the charity or platform admin areas. */
export function safeAdminPath(next: string | null | undefined): string {
  const value = safeNextPath(next, "");
  return /^\/(charity-admin|admin)(\/|\?|$)/.test(value) ? value : "/charity-admin";
}
