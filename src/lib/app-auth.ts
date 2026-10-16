import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Who is signed in to the phone app, from the "Authorization: Bearer <access token>" it sends
 * with a gift. The token is checked with Supabase. Like the website, a session started with a
 * password is refused: Givezy signs people in with an emailed code only.
 */
export async function appAccount(request: Request): Promise<{ userId: string; email: string } | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const { data, error } = await createAdminClient().auth.getClaims(token);
  if (error || !data?.claims) return null;
  const claims = data.claims as { sub?: string; email?: string; amr?: { method?: string }[]; role?: string };
  if (!claims.sub || !claims.email || claims.role !== "authenticated") return null;
  if ((claims.amr ?? []).some((a) => a.method === "password")) return null;
  return { userId: claims.sub, email: claims.email };
}
