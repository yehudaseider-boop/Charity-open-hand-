import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { LAPSED_DAYS } from "./insights";
import type { SegmentFilters } from "./donor-care-rules";

/**
 * Donor care: notes, follow-up reminders, tags, saved lists and the lapsed period. Every call comes after
 * loadCharityForManager(charityId); the tables are server-only, so this uses the service role and always
 * filters by the charity. Notes, reminders and tags are only about donors who gave to the charity.
 */

export type Note = { id: string; body: string; created_at: string; edited_at: string | null; author: string | null };
export type Reminder = { id: string; donor_id: string; due_on: string; what: string; done_at: string | null; created_at: string };
export type Tag = { id: string; name: string };
export type Segment = { id: string; name: string; filters: SegmentFilters };

const db = () => createAdminClient();

/** Did this donor give to this charity (a gift that went through, or one the charity recorded)? */
export async function donorGaveTo(charityId: string, donorId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(donorId)) return false;
  const { count, error } = await db().from("donations").select("id", { count: "exact", head: true }).eq("charity_id", charityId).eq("donor_id", donorId).in("status", ["paid", "refunded", "charged_back"]);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function lapsedDaysFor(charityId: string): Promise<number> {
  const { data, error } = await db().from("charity_donor_settings").select("lapsed_after_days").eq("charity_id", charityId).maybeSingle();
  if (error) throw error;
  return (data?.lapsed_after_days as number | undefined) ?? LAPSED_DAYS;
}

