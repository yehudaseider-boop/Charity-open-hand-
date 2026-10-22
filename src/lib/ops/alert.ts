import "server-only";
import { getEmailTransport } from "@/lib/email";

/**
 * Tell the Givezy team something needs a person (a chargeback, the daily check's list). Goes to
 * ADMIN_NOTIFY_EMAIL; without it, only the server log has it. Never throws: an alert that can't be sent
 * must not stop the payment or job that raised it.
 */
export async function alertGivezy(subject: string, lines: string[]): Promise<"sent" | "skipped"> {
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  const site = process.env.SITE_URL?.replace(/\/+$/, "");
  const text = [...lines, "", site ? `Admin, Payments: ${site}/admin/payments` : "Open Admin, Payments on the website.", "", "Givezy"].join("\n");
  if (!to) {
    console.warn(`[alert] ${subject} (ADMIN_NOTIFY_EMAIL is not set)\n${text}`);
    return "skipped";
  }
  try {
    await getEmailTransport().send({ to, subject: `Givezy: ${subject}`, text });
    return "sent";
  } catch (e) {
    console.error(`[alert] could not send "${subject}"`, e);
    return "skipped";
  }
}

/** Is this a call from our scheduler (Authorization: Bearer <CRON_SECRET>)? Null when the jobs are switched off. */
export function cronAllowed(request: Request): boolean | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  const got = request.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}
