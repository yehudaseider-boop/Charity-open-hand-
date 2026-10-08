import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Same-site paths only, never an outside address. */
export function safeNextPath(value: unknown, fallback = "/account"): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

/**
 * Charity admins must have proved a second step (an authenticator-app code)
 * in this sign-in. Sends them to set one up, or to enter their code.
 */
export async function requireSecondStep(next: string): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || data?.currentLevel !== "aal2") redirect(`/mfa?next=${encodeURIComponent(safeNextPath(next))}`);
}

/** For route handlers: true only if this sign-in has passed the second step. */
export async function hasSecondStep(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return !error && data?.currentLevel === "aal2";
}
