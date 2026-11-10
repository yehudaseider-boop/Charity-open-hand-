import "server-only";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { CONTACT_CONFIRMATION_VERSION, type CleanContact } from "./contacts";

/**
 * A charity's imported donors (contacts): people who have not given through Givezy. Their own table, never
 * public.donors. The list is read with the signed-in person's session (row-level security lets only that
 * charity's admins, with their second step, read it); writes go through the server after the caller checked
 * the person may make them.
 */

export type ContactRow = {
  id: string;
  import_id: string;
  first_name: string | null;
  last_name: string | null;
  organisation_name: string | null;
  email: string | null;
  phone: string | null;
  /** The postal address, for one line on the donors list (contactAddress in contacts.ts). */
  address_line1: string | null;
  address_line2: string | null;
  suburb: string | null;
  city: string | null;
  postal_code: string | null;
  note: string | null;
  created_at: string;
  tag_ids: string[];
};

/** Every contact of this charity, newest import first. */
export async function loadContacts(charityId: string): Promise<ContactRow[]> {
  const supabase = await createClient();
  const rows: ContactRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("charity_contacts")
      .select("id, import_id, first_name, last_name, organisation_name, email, phone, address_line1, address_line2, suburb, city, postal_code, note, created_at, charity_contact_tags(tag_id)")
      .eq("charity_id", charityId)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      const { charity_contact_tags: tags, ...rest } = r as unknown as Omit<ContactRow, "tag_ids"> & { charity_contact_tags: { tag_id: string }[] | null };
      rows.push({ ...rest, tag_ids: (tags ?? []).map((t) => t.tag_id) });
    }
    if (!data || data.length < 1000) break;
  }
  return rows;
}

/** Emails already on the charity's imported list (lower case), to catch the same person twice. */
export async function contactEmails(charityId: string): Promise<Set<string>> {
  const db = createAdminClient();
  const out = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("charity_contacts").select("email").eq("charity_id", charityId).not("email", "is", null).order("id").range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) out.add(String(r.email));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export type ImportResult = { ok: true; importId: string; contacts: number } | { ok: false; message: string };

/** Import a checked file in one database call: all of it, or nothing. */
export async function importContactsFile(args: { charityId: string; userId: string; contacts: CleanContact[]; fileName: string; fingerprint: string }): Promise<ImportResult> {
  const { data, error } = await createAdminClient().rpc("import_charity_contacts", {
    p_charity_id: args.charityId,
    p_user_id: args.userId,
    p_import: { file_name: args.fileName.slice(0, 200) || "file.csv", file_fingerprint: args.fingerprint, confirmed_at: new Date().toISOString(), confirmation_version: CONTACT_CONFIRMATION_VERSION },
    p_contacts: args.contacts.map((c) => ({
      first_name: c.firstName, last_name: c.lastName, organisation_name: c.organisationName, email: c.email, phone: c.phone,
      address_line1: c.addressLine1, address_line2: c.addressLine2, suburb: c.suburb, city: c.city, postal_code: c.postalCode,
      note: c.note, tags: c.tags,
    })),
  });
  if (error) {
    if (/charity_contact_imports_once/.test(error.message)) return { ok: false, message: "You've already imported this exact file, so nothing was imported again. It's under Earlier imports below." };
    if (/approved charity/.test(error.message)) return { ok: false, message: "You can import donors once Givezy has approved your charity. Nothing was imported." };
    if (/charity_contacts_email/.test(error.message)) return { ok: false, message: "Someone in this file was added to your list a moment ago (the same email), so nothing was imported. Check the file again." };
    if (/up to 100 tags/.test(error.message)) return { ok: false, message: "This file would take you over 100 tags, so nothing was imported. Use fewer tags, or delete tags you no longer need, then check it again." };
    console.error("[contacts-import]", error.message);
    return { ok: false, message: "Something went wrong while saving, so nothing was imported. Please try again." };
  }
  const out = data as { import_id: string; contacts: number };
  await logAudit({ actorUserId: args.userId, action: "contacts.imported", entityType: "charity", entityId: args.charityId, details: { contacts: out.contacts, importId: out.import_id } });
  return { ok: true, importId: out.import_id, contacts: out.contacts };
}

/** Remove a whole import (its contacts, and tags it made that nothing else uses). 0 when it was already gone. */
export async function removeContactImport(charityId: string, importId: string, userId: string | null): Promise<number> {
  const { data, error } = await createAdminClient().rpc("remove_charity_contact_import", { p_charity_id: charityId, p_import_id: importId });
  if (error) throw error;
  const removed = Number(data ?? 0);
  if (removed && userId) await logAudit({ actorUserId: userId, action: "contacts.removed", entityType: "charity", entityId: charityId, details: { removed, importId } });
  return removed;
}

/** The charity's imports, newest first, with how many people each still holds. */
export async function listContactImports(charityId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("charity_contact_imports").select("id, file_name, contacts, created_at").eq("charity_id", charityId).order("created_at", { ascending: false }).limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; file_name: string; contacts: number; created_at: string }[];
}
