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

/** True when the session's sign-in methods include a password (read from the verified token). */
export async function signedInWithPassword(supabase: Awaited<ReturnType<typeof createClient>>): Promise<boolean> {
  const { data } = await supabase.auth.getClaims();
  const amr = (data?.claims as { amr?: { method?: string }[] } | undefined)?.amr ?? [];
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

/** The signed-in person and their roles, or null for a visitor. Looked up once per request. */
export const getViewer = cache(async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient();
  // The signed sign-in token first: its signature is checked here, normally without a trip to Supabase. Its person
  // lets their role, charities and agreement be read at the same time as Supabase confirms the sign-in, instead of
  // after it (24/11/2026: two trips before every signed-in page, now one). Nothing read is used until getUser has
  // confirmed the same person; the reads go through row-level security as that person either way.
  const { data: verified, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsError ? undefined : (verified?.claims as { sub?: string; amr?: { method?: string }[] } | undefined);
  const early = typeof claims?.sub === "string" ? viewerRows(supabase, claims.sub) : null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  // Givezy signs people in with an emailed code only: a session started with a password is refused
  // (someone could have registered another person's email with a password before they ever signed in).
  if ((claims?.amr ?? []).some((a) => a.method === "password")) return null;

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
