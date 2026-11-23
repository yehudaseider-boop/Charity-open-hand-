import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";

/**
 * After someone signs in with the emailed link or code (which proves they control the
 * address), attach the donor identities that used that address, so they can see
 * their donations and receipts. Only donors with no account yet are linked.
 *
 * Callers with a session use linkDonorsForSession, which checks the sign-in method first. Call this directly only
 * right after checking an emailed code yourself (Sign in's code box).
 */
export async function linkDonorsToUser(userId: string, email: string): Promise<number> {
  const { data, error } = await createAdminClient().rpc("link_donors_to_user", { p_user: userId, p_email: email });
  if (error) throw new Error(`Could not link donors: ${error.message}`);
  return Number(data ?? 0);
}

/** The emailed sign-in methods, as the app's link_my_donations accepts them (migration 20261009000016). */
const EMAILED_METHODS = new Set(["otp", "magiclink", "email/signup"]);

/**
 * True only for a session started with an emailed link or code and never with a password (read from the token's
 * verified sign-in methods). Someone could register another person's email with a password before they ever signed
 * in; that session must never see the real owner's gifts (security review 23/11/2026).
 */
export function signedInByEmail(amr: unknown): boolean {
  const methods = (Array.isArray(amr) ? amr : []).map((a) => (a && typeof a === "object" ? (a as { method?: unknown }).method : undefined));
  return !methods.includes("password") && methods.some((m) => typeof m === "string" && EMAILED_METHODS.has(m));
}

/**
 * Link the signed-in person's past gifts, only when this session was started with an emailed link or code and their
 * email is confirmed. `onlyEmail`: link only when the account's email is this one (a gift given while signed in).
 * Returns how many donor records were linked (0 when the session doesn't qualify).
 */
export async function linkDonorsForSession(supabase: Awaited<ReturnType<typeof createClient>>, opts: { onlyEmail?: string } = {}): Promise<number> {
  const [claimsResult, userResult] = await Promise.all([supabase.auth.getClaims(), supabase.auth.getUser()]);
  const claims = claimsResult.data?.claims as { sub?: string; amr?: unknown } | undefined;
  const user = userResult.data.user;
  if (!user?.email || !user.email_confirmed_at || !claims || claims.sub !== user.id) return 0;
  if (!signedInByEmail(claims.amr)) return 0;
  if (opts.onlyEmail !== undefined && user.email.trim().toLowerCase() !== opts.onlyEmail.trim().toLowerCase()) return 0;
  return linkDonorsToUser(user.id, user.email);
}
