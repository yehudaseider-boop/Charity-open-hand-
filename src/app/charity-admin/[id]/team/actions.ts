"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { recordAction } from "@/lib/charity/charity-actions";
import { adminRemovedEmail, memberAddedEmail, notifyCharity } from "@/lib/charity/emails";
import { loadCharityForManager } from "@/lib/charity/queries";
import { addMember, isOwner, removeMember } from "@/lib/charity/team";
import type { FormState } from "@/lib/form";
import { hitRateLimit } from "@/lib/rate-limit";

const NOT_OWNER: FormState = { ok: false, message: "Only your charity's owner can add or remove people. Nothing was changed." };

/** Give someone access to the dashboard as an admin. Owner only. */
export async function addTeamMember(charityId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const { charity } = await loadCharityForManager(charityId);
  if (!(await isOwner(charityId))) return NOT_OWNER;
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { ok: false, fieldErrors: { email: "Enter their email address, for example sam@yourcharity.org.za" } };
  // Adding someone creates a sign-in and emails them in Givezy's name, so only for a charity Givezy is
  // reviewing or has approved: a draft anyone can start must not become a way to email strangers.
  if (charity.status === "draft" || charity.status === "rejected") {
    return { ok: false, message: "You can add people once your application is sent to Givezy. Nothing was changed." };
  }
  // Adding people creates sign-ins: a handful an hour is plenty for a real team.
  if (await hitRateLimit("team-add", [`charity:${charityId}`, `user:${viewer.userId}`], 10, 60)) return { ok: false, message: "That's a lot of people in one go. Please wait an hour and try again. Nothing was changed." };
  const r = await addMember(charityId, viewer.userId, email);
  if (!r.ok) return { ok: false, message: r.message };
  if (!r.already) await notifyCharity(memberAddedEmail(r.email, charity.name_en, charityId));
  revalidatePath(`/charity-admin/${charityId}/team`);
  const done = await recordAction(charityId, viewer.userId, "member_added", { email: r.email, already: r.already }, r.already ? null : { type: "remove_member", userId: r.userId });
  redirect(`/charity-admin/${charityId}/team?done=${done}`);
}

/** Take away someone's access. Owner only; asked first on the page. */
export async function removeTeamMember(charityId: string, userId: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const { charity } = await loadCharityForManager(charityId);
  if (!(await isOwner(charityId))) return NOT_OWNER;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return { ok: false, message: "That person no longer has access." };
  const r = await removeMember(charityId, viewer.userId, userId);
  if (!r.ok) return { ok: false, message: r.message };
  if (r.email) await notifyCharity(adminRemovedEmail(r.email, charity.name_en));
  revalidatePath(`/charity-admin/${charityId}`, "layout");
  // Removing yourself: you can't see this charity any more.
  if (userId === viewer.userId) redirect("/account");
  const done = await recordAction(charityId, viewer.userId, "member_removed", { email: r.email }, null);
  redirect(`/charity-admin/${charityId}/team?done=${done}`);
}
