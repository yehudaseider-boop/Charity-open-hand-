"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logAudit } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth";
import { checkCauseName, SUGGESTED_CAUSES, causeSlug } from "@/lib/charity/causes";
import { createAdminClient } from "@/lib/supabase/admin";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const back = (q: Record<string, string>) => `/admin/causes?${new URLSearchParams(q)}`;

function refresh() {
  revalidatePath("/admin/causes");
  revalidatePath("/charities");
  revalidatePath("/");
}

async function nextOrder(): Promise<number> {
  const { data } = await createAdminClient().from("categories").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  return (data?.sort_order ?? 0) + 10;
}

/** Add one cause at the end of the list. */
export async function addCause(formData: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();
  const checked = checkCauseName(String(formData.get("name") ?? ""));
  if (!checked.ok) redirect(back({ error: checked.code }));
  const db = createAdminClient();
  const { data: same } = await db.from("categories").select("id").eq("slug", checked.slug).maybeSingle();
  if (same) redirect(back({ error: "duplicate" }));
  const { error } = await db.from("categories").insert({ slug: checked.slug, name_en: checked.name, sort_order: await nextOrder() });
  // Two admins adding the same cause at once: the second is told it is already there.
  if (error?.code === "23505") redirect(back({ error: "duplicate" }));
  if (error) throw error;
  await logAudit({ actorUserId: admin.userId, action: "cause.added", entityType: "category", entityId: checked.slug });
  refresh();
  redirect(back({ done: "added" }));
}

/** Add whichever of the agreed launch causes are missing, in their order. */
export async function addSuggestedCauses(): Promise<void> {
  const admin = await requirePlatformAdmin();
  const db = createAdminClient();
  const { data: have, error: readError } = await db.from("categories").select("slug");
  if (readError) throw readError;
  const existing = new Set((have ?? []).map((c) => c.slug as string));
  let order = await nextOrder();
  const rows = SUGGESTED_CAUSES.filter((n) => !existing.has(causeSlug(n))).map((n) => ({ slug: causeSlug(n), name_en: n, sort_order: (order += 10) }));
  if (rows.length) {
    const { error } = await db.from("categories").insert(rows);
    if (error) throw error;
    await logAudit({ actorUserId: admin.userId, action: "cause.added", entityType: "category", entityId: null, details: { added: rows.length } });
  }
  refresh();
  redirect(back({ done: rows.length ? "added_list" : "list_there" }));
}

/** Change a cause's name. Its web address stays, so links people shared keep working. */
export async function renameCause(formData: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();
  const id = String(formData.get("id") ?? "");
  const checked = checkCauseName(String(formData.get("name") ?? ""));
  if (!uuid.test(id)) redirect(back({ error: "missing" }));
  if (!checked.ok) redirect(back({ error: checked.code }));
  const { data, error } = await createAdminClient().from("categories").update({ name_en: checked.name }).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) redirect(back({ error: "missing" }));
  await logAudit({ actorUserId: admin.userId, action: "cause.renamed", entityType: "category", entityId: id, details: { name: checked.name } });
  refresh();
  redirect(back({ done: "renamed" }));
}

/** Move a cause one place up or down the list (the order donors see). */
export async function moveCause(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const id = String(formData.get("id") ?? "");
  const dir = formData.get("dir") === "up" ? "up" : "down";
  const db = createAdminClient();
  const { data: all, error } = await db.from("categories").select("id, sort_order").order("sort_order").order("name_en");
  if (error) throw error;
  const list = all ?? [];
  const i = list.findIndex((c) => c.id === id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) redirect(back({}));
  // Renumber the whole list in steps of 10 with the two swapped, so equal numbers never get stuck.
  [list[i], list[j]] = [list[j], list[i]];
  for (const [n, c] of list.entries()) {
    const { error: e } = await db.from("categories").update({ sort_order: (n + 1) * 10 }).eq("id", c.id);
    if (e) throw e;
  }
  refresh();
  redirect(back({}));
}

/** Remove a cause no charity has chosen. One that is in use stays: charities would lose it from their page. */
export async function removeCause(formData: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();
  const id = String(formData.get("id") ?? "");
  if (!uuid.test(id)) redirect(back({ error: "missing" }));
  const db = createAdminClient();
  const { count } = await db.from("charity_categories").select("charity_id", { count: "exact", head: true }).eq("category_id", id);
  if (count) redirect(back({ error: "in_use" }));
  const { data: gone, error } = await db.from("categories").delete().eq("id", id).select("id");
  // A charity chose it after the count above: the database refuses (it never silently drops their choice).
  if (error?.code === "23503") redirect(back({ error: "in_use" }));
  if (error) throw error;
  if (!gone?.length) redirect(back({ error: "missing" }));
  await logAudit({ actorUserId: admin.userId, action: "cause.removed", entityType: "category", entityId: id });
  refresh();
  redirect(back({ done: "removed" }));
}
