import { useCallback, useEffect, useState } from "react";
import { causes as sampleCauses, charities as sampleCharities, findCharity, type Cause, type Charity } from "@/data/sample";
import { CHARITY_COLUMNS, raisingNow, toCampaigns, toCauses, toCharity, toPhotos, toUpdates, type CampaignRow, type CategoryRow, type CharityRow, type RaisingNow, type PhotoRow, type ProgressRow, type UpdateRow } from "./live-charities";
import { supabase } from "./supabase";
import { secureStorage } from "./secure-storage";

/**
 * The charity directory. Live: approved charities from the database (row-level
 * security only ever returns approved ones to the public). Preview: sample data.
 */
const base = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
type Directory = { charities: Charity[]; causes: Cause[]; raising: RaisingNow[] };
let cached: Directory | null = null;
/** When `cached` came from the phone's saved copy, the time it was saved; null once fresh from the server. */
let cachedSavedAt: Date | null = null;

/**
 * The last directory seen, kept on the phone so Discover and Home still open without a connection.
 * Public information only (approved charities), so it is kept after sign-out. Capped so it stays small.
 */
const SAVED_KEY = "nediv-lev.directory";
const SAVED_MAX_CHARITIES = 120;
let lastSaved = "";

async function readSaved(): Promise<{ savedAt: Date; data: Directory } | null> {
  try {
    const raw = await secureStorage.getItem(SAVED_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { savedAt?: string; data?: Directory };
    const savedAt = new Date(v.savedAt ?? "");
    if (!v.data || !Array.isArray(v.data.charities) || !Array.isArray(v.data.causes) || Number.isNaN(savedAt.getTime())) return null;
    lastSaved = JSON.stringify(v.data);
    // Dates come back from JSON as text: put them back as dates.
    const raising = (Array.isArray(v.data.raising) ? v.data.raising : []).map((r) => ({
      ...r,
      campaign: { ...r.campaign, endsAt: r.campaign.endsAt ? new Date(r.campaign.endsAt as unknown as string) : null },
    }));
    return { savedAt, data: { charities: v.data.charities, causes: v.data.causes, raising } };
  } catch {
    return null;
  }
}

async function writeSaved(d: Directory): Promise<void> {
  const trimmed: Directory = { charities: d.charities.slice(0, SAVED_MAX_CHARITIES), causes: d.causes, raising: d.raising.slice(0, 10) };
  const json = JSON.stringify(trimmed);
  if (json === lastSaved) return;
  try {
    await secureStorage.setItem(SAVED_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data: trimmed }));
    lastSaved = json;
  } catch {
    // Not saved: offline, Discover shows "Try again" instead of the last list.
  }
}

/** The preview's campaigns, from the sample charities. */
function sampleRaising(): RaisingNow[] {
  return sampleCharities.flatMap((charity) => (charity.campaigns ?? []).map((campaign) => ({ campaign, charity })));
}

async function loadDirectory(): Promise<Directory> {
  const db = supabase!;
  const [charities, categories, campaigns] = await Promise.all([
    db.from("charities").select(CHARITY_COLUMNS).eq("status", "approved").order("name_en").limit(500),
    db.from("categories").select("id, name_en").order("sort_order"),
    // Row-level security only shows campaigns of approved charities.
    db.from("campaigns").select("id, charity_id, title, description, target_cents, ends_at").eq("status", "active").order("created_at", { ascending: false }).limit(30),
  ]);
  if (charities.error) throw charities.error;
  if (categories.error) throw categories.error;
  const list = ((charities.data ?? []) as unknown as CharityRow[]).map((r) => toCharity(r, base));
  // Campaigns are a bonus: if they can't load, Discover still works without the row.
  const rows = campaigns.error ? [] : ((campaigns.data ?? []) as (CampaignRow & { charity_id: string })[]);
  const progress = rows.length ? await db.rpc("campaign_progress", { p_campaign_ids: rows.map((c) => c.id) }) : { data: [] };
  return { charities: list, causes: toCauses((categories.data ?? []) as CategoryRow[], list), raising: raisingNow(rows, (progress.data ?? []) as ProgressRow[], list) };
}

