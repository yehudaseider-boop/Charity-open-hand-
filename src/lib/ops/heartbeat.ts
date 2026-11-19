import "server-only";

/**
 * "The daily job ran" check-in (19/11/2026). When `HEARTBEAT_DAILY_URL` is set (an https address a monitoring service
 * gives you, such as a Better Stack heartbeat), the daily job visits it once, when it has finished its work. If the
 * job doesn't run at all, or stops before the end, nothing visits it, and the monitoring service tells Yehuda.
 * It sends nothing but the visit itself: no donor details, no counts. Off unless the address is set. Never throws and
 * never holds the job up (a few seconds at most): a check-in that can't be made must not stop the day's work.
 */
export const HEARTBEAT_TIME_LIMIT_MS = 5_000;

export type HeartbeatResult = "sent" | "skipped" | "failed";

/** Only a plain https address counts: nothing else is ever visited. */
export function heartbeatAddress(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}

export async function pingHeartbeat(env: Record<string, string | undefined> = process.env, base: typeof fetch = fetch): Promise<HeartbeatResult> {
  const address = heartbeatAddress(env.HEARTBEAT_DAILY_URL);
  if (!address) return "skipped";
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), HEARTBEAT_TIME_LIMIT_MS);
  try {
    const res = await base(address, { method: "GET", signal: stop.signal, redirect: "error", cache: "no-store" });
    return res.ok ? "sent" : "failed";
  } catch (e) {
    // The address is a secret of sorts: never put it in the log.
    console.warn("[heartbeat] the daily check-in could not be made:", e instanceof Error ? e.name : "error");
    return "failed";
  } finally {
    clearTimeout(timer);
  }
}
