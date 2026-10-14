/**
 * The donor-facing reference for a donation: the first 8 characters of its id,
 * upper case (e.g. "NL-3F9A2C71"). Shown on the confirmation page and email,
 * and searchable by the platform team.
 */
export function donationReference(donationId: string): string {
  return `NL-${donationId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

/**
 * Opens the phone app on its giving history. The app's own link scheme; once
 * we have a domain this becomes a universal link (https) as well.
 */
export const APP_RETURN_LINK = "nedivlev://giving";