/** Cause names, if the directory has loaded (live) or from the sample (preview). */
export function causeList(): Cause[] {
  return supabase ? (cached?.causes ?? []) : sampleCauses;
}

export function useDirectory() {
  const live = supabase !== null;
  const [data, setData] = useState<Directory | null>(live ? cached : { charities: sampleCharities, causes: sampleCauses, raising: sampleRaising() });
  const [savedAt, setSavedAt] = useState<Date | null>(live ? cachedSavedAt : null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!live) return;
    let current = true;
    // While the server answers, show the saved copy (if this is the first load since the app opened).
    if (!cached) {
      readSaved().then((saved) => {
        if (!current) return;
        // Another screen (or the server) got there first: show what it has.
        if (cached) {
          setData(cached);
          setSavedAt(cachedSavedAt);
          return;
        }
        if (!saved) return;
        cached = saved.data;
        cachedSavedAt = saved.savedAt;
        setData(saved.data);
        setSavedAt(saved.savedAt);
      });
    }
    loadDirectory().then(
      (next) => {
        if (!current) return;
        cached = next;
        cachedSavedAt = null;
        setData(next);
        setSavedAt(null);
        setFailed(false);
        setRefreshing(false);
        void writeSaved(next);
      },
      () => {
        if (!current) return;
        setFailed(true);
        setRefreshing(false);
      },
    );
    return () => {
      current = false;
    };
  }, [live, attempt]);
  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);
  /** Pull to refresh: the list stays while it checks. */
  const refresh = useCallback(() => {
    setRefreshing(true);
    setAttempt((n) => n + 1);
  }, []);
  /** Offline with a saved list: show it with "this is what was saved on…". */
  const offlineSince = failed && savedAt ? savedAt : null;
  return { live, data, failed, retry, refresh, refreshing, offlineSince };
}

/** One approved charity with its photos and latest updates; null when there is none with that name. */
async function loadCharity(slug: string): Promise<Charity | null> {
  const db = supabase!;
  const { data, error } = await db.from("charities").select(CHARITY_COLUMNS).eq("slug", slug).eq("status", "approved").maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as CharityRow;
  const [photos, updates, campaigns] = await Promise.all([
    db.from("charity_photos").select("id, storage_path, caption_en").eq("charity_id", row.id).order("created_at"),
    db.from("charity_updates").select("id, body_en, photo_path, created_at").eq("charity_id", row.id).order("created_at", { ascending: false }).limit(5),
    db.from("campaigns").select("id, title, description, target_cents, ends_at").eq("charity_id", row.id).eq("status", "active").order("created_at", { ascending: false }).limit(3),
  ]);
  const campaignRows = (campaigns.data ?? []) as CampaignRow[];
  const progress = campaignRows.length ? await db.rpc("campaign_progress", { p_campaign_ids: campaignRows.map((c) => c.id) }) : { data: [] };
  return {
    ...toCharity(row, base),
    photos: toPhotos((photos.data ?? []) as PhotoRow[], base),
    updates: toUpdates((updates.data ?? []) as UpdateRow[], base),
    campaigns: toCampaigns(campaignRows, (progress.data ?? []) as ProgressRow[]),
  };
}

/** One charity with its photos and latest updates. */
export function useCharity(slug: string | undefined) {
  const live = supabase !== null;
  const [charity, setCharity] = useState<Charity | null | undefined>(live ? (cached?.charities.find((c) => c.slug === slug) ?? undefined) : (findCharity(slug) ?? null));
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!live || !slug) return;
    let current = true;
    loadCharity(slug).then(
      (next) => {
        if (!current) return;
        setCharity(next);
        setFailed(false);
      },
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [live, slug, attempt]);
  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);
  return { live, charity, failed, retry };
}