export async function setLapsedDays(charityId: string, days: number): Promise<void> {
  const { error } = await db().from("charity_donor_settings").upsert({ charity_id: charityId, lapsed_after_days: days, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// Notes ---------------------------------------------------------------------------------------------------

export async function listNotes(charityId: string, donorId: string): Promise<Note[]> {
  const { data, error } = await db().from("charity_donor_notes").select("id, body, created_at, edited_at, created_by").eq("charity_id", charityId).eq("donor_id", donorId).order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  const authors = await namesOf((data ?? []).map((n) => n.created_by as string | null));
  return (data ?? []).map((n) => ({ id: n.id as string, body: n.body as string, created_at: n.created_at as string, edited_at: n.edited_at as string | null, author: n.created_by ? (authors.get(n.created_by as string) ?? null) : null }));
}

export async function addNote(charityId: string, donorId: string, body: string, userId: string): Promise<string> {
  const { data, error } = await db().from("charity_donor_notes").insert({ charity_id: charityId, donor_id: donorId, body, created_by: userId }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function editNote(charityId: string, noteId: string, body: string): Promise<boolean> {
  const { data, error } = await db().from("charity_donor_notes").update({ body, edited_at: new Date().toISOString() }).eq("id", noteId).eq("charity_id", charityId).select("id");
  if (error) throw error;
  return Boolean(data?.length);
}

export async function deleteNote(charityId: string, noteId: string): Promise<boolean> {
  const { data, error } = await db().from("charity_donor_notes").delete().eq("id", noteId).eq("charity_id", charityId).select("id");
  if (error) throw error;
  return Boolean(data?.length);
}

// Reminders -----------------------------------------------------------------------------------------------

export async function listReminders(charityId: string, donorId: string): Promise<Reminder[]> {
  const { data, error } = await db().from("charity_donor_reminders").select("id, donor_id, due_on, what, done_at, created_at").eq("charity_id", charityId).eq("donor_id", donorId).order("due_on").limit(200);
  if (error) throw error;
  return (data ?? []) as Reminder[];
}

/** Open follow-ups due on or before a day (yyyy-mm-dd), for the overview, with the donor's name. */
export async function dueReminders(charityId: string, onOrBefore: string): Promise<(Reminder & { donor_name: string })[]> {
  const { data, error } = await db()
    .from("charity_donor_reminders")
    .select("id, donor_id, due_on, what, done_at, created_at, donors(first_name, last_name, organisation_name, donor_type)")
    .eq("charity_id", charityId)
    .is("done_at", null)
    .lte("due_on", onOrBefore)
    .order("due_on")
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const d = (Array.isArray(r.donors) ? r.donors[0] : r.donors) as { first_name: string | null; last_name: string | null; organisation_name: string | null; donor_type: string } | null;
    const name = d ? (d.donor_type === "individual" ? [d.first_name, d.last_name].filter(Boolean).join(" ") : d.organisation_name) || "A donor" : "A donor";
    return { ...(r as unknown as Reminder), donor_name: name };
  });
}

export async function addReminder(charityId: string, donorId: string, what: string, dueOn: string, userId: string): Promise<string> {
  const { data, error } = await db().from("charity_donor_reminders").insert({ charity_id: charityId, donor_id: donorId, what, due_on: dueOn, created_by: userId }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

/** Mark a follow-up done, or not done again ("Undo"). */
export async function setReminderDone(charityId: string, reminderId: string, done: boolean, userId: string): Promise<boolean> {
  const { data, error } = await db()
    .from("charity_donor_reminders")
    .update(done ? { done_at: new Date().toISOString(), done_by: userId } : { done_at: null, done_by: null })
    .eq("id", reminderId)
    .eq("charity_id", charityId)
    .select("id");
  if (error) throw error;
  return Boolean(data?.length);
}

export async function deleteReminder(charityId: string, reminderId: string): Promise<boolean> {
  const { data, error } = await db().from("charity_donor_reminders").delete().eq("id", reminderId).eq("charity_id", charityId).select("id");
  if (error) throw error;
  return Boolean(data?.length);
}

// Tags ----------------------------------------------------------------------------------------------------

export async function listTags(charityId: string): Promise<Tag[]> {
  const { data, error } = await db().from("charity_tags").select("id, name").eq("charity_id", charityId).order("name");
  if (error) throw error;
  return (data ?? []) as Tag[];
}

/** The tag of this name (made if it doesn't exist yet, names match without regard to case). */
export async function tagNamed(charityId: string, name: string): Promise<Tag> {
  const tags = await listTags(charityId);
  const found = tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (found) return found;
  if (tags.length >= 100) throw new TooManyTags();
  const { data, error } = await db().from("charity_tags").insert({ charity_id: charityId, name }).select("id, name").single();
  if (error) {
    if (/charity_tags_name/.test(error.message)) return (await listTags(charityId)).find((t) => t.name.toLowerCase() === name.toLowerCase())!;
    throw error;
  }
  return data as Tag;
}
export class TooManyTags extends Error {}

/** Every tag on every donor of this charity: donor id to tag ids. */
export async function tagsByDonor(charityId: string): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from("charity_donor_tags").select("donor_id, tag_id").eq("charity_id", charityId).order("donor_id").range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) out.set(r.donor_id as string, [...(out.get(r.donor_id as string) ?? []), r.tag_id as string]);
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function tagDonor(charityId: string, donorId: string, tagId: string): Promise<void> {
  const { error } = await db().from("charity_donor_tags").upsert({ charity_id: charityId, donor_id: donorId, tag_id: tagId }, { onConflict: "tag_id,donor_id", ignoreDuplicates: true });
  if (error) throw error;
}

export async function untagDonor(charityId: string, donorId: string, tagId: string): Promise<void> {
  const { error } = await db().from("charity_donor_tags").delete().eq("charity_id", charityId).eq("donor_id", donorId).eq("tag_id", tagId);
  if (error) throw error;
}

/** Remove a tag from every donor and delete it. */
export async function deleteTag(charityId: string, tagId: string): Promise<boolean> {
  const { data, error } = await db().from("charity_tags").delete().eq("id", tagId).eq("charity_id", charityId).select("id");
  if (error) throw error;
  return Boolean(data?.length);
}

// Saved lists ---------------------------------------------------------------------------------------------

export async function listSegments(charityId: string): Promise<Segment[]> {
  const { data, error } = await db().from("charity_segments").select("id, name, filters").eq("charity_id", charityId).order("name");
  if (error) throw error;
  return (data ?? []) as Segment[];
}

export async function saveSegment(charityId: string, name: string, filters: SegmentFilters, userId: string): Promise<"saved" | "taken" | "full"> {
  const existing = await listSegments(charityId);
  if (existing.length >= 50) return "full";
  const { error } = await db().from("charity_segments").insert({ charity_id: charityId, name, filters, created_by: userId });
  if (error) {
    if (/charity_segments_name/.test(error.message)) return "taken";
    throw error;
  }
  return "saved";
}

export async function deleteSegment(charityId: string, segmentId: string): Promise<boolean> {
  const { data, error } = await db().from("charity_segments").delete().eq("id", segmentId).eq("charity_id", charityId).select("id");
  if (error) throw error;
  return Boolean(data?.length);
}

// ---------------------------------------------------------------------------------------------------------

/** Who wrote a note: the person's name or email, for "added by". */
async function namesOf(userIds: (string | null)[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((x): x is string => Boolean(x)))];
  if (!ids.length) return new Map();
  const { data, error } = await db().from("profiles").select("id, full_name, email").in("id", ids);
  if (error) return new Map();
  return new Map((data ?? []).map((p) => [p.id as string, ((p.full_name as string | null) || (p.email as string | null) || "Someone at your charity") as string]));
}
