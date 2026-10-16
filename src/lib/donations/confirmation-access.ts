import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * A donation id is not a secret: charity admins see it in their dashboard and
 * export. So the confirmation page asks for a separate credential, sent only
 * to the donor in the gateway return address. Only its SHA-256 hash is stored,
 * in a table no client can read.
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

/** A fresh credential for an existing donation (the app asked again about the same saved-card gift). */
export async function reissueConfirmationToken(donationId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const { error } = await createAdminClient()
    .from("donation_confirmations")
    .upsert({ donation_id: donationId, token_hash: hash(token) }, { onConflict: "donation_id" });
  if (error) throw error;
  return token;
}

/** True only for the credential issued with this donation. */
export async function confirmationTokenMatches(donationId: string, token: string | undefined): Promise<boolean> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const { data, error } = await createAdminClient()
    .from("donation_confirmations")
    .select("token_hash")
    .eq("donation_id", donationId)
    .maybeSingle();
  if (error || !data) return false;
  const a = Buffer.from(data.token_hash, "hex");
  const b = Buffer.from(hash(token), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
