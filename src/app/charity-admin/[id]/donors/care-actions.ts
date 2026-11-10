"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import {
  addNote, addReminder, deleteNote, deleteReminder, deleteSegment, deleteTag, donorGaveTo, editNote, listTags, saveSegment, setLapsedDays,
  setReminderDone, tagDonor, tagNamed, TooManyTags, untagDonor,
} from "@/lib/charity/donor-care";
import { checkLapsedDays, checkNote, checkReminder, checkSegment, checkTagName } from "@/lib/charity/donor-care-rules";
import { loadCharityForManager } from "@/lib/charity/queries";
import { isoDateInJhb } from "@/lib/dates";
import type { FormState } from "@/lib/form";
import { refusal } from "@/lib/charity/team";

const isId = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const donorPage = (charityId: string, donorId: string) => `/charity-admin/${charityId}/donors/${donorId}`;

/**
 * The signed-in person manages this charity, may look after its donors (team roles: "message"), and this donor
 * gave to it. A role without it gets the plain refusal back; a donor of another charity throws (the page errors).
 */
async function forDonor(charityId: string, donorId: string): Promise<{ viewer: { userId: string }; refused: null } | { viewer: null; refused: FormState }> {
  const viewer = await requireViewer();
  await loadCharityForManager(charityId);
  const refused = await refusal(charityId, "message");
  if (refused) return { viewer: null, refused: { ok: false, message: refused } };
  if (!(await donorGaveTo(charityId, donorId))) throw new Error("Not one of this charity's donors.");
  return { viewer, refused: null };
}

const NOT_FOUND: FormState = { ok: false, message: "It isn't there any more (someone may have removed it). Nothing was changed." };

export async function addDonorNote(charityId: string, donorId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { viewer, refused } = await forDonor(charityId, donorId);
  if (refused) return refused;
  const note = checkNote(formData.get("body"));
  if (!note.ok) return { ok: false, fieldErrors: { body: note.error } };
  await addNote(charityId, donorId, note.value, viewer.userId);
  revalidatePath(donorPage(charityId, donorId));
  return { ok: true, message: "Note saved. Only people who manage your charity on Givezy can see it." };
}

export async function editDonorNote(charityId: string, donorId: string, noteId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { refused } = await forDonor(charityId, donorId);
  if (refused) return refused;
  if (!isId(noteId)) return NOT_FOUND;
  const note = checkNote(formData.get("body"));
  if (!note.ok) return { ok: false, fieldErrors: { body: note.error } };
  if (!(await editNote(charityId, donorId, noteId, note.value))) return NOT_FOUND;
  revalidatePath(donorPage(charityId, donorId));
  return { ok: true, message: "Note updated." };
}

export async function deleteDonorNote(charityId: string, donorId: string, noteId: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  const { refused } = await forDonor(charityId, donorId);
  if (refused) return refused;
  if (!isId(noteId) || !(await deleteNote(charityId, donorId, noteId))) return NOT_FOUND;
  revalidatePath(donorPage(charityId, donorId));
  redirect(`${donorPage(charityId, donorId)}?did=note_removed`);
}

export async function addDonorReminder(charityId: string, donorId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { viewer, refused } = await forDonor(charityId, donorId);
  if (refused) return refused;
  const r = checkReminder(formData.get("what"), formData.get("due_on"), isoDateInJhb());
  if (!r.ok) return { ok: false, fieldErrors: r.errors };
  await addReminder(charityId, donorId, r.what, r.dueOn, viewer.userId);
  revalidatePath(donorPage(charityId, donorId));
  revalidatePath(`/charity-admin/${charityId}`);
  return { ok: true, message: "Follow-up saved. It shows on your overview when it's due." };
}

export async function markReminder(charityId: string, donorId: string, reminderId: string, done: boolean, _prev: FormState, _formData: FormData): Promise<FormState> {
  const { viewer, refused } = await forDonor(charityId, donorId);
  if (refused) return refused;
  if (!isId(reminderId) || !(await setReminderDone(charityId, donorId, reminderId, done, viewer.userId))) return NOT_FOUND;
  revalidatePath(donorPage(charityId, donorId));
  revalidatePath(`/charity-admin/${charityId}`);
  redirect(`${donorPage(charityId, donorId)}?did=${done ? "followup_done" : "followup_back"}`);
}

