import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Viewer = {
  userId: string;
  email: string;
  isPlatformAdmin: boolean;
  /** Charities this person administers. */
  charities: { id: string; name_en: string; name_he: string | null; status: string }[];
};

/** The signed-in person and their roles, or null for a visitor. */
export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase
      .from("charity_admins")
      .select("charities(id, name_en, name_he, status)")
      .eq("user_id", user.id),
  ]);

  const charities = (memberships ?? [])
    .map((m) => m.charities as unknown as Viewer["charities"][number] | null)
    .filter((c): c is Viewer["charities"][number] => c !== null);

  return {
    userId: user.id,
    email: user.email ?? "",
    isPlatformAdmin: profile?.role === "platform_admin",
    charities,
  };
}

export async function requireViewer(next = "/account"): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(next)}`);
  return viewer;
}

/** Where an admin completes the authenticator-app step, then returns to next. */
export function twoStepPath(next: string) {
  return `/two-step?next=${encodeURIComponent(next)}`;
}

/** Has this session completed the authenticator-app step? */
export async function hasSecondFactor(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.currentLevel === "aal2";
}

/**
 * A platform admin who has completed the authenticator-app step. Every admin
 * page and action calls this first; the database checks the step again.
 */
export async function requirePlatformAdmin(next = "/admin"): Promise<Viewer> {
  const viewer = await requireViewer(next);
  if (!viewer.isPlatformAdmin) redirect("/account?denied=admin");
  if (!(await hasSecondFactor())) redirect(twoStepPath(next));
  return viewer;
}

export async function requireCharityAdmin(): Promise<Viewer> {
  const viewer = await requireViewer("/charity-admin");
  if (viewer.charities.length === 0 && !viewer.isPlatformAdmin) redirect("/account?denied=charity");
  return viewer;
}
