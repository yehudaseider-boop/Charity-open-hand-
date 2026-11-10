import "server-only";
import { logAudit } from "@/lib/audit";
import { getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { can, isRole, refusedFor, type Permission, type Role } from "./permissions";

/**
 * Who manages a charity and in which role (CRM step 9, 10/11/2026): owner, admin, finance, fundraiser or viewer.
 * What each role may do is in ./permissions.ts (and the same table in the database's charity_can()). A Givezy
 * platform admin counts as an owner. Every call here comes after loadCharityForManager.
 */

export type { Role } from "./permissions";
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
  if (!data) return null;
  // A role this code doesn't know (written by a newer version) gets the least: seeing the dashboard.
  return isRole(data.role) ? data.role : "viewer";
}

export const isOwner = async (charityId: string) => (await viewerRole(charityId)) === "owner";

/** May the signed-in person do this at this charity? (After loadCharityForManager.) */
export async function viewerCan(charityId: string, permission: Permission): Promise<boolean> {
  return can(await viewerRole(charityId), permission);
}

/** For server actions: null when allowed, otherwise the plain refusal to show (nothing was changed). */
export async function refusal(charityId: string, permission: Permission): Promise<string | null> {
  return (await viewerCan(charityId, permission)) ? null : refusedFor(permission);
}

export async function listTeam(charityId: string): Promise<Member[]> {
  const db = createAdminClient();
  const { data, error } = await db.from("charity_admins").select("user_id, role, created_at").eq("charity_id", charityId).order("created_at");
  if (error) throw error;
  const ids = (data ?? []).map((m) => m.user_id as string);
  const { data: profiles, error: pError } = ids.length ? await db.from("profiles").select("id, email").in("id", ids) : { data: [], error: null };
  if (pError) throw pError;
  const emailOf = new Map((profiles ?? []).map((p) => [p.id as string, (p.email as string | null) ?? ""]));
  return (data ?? []).map((m) => ({ userId: m.user_id as string, email: emailOf.get(m.user_id as string) ?? "", role: isRole(m.role) ? m.role : "viewer", since: m.created_at as string }));
}

export type AddResult = { ok: true; userId: string; email: string; already: boolean } | { ok: false; message: string };

/** Give someone access as an admin. A new address gets a Givezy sign-in; an unconfirmed one is refused. */
export async function addMember(charityId: string, actorId: string, rawEmail: string, role: Role = "admin"): Promise<AddResult> {
  if (role === "owner") return { ok: false, message: "There is one owner. Add them in another role." };
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
  const { error } = await db.from("charity_admins").insert({ charity_id: charityId, user_id: profile.id, role });
  if (error) {
    if (rolesNotSetUp(error)) return { ok: false, message: ROLES_NOT_SET_UP };
    throw error;
  }
  // The person's id, not their address: the audit log is append-only and outlives an erasure.
  await logAudit({ actorUserId: actorId, action: "charity.admin_added", entityType: "charity", entityId: charityId, details: { user_id: profile.id, by: "owner", role } });
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

/** Before migration 20261110000009 runs, the database knows only owner and admin. */
export const ROLES_NOT_SET_UP = "Roles other than Admin aren't switched on yet. Nothing was changed. Add them as an admin for now, or try again later.";
const rolesNotSetUp = (e: { code?: string; message?: string }) => e.code === "22P02" || /invalid input value for enum/i.test(e.message ?? "");

export type RoleResult = { ok: true; email: string; before: Role; after: Role } | { ok: false; message: string };

/** Change someone's role (the owner only, after the caller checked). The owner's own role isn't changed here. */
export async function setMemberRole(charityId: string, actorId: string, userId: string, role: Role, expect?: Role): Promise<RoleResult> {
  if (role === "owner") return { ok: false, message: "There is one owner, and ownership isn't handed over here. Ask Givezy if you need to." };
  const db = createAdminClient();
  const team = await listTeam(charityId);
  const target = team.find((m) => m.userId === userId);
  if (!target) return { ok: false, message: "That person no longer has access." };
  if (target.role === "owner") return { ok: false, message: "The owner's role can't be changed here. Ask Givezy if you need to." };
  if (expect && target.role !== expect) return { ok: false, message: "Someone changed their role since. Nothing was changed. Have a look and try again." };
  if (target.role === role) return { ok: true, email: target.email, before: role, after: role };
  const { data, error } = await db.from("charity_admins").update({ role }).eq("charity_id", charityId).eq("user_id", userId).eq("role", target.role).select("user_id");
  if (error) {
    if (rolesNotSetUp(error)) return { ok: false, message: ROLES_NOT_SET_UP };
    throw error;
  }
  if (!data?.length) return { ok: false, message: "Someone changed their role since. Nothing was changed. Have a look and try again." };
  await logAudit({ actorUserId: actorId, action: "charity.role_changed", entityType: "charity", entityId: charityId, details: { user_id: userId, from: target.role, to: role } });
  return { ok: true, email: target.email, before: target.role, after: role };
}
