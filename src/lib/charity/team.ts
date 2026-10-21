import "server-only";
import { logAudit } from "@/lib/audit";
import { getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Who manages a charity, and what only its owner may do (Yehuda, 21/10/2026): add or remove people,
 * change the bank account, and send email appeals and updates to donors. Admins do everything else.
 * A Givezy platform admin counts as an owner. Every call here comes after loadCharityForManager.
 */

export type Role = "owner" | "admin";
export type Member = { userId: string; email: string; role: Role; since: string };

/** The signed-in person's role at this charity ("owner" for a platform admin), or null. */
export async function viewerRole(charityId: string): Promise<Role | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  if (viewer.isPlatformAdmin) return "owner";
  return memberRole(charityId, viewer.userId);
}

export async function memberRole(charityId: string, userId: string): Promise<Role | null> {
  const db = createAdminClient();
  const [{ data, error }, { data: profile }] = await Promise.all([
    db.from("charity_admins").select("role").eq("charity_id", charityId).eq("user_id", userId).maybeSingle(),
    db.from("profiles").select("role").eq("id", userId).maybeSingle(),
  ]);
  if (error) throw error;
  if (profile?.role === "platform_admin") return "owner";
  return (data?.role as Role | undefined) ?? null;
}

export const isOwner = async (charityId: string) => (await viewerRole(charityId)) === "owner";

export async function listTeam(charityId: string): Promise<Member[]> {
  const db = createAdminClient();
  const { data, error } = await db.from("charity_admins").select("user_id, role, created_at").eq("charity_id", charityId).order("created_at");
  if (error) throw error;
  const ids = (data ?? []).map((m) => m.user_id as string);
  const { data: profiles, error: pError } = ids.length ? await db.from("profiles").select("id, email").in("id", ids) : { data: [], error: null };
  if (pError) throw pError;
  const emailOf = new Map((profiles ?? []).map((p) => [p.id as string, (p.email as string | null) ?? ""]));
  return (data ?? []).map((m) => ({ userId: m.user_id as string, email: emailOf.get(m.user_id as string) ?? "", role: m.role as Role, since: m.created_at as string }));
}

export type AddResult = { ok: true; userId: string; email: string; already: boolean } | { ok: false; message: string };

/** Give someone access as an admin. A new address gets a Givezy sign-in; an unconfirmed one is refused. */
export async function addMember(charityId: string, actorId: string, rawEmail: string): Promise<AddResult> {
  const email = rawEmail.trim().toLowerCase();
  const db = createAdminClient();
  let { data: profile } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
  if (profile) {
    // An account someone registered but never confirmed could belong to anyone who typed this email.
    const existing = await db.auth.admin.getUserById(profile.id);
    if (existing.error || !existing.data.user?.email_confirmed_at) {
      return { ok: false, message: "That email has a Givezy sign-in that was never confirmed. Ask them to sign in once with the emailed code, then add them again." };
    }
  } else {
    const created = await db.auth.admin.createUser({ email, email_confirm: true });
    if (created.error) return { ok: false, message: "We couldn't set up a sign-in for that email. Check it and try again." };
    profile = { id: created.data.user.id };
  }
  const { data: had } = await db.from("charity_admins").select("user_id").eq("charity_id", charityId).eq("user_id", profile.id).maybeSingle();
  if (had) return { ok: true, userId: profile.id, email, already: true };
  const { error } = await db.from("charity_admins").insert({ charity_id: charityId, user_id: profile.id, role: "admin" });
  if (error) throw error;
  // The person's id, not their address: the audit log is append-only and outlives an erasure.
  await logAudit({ actorUserId: actorId, action: "charity.admin_added", entityType: "charity", entityId: charityId, details: { user_id: profile.id, by: "owner" } });
  return { ok: true, userId: profile.id, email, already: false };
}

export type RemoveResult = { ok: true; email: string } | { ok: false; message: string };

/**
 * Take away someone's access. An owner can't be removed here (ask Givezy), except an owner removing
 * themselves while another owner remains, so a charity is never left with nobody in charge.
 */
export async function removeMember(charityId: string, actorId: string, userId: string): Promise<RemoveResult> {
  const db = createAdminClient();
  const team = await listTeam(charityId);
  const target = team.find((m) => m.userId === userId);
  if (!target) return { ok: false, message: "That person no longer has access." };
  if (target.role === "owner") {
    const owners = team.filter((m) => m.role === "owner").length;
    if (userId !== actorId) return { ok: false, message: "Another owner can only be removed by Givezy. Reply to any email from us to ask." };
    if (owners < 2) return { ok: false, message: "You're the only owner, so you can't remove yourself. Ask Givezy to make someone else the owner first." };
  }
  const { data, error } = await db.from("charity_admins").delete().eq("charity_id", charityId).eq("user_id", userId).select("user_id");
  if (error) throw error;
  if (!data?.length) return { ok: false, message: "That person no longer has access." };
  await logAudit({ actorUserId: actorId, action: "charity.admin_removed", entityType: "charity", entityId: charityId, details: { user_id: userId, by: "owner" } });
  return { ok: true, email: target.email };
}
