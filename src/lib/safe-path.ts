/**
 * Same-site paths only, never an outside address. Used for every "next"
 * redirect. Browsers treat "/\evil.example" like "//evil.example", so
 * backslashes and control characters are refused as well as "//".
 */
export function safeNextPath(value: unknown, fallback = "/account"): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !/[\\\u0000-\u001f]/.test(value)
    ? value
    : fallback;
}
