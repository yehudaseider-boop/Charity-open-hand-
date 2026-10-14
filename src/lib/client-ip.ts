/**
 * The visitor's IP address for rate limiting, read only from a header our
 * hosting sets. The leftmost X-Forwarded-For entry is typed by the client and
 * must never be trusted.
 *
 * CLIENT_IP_HEADER names the header the host guarantees (e.g. "x-real-ip" or
 * "cf-connecting-ip"); set it once hosting is chosen (open item #3). Without
 * it we use the rightmost X-Forwarded-For entry: the address our own proxy saw.
 */
export function clientIp(headers: Headers, env: Record<string, string | undefined> = process.env): string {
  const trusted = env.CLIENT_IP_HEADER?.toLowerCase();
  if (trusted) return headers.get(trusted)?.trim() || "unknown";
  const xff = headers.get("x-forwarded-for");
  const last = xff?.split(",").map((s) => s.trim()).filter(Boolean).pop();
  return last || headers.get("x-real-ip")?.trim() || "unknown";
}
