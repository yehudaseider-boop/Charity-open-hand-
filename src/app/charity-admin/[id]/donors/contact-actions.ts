"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { recordAction } from "@/lib/charity/charity-actions";
import { checkContactFile, rowProblems } from "@/lib/charity/contacts";
import { contactEmails, importContactsFile, removeContactImport } from "@/lib/charity/contacts-store";
import { listTags } from "@/lib/charity/donor-care";
import { loadCharityForManager } from "@/lib/charity/queries";
import { fileFingerprint } from "@/lib/charity/recorded-gifts-store";
import { isOwner } from "@/lib/charity/team";
import { isUuid } from "@/lib/ids";
import type { FormState } from "@/lib/form";

export type ContactPreview =
  | { state: "idle" }
  | { state: "refused"; message: string }
  | {
      state: "checked";
      fingerprint: string;
      good: number;
      bad: number;
      /** Of the good rows: how many have a phone number, and how many an address. */
      withPhone: number;
      withAddress: number;
      problems: { line: number; messages: string[] }[];
      warnings: string[];
      unknownColumns: string[];
      newTags: string[];
      /** Every row passed and nothing else stands in the way. */
      canImport: boolean;
    };

const MAX_TAGS = 100;

/** Owner of an approved charity: the same check before checking, importing and removing. */
async function allowed(charityId: string): Promise<string | null> {
  const { charity } = await loadCharityForManager(charityId);
  if (charity.status !== "approved") return "You can import donors once Givezy has approved your charity. Nothing was imported.";
  if (!(await isOwner(charityId))) return "Only your charity's owner can import donors. Nothing was imported.";
  return null;
}

/** Read and check the file against what the charity already has. Writes nothing. */
async function checkUpload(charityId: string, text: string) {
  const [file, tags] = await Promise.all([contactEmails(charityId).then((existingEmails) => checkContactFile(text, { existingEmails })), listTags(charityId)]);
  if (!file.ok) return { file, newTags: [] as string[], tooManyTags: false };
  const known = new Set(tags.map((t) => t.name.toLowerCase()));
  const newTags = file.tagNames.filter((t) => !known.has(t.toLowerCase()));
  return { file, newTags, tooManyTags: tags.length + newTags.length > MAX_TAGS };
}

/** Step 1: read the file the charity chose and say what would be imported. */
export async function checkContactImport(charityId: string, _prev: ContactPreview, formData: FormData): Promise<ContactPreview> {
  await requireViewer();
  const refused = await allowed(charityId);
  if (refused) return { state: "refused", message: refused };
  const text = String(formData.get("text") ?? "");
  if (!text.trim()) return { state: "refused", message: "Choose a CSV file first." };
  const { file, newTags, tooManyTags } = await checkUpload(charityId, text);
  if (!file.ok) return { state: "refused", message: file.message };
  const warnings: string[] = [];
  if (file.looksLikeGifts) warnings.push("This file has Amount or Date columns, which this import doesn't use. If these are gifts, use Import gifts on your Donations page instead.");
  if (file.identityColumns.length) {
    warnings.push(`${file.identityColumns.length === 1 ? `The column "${file.identityColumns[0].slice(0, 40)}" isn't` : "The ID and tax number columns aren't"} imported or kept. Givezy only needs an ID or tax number for an s18A receipt, and the donor gives it with their gift. You can leave ${file.identityColumns.length === 1 ? "that column" : "those columns"} out of the file.`);
  }
  if (tooManyTags) warnings.push(`This file would add ${newTags.length} new ${newTags.length === 1 ? "tag" : "tags"}, which takes you over ${MAX_TAGS}. Use fewer tags, or delete tags you no longer need under Settings on your Donors page.`);
  return {
    state: "checked",
    fingerprint: fileFingerprint(text),
    good: file.good,
    bad: file.bad,
    withPhone: file.withPhone,
    withAddress: file.withAddress,
    problems: rowProblems(file.rows).slice(0, 100),
    warnings,
    unknownColumns: file.unknownColumns,
    newTags: newTags.slice(0, 20),
    canImport: file.bad === 0 && file.good > 0 && !tooManyTags,
  };
}

/** Step 2: import exactly the file that was checked, all of it or nothing. */
export async function importContacts(charityId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const refused = await allowed(charityId);
  if (refused) return { ok: false, message: refused };
  const text = String(formData.get("text") ?? "");
  if (fileFingerprint(text) !== String(formData.get("fingerprint") ?? "")) {
    return { ok: false, message: "The file changed since it was checked. Nothing was imported. Check it again first." };
  }
  if (formData.get("confirm") !== "on") {
    return { ok: false, fieldErrors: { confirm: "Please confirm, so we know these people gave you their details" } };
  }
  const { file, tooManyTags } = await checkUpload(charityId, text);
  if (!file.ok) return { ok: false, message: file.message };
  if (file.bad) return { ok: false, message: `${file.bad} ${file.bad === 1 ? "row needs" : "rows need"} fixing first, so nothing was imported. Fix ${file.bad === 1 ? "it" : "them"} and check the file again.` };
  if (tooManyTags) return { ok: false, message: "This file would take you over 100 tags, so nothing was imported." };
  const contacts = file.rows.flatMap((r) => (r.check.ok ? [r.check.contact] : []));
  // Cut by characters, not code units, so a surrogate pair is never split.
  const fileName = Array.from(String(formData.get("file_name") ?? "file.csv").replace(/[\u0000-\u001f]/g, "")).slice(0, 200).join("") || "file.csv";
  const r = await importContactsFile({ charityId, userId: viewer.userId, contacts, fileName, fingerprint: fileFingerprint(text) });
  if (!r.ok) return { ok: false, message: r.message };
  revalidatePath(`/charity-admin/${charityId}/donors`);
  const done = await recordAction(charityId, viewer.userId, "contacts_imported", { contacts: r.contacts, file: fileName }, { type: "remove_contacts", importId: r.importId });
  redirect(`/charity-admin/${charityId}/donors?done=${done}`);
}

/** Remove a whole import after the 30 minutes of Undo. Asked first on the page. */
export async function removeContacts(charityId: string, importId: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  await loadCharityForManager(charityId);
  if (!(await isOwner(charityId))) return { ok: false, message: "Only your charity's owner can remove imported donors. Nothing was removed." };
  if (!isUuid(importId)) return { ok: false, message: "Nothing to remove." };
  const removed = await removeContactImport(charityId, importId, viewer.userId);
  revalidatePath(`/charity-admin/${charityId}/donors`);
  if (!removed) return { ok: false, message: "It has already been removed." };
  const done = await recordAction(charityId, viewer.userId, "contacts_removed", { removed }, null);
  redirect(`/charity-admin/${charityId}/donors?done=${done}`);
}
