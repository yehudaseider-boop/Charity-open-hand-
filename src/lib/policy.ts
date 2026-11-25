/**
 * Version of the Terms and Privacy policy. Every agreement is stored with the
 * version it was given for; changing it asks signed-in people (on the website
 * and in the app) to agree again. Dependency-free: the phone app imports it.
 */
export const POLICY_VERSION = "2026-10-08-draft";

/** The version as people read it: "2026-10-08-draft" becomes "08/10/2026 (draft)". Anything else is shown as it is. */
export function policyVersionLabel(version: string = POLICY_VERSION): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:-(.+))?$/.exec(version);
  if (!m) return version;
  return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` (${m[4]})` : ""}`;
}