export async function deleteDonorReminder(charityId: string, donorId: string, reminderId: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  const { refused } = await forDonor(charityId, donorId);
  if (refused) return refused;
  if (!isId(reminderId) || !(await deleteReminder(charityId, donorId, reminderId))) return NOT_FOUND;
  revalidatePath(donorPage(charityId, donorId));
  revalidatePath(`/charity-admin/${charityId}`);
  redirect(`${donorPage(charityId, donorId)}?did=followup_removed`);
}

export async function addDonorTag(charityId: string, donorId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { refused } = await forDonor(charityId, donorId);
  if (refused) return refused;
  const name = checkTagName(formData.get("name"));
  if (!name.ok) return { ok: false, fieldErrors: { name: name.error } };
  // The tag as the charity already spells it ("volunteer" typed finds "Volunteer"), so the message names it.
  let tagName = name.value;
  try {
    const tag = await tagNamed(charityId, name.value);
    await tagDonor(charityId, donorId, tag.id);
    tagName = tag.name;
  } catch (e) {
    if (e instanceof TooManyTags) return { ok: false, fieldErrors: { name: "You have 100 tags already. Use one of them, or remove one you no longer need on the Donors page." } };
    throw e;
  }
  revalidatePath(donorPage(charityId, donorId));
  revalidatePath(`/charity-admin/${charityId}/donors`);
  return { ok: true, message: `Tagged "${tagName}".` };
}

export async function removeDonorTag(charityId: string, donorId: string, tagId: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  const { refused } = await forDonor(charityId, donorId);
  if (refused) return refused;
  if (!isId(tagId)) return NOT_FOUND;
  await untagDonor(charityId, donorId, tagId);
  revalidatePath(donorPage(charityId, donorId));
  revalidatePath(`/charity-admin/${charityId}/donors`);
  redirect(`${donorPage(charityId, donorId)}?did=tag_off`);
}

/** Delete a tag from the charity: it comes off every donor. Asked first on the page. */
export async function deleteCharityTag(charityId: string, tagId: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  await requireViewer();
  await loadCharityForManager(charityId);
  const refused = await refusal(charityId, "message");
  if (refused) return { ok: false, message: refused };
  if (!isId(tagId) || !(await deleteTag(charityId, tagId))) return NOT_FOUND;
  redirect(`/charity-admin/${charityId}/donors?did=tag_deleted`);
}

/** Save the donor list as filtered now (group, tag, search) under a name. */
export async function saveDonorList(charityId: string, filters: { group?: string; tag?: string; q?: string }, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  await loadCharityForManager(charityId);
  const refused = await refusal(charityId, "message");
  if (refused) return { ok: false, message: refused };
  const tagIds = new Set((await listTags(charityId)).map((t) => t.id));
  const s = checkSegment(formData.get("name"), filters, tagIds);
  if (!s.ok) return { ok: false, fieldErrors: { name: s.error } };
  const r = await saveSegment(charityId, s.value.name, s.value.filters, viewer.userId);
  if (r === "taken") return { ok: false, fieldErrors: { name: "You already have a list with that name. Choose another." } };
  if (r === "full") return { ok: false, fieldErrors: { name: "You have 50 saved lists. Remove one you no longer need first." } };
  revalidatePath(`/charity-admin/${charityId}/donors`);
  return { ok: true, message: `Saved as "${s.value.name}". It's in your saved lists above.` };
}

export async function deleteDonorList(charityId: string, segmentId: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  await requireViewer();
  await loadCharityForManager(charityId);
  const refused = await refusal(charityId, "message");
  if (refused) return { ok: false, message: refused };
  if (!isId(segmentId) || !(await deleteSegment(charityId, segmentId))) return NOT_FOUND;
  redirect(`/charity-admin/${charityId}/donors?did=list_removed`);
}

export async function saveLapsedPeriod(charityId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireViewer();
  await loadCharityForManager(charityId);
  const refused = await refusal(charityId, "message");
  if (refused) return { ok: false, message: refused };
  const d = checkLapsedDays(formData.get("days"));
  if (!d.ok) return { ok: false, fieldErrors: { days: d.error } };
  await setLapsedDays(charityId, d.value);
  revalidatePath(`/charity-admin/${charityId}/donors`);
  revalidatePath(`/charity-admin/${charityId}`);
  return { ok: true, message: `Saved. A donor now counts as lapsed after ${d.value} days without a gift.` };
}
