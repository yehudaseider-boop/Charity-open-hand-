import "server-only";
import { redirect } from "next/navigation";
import { requireSecondStep } from "@/lib/mfa";
import { legalConfig } from "@/config/legal";
import { createClient } from "@/lib/supabase/server";

export type Viewer = {
  userId: string;
  email: string;
  isPlatformAdmin: boolean;
  /** Charities this person administers (readable only after the second step). */
  charities: { id: string; name_en: string; name_he: string | null; status: string }[];
  /** Ids of the charities this person administers, known even before the second step. */
  managedCharityIds: string[];
  /** Has agreed to the current Terms and Privacy Policy (POPIA). */
  agreedToCurrentPolicy: boolean;
};

/** The signed-in person and their roles, or null for a visitor. */
export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: memberships }, { data: agreement }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase
      .from("charity_admins")
      .select("charity_id, charities(id, name_en, name_he, status)")
      .eq("user_id", user.id),
    supabase
      .from("consents")
      .select("id")
      .eq("user_id", user.id)
      .eq("kind", "account")
      .eq("policy_version", legalConfig.policyVersion)
      .limit(1)
      .maybeSingle(),
  ]);

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
}

export async function requireViewer(next = "/account"): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(next)}`);
  // Everyone with an account agrees to the current Terms and Privacy Policy first.
  if (!viewer.agreedToCurrentPolicy) redirect(`/agree?next=${encodeURIComponent(next)}`);
  return viewer;
}

export async function requirePlatformAdmin(): Promise<Viewer> {
  const viewer = await requireViewer("/admin");
  if (!viewer.isPlatformAdmin) redirect("/account?denied=admin");
  await requireSecondStep("/admin");
  return viewer;
}

export async function requireCharityAdmin(): Promise<Viewer> {
  const viewer = await requireViewer("/charity-admin");
  if (viewer.managedCharityIds.length === 0 && !viewer.isPlatformAdmin) redirect("/account?denied=charity");
  await requireSecondStep("/charity-admin");
  return viewer;
}
