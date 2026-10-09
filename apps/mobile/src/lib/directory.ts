import { useCallback, useEffect, useState } from "react";
import { causes as sampleCauses, charities as sampleCharities, findCharity, type Cause, type Charity } from "@/data/sample";
import { CHARITY_COLUMNS, toCauses, toCharity, toPhotos, toUpdates, type CategoryRow, type CharityRow, type PhotoRow, type UpdateRow } from "./live-charities";
import { supabase } from "./supabase";

/**
 * The charity directory. Live: approved charities from the database (row-level
 * security only ever returns approved ones to the public). Preview: sample data.
 */
const base = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
type Directory = { charities: Charity[]; causes: Cause[] };
let cached: Directory | null = null;

async function loadDirectory(): Promise<Directory> {
  const db = supabase!;
  const [charities, categories] = await Promise.all([
    db.from("charities").select(CHARITY_COLUMNS).eq("status", "approved").order("name_en").limit(500),
    db.from("categories").select("id, name_en").order("sort_order"),
  ]);
  if (charities.error) throw charities.error;
  if (categories.error) throw categories.error;
  const list = ((charities.data ?? []) as unknown as CharityRow[]).map((r) => toCharity(r, base));
  return { charities: list, causes: toCauses((categories.data ?? []) as CategoryRow[], list) };
}

/** Cause names, if the directory has loaded (live) or from the sample (preview). */
export function causeList(): Cause[] {
  return supabase ? (cached?.causes ?? []) : sampleCauses;
}

export function useDirectory() {
  const live = supabase !== null;
  const [data, setData] = useState<Directory | null>(live ? cached : { charities: sampleCharities, causes: sampleCauses });
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    if (!live) return;
    setFailed(false);
    try {
      cached = await loadDirectory();
      setData(cached);
    } catch {
      setFailed(true);
    }
  }, [live]);
  useEffect(() => {
    load();
  }, [load]);
  return { live, data, failed, retry: load };
}

/** One charity with its photos and latest updates. */
export function useCharity(slug: string | undefined) {
  const live = supabase !== null;
  const [charity, setCharity] = useState<Charity | null | undefined>(live ? (cached?.charities.find((c) => c.slug === slug) ?? undefined) : (findCharity(slug) ?? null));
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    if (!live || !slug) return;
    setFailed(false);
    try {
      const db = supabase!;
      const { data, error } = await db.from("charities").select(CHARITY_COLUMNS).eq("slug", slug).eq("status", "approved").maybeSingle();
      if (error) throw error;
      if (!data) return setCharity(null);
      const row = data as unknown as CharityRow;
      const [photos, updates] = await Promise.all([
        db.from("charity_photos").select("id, storage_path, caption_en").eq("charity_id", row.id).order("created_at"),
        db.from("charity_updates").select("id, body_en, photo_path, created_at").eq("charity_id", row.id).order("created_at", { ascending: false }).limit(5),
      ]);
      setCharity({
        ...toCharity(row, base),
        photos: toPhotos((photos.data ?? []) as PhotoRow[], base),
        updates: toUpdates((updates.data ?? []) as UpdateRow[], base),
      });
    } catch {
      setFailed(true);
    }
  }, [live, slug]);
  useEffect(() => {
    load();
  }, [load]);
  return { live, charity, failed, retry: load };
}
