import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { requireSecondStep } from "@/lib/mfa";
import { legalConfig } from "@/config/legal";
import { createClient } from "@/lib/supabase/server";
import { currentNext } from "@/lib/current-path";

export type Viewer = {
  userId: string;
  email: string;
  isPlatformAdmin: boolean;
  /** Charities this person administers (readable only after the second step). */
  charities: { id: string; name_en: string; status: string }[];
  /** Ids of the charities this person administers, known even before the second step. */
  managedCharityIds: string[];
  /** Has agreed to the current Terms and Privacy Policy (POPIA). */
  agreedToCurrentPolicy: boolean;
};

/**
 * True when the session's sign-in methods include a password (read from the verified token), and also when the token
 * can't be checked at all: refused, never let through (review 24/11/2026: an unreadable token used to count as "no
 * password").
 */
export async function signedInWithPassword(supabase: Awaited<ReturnType<typeof createClient>>): Promise<boolean> {
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return true;
  const amr = (data.claims as { amr?: { method?: string }[] }).amr ?? [];
  return amr.some((a) => a.method === "password");
}

/** A person's role, the charities they manage and whether they agreed to the current policy, read as themselves. */
function viewerRows(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const reads = Promise.all([
    supabase.from("profiles").select("role").eq("id", userId).single(),
    supabase
      .from("charity_admins")
      .select("charity_id, charities(id, name_en, status)")
      .eq("user_id", userId),
    supabase
      .from("consents")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", "account")
      .eq("policy_version", legalConfig.policyVersion)
      .limit(1)
      .maybeSingle(),
  ]);
  // Read early and then not needed (signed out): never an unhandled failure.
  reads.catch(() => {});
  return reads;
}

type Claims = { sub?: string; email?: string; amr?: { method?: string }[] };

/**
 * The signed sign-in token, its signature checked where the page runs (the project signs with an asymmetric key,
 * so this is normally no trip to Supabase), once per request. A session about to expire is renewed here.
 */
const verifiedSession = cache(async function verifiedSession() {
  const supabase = await createClient();
  const { data: verified, error } = await supabase.auth.getClaims();
  return { supabase, claims: error ? undefined : (verified?.claims as Claims | undefined) };
});

const usedPassword = (claims: Claims | undefined) => (claims?.amr ?? []).some((a) => a.method === "password");

/**
 * The person the verified token names, known without any trip, or null (nobody, or a password sign-in, which is
 * refused). NOT proof the session is still live: callers may start reads for this person early, but must not use
 * what they read until `getViewer` has confirmed the same person.
 */
export async function claimedUserId(): Promise<string | null> {
  const { claims } = await verifiedSession();
  return typeof claims?.sub === "string" && !usedPassword(claims) ? claims.sub : null;
}

/** The signed-in person and their roles, or null for a visitor. Looked up once per request. */
export const getViewer = cache(async function getViewer(): Promise<Viewer | null> {
  const { supabase, claims } = await verifiedSession();
  // The signed sign-in token first: its person lets their role, charities and agreement be read at the same time as
  // Supabase confirms the sign-in, instead of after it (24/11/2026). Nothing read is used until getUser has
  // confirmed the same person; the reads go through row-level security as that person either way.
  const early = typeof claims?.sub === "string" ? viewerRows(supabase, claims.sub) : null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  // Givezy signs people in with an emailed code only: a session started with a password is refused
  // (someone could have registered another person's email with a password before they ever signed in). A token that
  // can't be checked, or names someone else, is refused too: never let through on a failed check (review 24/11/2026).
  if (!claims || claims.sub !== user.id || usedPassword(claims)) return null;

  const [{ data: profile }, { data: memberships }, { data: agreement }] = early && claims?.sub === user.id ? await early : await viewerRows(supabase, user.id);

  const charities = (memberships ?? [])
    .map((m) => m.charities as unknown as Viewer["charities"][number] | null)
    .filter((c): c is Viewer["charities"][number] => c !== null);

  return {
    userId: user.id,
    email: user.email ?? "",
    isPlatformAdmin: profile?.role === "platform_admin",
    charities,
    managedCharityIds: (memberships ?? []).map((m) => m.charity_id as string),
    agreedToCurrentPolicy: Boolean(agreement),
  };
});

/**
 * Only what the site header shows (which work areas to link to), for /api/viewer (24/11/2026). Decides nothing and
 * returns no data: every page still confirms the sign-in with Supabase itself (`getViewer`). So the token is trusted
 * here until it expires (normally an hour) and no trip to the sign-in service is made; two small reads, side by side.
 */
export async function getHeaderViewer(): Promise<Pick<Viewer, "managedCharityIds" | "isPlatformAdmin"> | null> {
  const { supabase, claims } = await verifiedSession();
  if (typeof claims?.sub !== "string" || usedPassword(claims)) return null;
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", claims.sub).single(),
    supabase.from("charity_admins").select("charity_id").eq("user_id", claims.sub),
  ]);
  return { isPlatformAdmin: profile?.role === "platform_admin", managedCharityIds: (memberships ?? []).map((m) => m.charity_id as string) };
}

export async function requireViewer(next = "/account"): Promise<Viewer> {
  next = await currentNext(next);
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(next)}`);
  // Everyone with an account agrees to the current Terms and Privacy Policy first.
  if (!viewer.agreedToCurrentPolicy) redirect(`/agree?next=${encodeURIComponent(next)}`);
  return viewer;
}

export async function requirePlatformAdmin(): Promise<Viewer> {
  const viewer = await requireViewer("/admin");
  if (!viewer.isPlatformAdmin) redirect("/account?denied=admin");
  await requireSecondStep(await currentNext("/admin"));
  return viewer;
}

export async function requireCharityAdmin(): Promise<Viewer> {
  const viewer = await requireViewer("/charity-admin");
  if (viewer.managedCharityIds.length === 0 && !viewer.isPlatformAdmin) redirect("/account?denied=charity");
  await requireSecondStep(await currentNext("/charity-admin"));
  return viewer;
}
