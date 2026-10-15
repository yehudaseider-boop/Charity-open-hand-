import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Invitations to list a charity. The link carries a random secret; only its SHA-256 hash is stored,
 * in a table no browser can write. A link works once, for 30 days.
 */
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
export const isInviteToken = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{43}$/.test(t);

export async function createInvite(charityName: string, contactEmail: string, invitedBy: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const { error } = await createAdminClient()
    .from("charity_invites")
    .insert({ token_hash: hash(token), charity_name: charityName, contact_email: contactEmail, invited_by: invitedBy });
  if (error) throw error;
  return token;
}

/** The invitation behind a link, if it is still open (unused and not expired). */
export async function findOpenInvite(token: string | undefined): Promise<{ id: string; charityName: string } | null> {
  if (!isInviteToken(token)) return null;
  const { data } = await createAdminClient()
    .from("charity_invites")
    .select("id, charity_name, expires_at, used_at")
    .eq("token_hash", hash(token))
    .maybeSingle();
  if (!data || data.used_at || new Date(data.expires_at).getTime() < Date.now()) return null;
  return { id: data.id, charityName: data.charity_name };
}

/** Mark the invitation used by this application. Only the first use counts. */
export async function claimInvite(token: string, userId: string, charityId: string): Promise<boolean> {
  if (!isInviteToken(token)) return false;
  const { data } = await createAdminClient()
    .from("charity_invites")
    .update({ used_at: new Date().toISOString(), used_by: userId, charity_id: charityId })
    .eq("token_hash", hash(token))
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id");
  return Boolean(data?.length);
}
