import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { sameSecret } from "@/lib/secret-compare";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmationLinkLive } from "./confirmation-expiry";

/**
 * A donation id is not a secret: charity admins see it in their dashboard and
 * export. So the confirmation page asks for a separate credential, sent only
 * to the donor in the gateway return address. Only its SHA-256 hash is stored,
 * in a table no client can read.
 *
 * The credential works for platformConfig.confirmationLink.days from when it was issued (23/11/2026). The row's
 * `created_at` is that moment: set when the gift starts, and again whenever a new credential replaces the old one
 * (the app asking again about a saved-card gift, or "Email me a fresh link").
 */
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Create (and store the hash of) the credential for a new donation. */
export async function issueConfirmationToken(donationId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const { error } = await createAdminClient()
    .from("donation_confirmations")
    .insert({ donation_id: donationId, token_hash: hash(token) });
  if (error) throw error;
  return token;
}

/**
 * A fresh credential for an existing donation, replacing the old one (which stops working): the app asked again
 * about the same saved-card gift, or the donor asked for a fresh link by email. It works for the full period again.
 */
export async function reissueConfirmationToken(donationId: string, now: Date = new Date()): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const { error } = await createAdminClient()
    .from("donation_confirmations")
    .upsert({ donation_id: donationId, token_hash: hash(token), created_at: now.toISOString() }, { onConflict: "donation_id" });
  if (error) throw error;
  return token;
}

/**
 * What a credential is for this donation: "valid" (it matches and is within its period), "expired" (it matches, but
 * its period is over), or "none" (missing, malformed, wrong, or the lookup failed). Only "valid" opens anything.
 */
export type ConfirmationAccess = "valid" | "expired" | "none";

export async function confirmationAccess(donationId: string, token: string | undefined, now: Date = new Date()): Promise<ConfirmationAccess> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return "none";
  const { data, error } = await createAdminClient()
    .from("donation_confirmations")
    .select("token_hash, created_at")
    .eq("donation_id", donationId)
    .maybeSingle();
  if (error || !data) return "none";
  if (!sameSecret(String(data.token_hash).toLowerCase(), hash(token))) return "none";
  return confirmationLinkLive(data.created_at as string | null, now) ? "valid" : "expired";
}

/** True only for the credential issued with this donation, while it is still within its period. */
export async function confirmationTokenMatches(donationId: string, token: string | undefined, now: Date = new Date()): Promise<boolean> {
  return (await confirmationAccess(donationId, token, now)) === "valid";
}
