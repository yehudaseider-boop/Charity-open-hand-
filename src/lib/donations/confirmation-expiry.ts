import { platformConfig } from "@/config/platform";

/**
 * How long the link a donor comes back on after paying keeps working (decided 23/11/2026): platformConfig
 * .confirmationLink.days from when it was issued (the gift's start, or the moment a fresh link was emailed). Pure,
 * for tests.
 */
const DAY_MS = 86_400_000;

/** When a link issued at `issuedAt` stops working. */
export function confirmationLinkExpiresAt(issuedAt: Date | string, days: number = platformConfig.confirmationLink.days): Date {
  return new Date(new Date(issuedAt).getTime() + days * DAY_MS);
}

/**
 * True while the link still works. An unreadable issue time counts as expired: the page then offers a fresh link,
 * never an open door.
 */
export function confirmationLinkLive(issuedAt: Date | string | null | undefined, now: Date = new Date(), days: number = platformConfig.confirmationLink.days): boolean {
  if (issuedAt === null || issuedAt === undefined) return false;
  const end = confirmationLinkExpiresAt(issuedAt, days).getTime();
  if (Number.isNaN(end)) return false;
  return now.getTime() < end;
}
