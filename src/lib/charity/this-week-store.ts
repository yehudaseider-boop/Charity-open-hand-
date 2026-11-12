import "server-only";
import { shownEmail } from "./dashboard";
import { lastThanked, optedOut } from "./thank-you-send";
import { donorsToThank, TO_THANK_DAYS } from "./this-week";

/**
 * New donors to thank this week, for "Needs you this week" on the overview (CRM step 17). Reads with the service role
 * through the same helpers as the Donors page's "Say thank you", so call it only after loadCharityForManager has
 * checked the person manages this charity. `donors` is this charity's own donor list.
 */
export async function newDonorsToThank<T extends { donor_id: string; first_paid_at: string; email: string | null }>(
  charityId: string,
  donors: T[],
  now = new Date(),
): Promise<{ count: number; onlyDonorId: string | null }> {
  const since = now.getTime() - TO_THANK_DAYS * 86_400_000;
  const recent = donors.filter((d) => new Date(d.first_paid_at).getTime() >= since && shownEmail(d.email));
  if (!recent.length) return { count: 0, onlyDonorId: null };
  const [thanked, stopped] = await Promise.all([lastThanked(charityId, recent.map((d) => d.donor_id)), optedOut(recent.map((d) => d.email ?? ""))]);
  const toThank = donorsToThank(recent, now, { canEmail: (e) => Boolean(shownEmail(e)), lastThankedAt: thanked, optedOut: stopped });
  return { count: toThank.length, onlyDonorId: toThank.length === 1 ? toThank[0].donor_id : null };
}
