import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export { safeNextPath } from "@/lib/safe-path";
import { safeNextPath } from "@/lib/safe-path";

/**
 * Charity admins must have proved a second step (an authenticator-app code)
 * in this sign-in. Sends them to set one up, or to enter their code.
 */
export async function requireSecondStep(next: string): Promise<void> {
  if (!(await hasSecondStep())) redirect(`/mfa?next=${encodeURIComponent(safeNextPath(next))}`);
}

/**
 * True only if this sign-in has passed the second step. Read from the verified sign-in token (getClaims checks its
 * signature), not from the cookie as stored (19/11/2026): Supabase's own assurance-level helper reads the unverified
 * cookie, which printed a "could be insecure" warning into the site's logs on every dashboard and Admin page.
 */
export async function hasSecondStep(): Promise<boolean> {
  const supabase = await createClient();
  return passedSecondStep(supabase);
}

/** The same check with a client the caller already has. */
export async function passedSecondStep(supabase: Awaited<ReturnType<typeof createClient>>): Promise<boolean> {
  const { data, error } = await supabase.auth.getClaims();
  return !error && (data?.claims as { aal?: string } | undefined)?.aal === "aal2";
}
