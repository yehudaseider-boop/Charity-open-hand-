import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "./account";
import { mergeSaved } from "./live-charities";
import { secureStorage } from "./secure-storage";
import { supabase } from "./supabase";

/**
 * Charities the donor has saved with the heart. Signed in: on their account
 * (the favourites table, which only they can read), so they show on any
 * phone. Signed out: on this phone, and joined to the account on sign-in.
 */
type SavedValue = { slugs: string[]; isSaved(slug: string): boolean; toggle(slug: string): Promise<void> };
const SavedContext = createContext<SavedValue | null>(null);
const DEVICE_KEY = "nediv-lev.saved";

export function useSaved(): SavedValue {
  const v = useContext(SavedContext);
  if (!v) throw new Error("useSaved must be used inside SavedProvider");
  return v;
}

async function loadDevice(): Promise<string[]> {
  try {
    const v = JSON.parse((await secureStorage.getItem(DEVICE_KEY)) ?? "[]");
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string").slice(0, 200) : [];
  } catch {
    return [];
  }
}
const saveDevice = (slugs: string[]) => secureStorage.setItem(DEVICE_KEY, JSON.stringify(slugs));

async function loadAccount(userId: string): Promise<string[]> {
  const { data, error } = await supabase!
    .from("favourites")
    .select("created_at, charities(slug)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).flatMap((r) => {
    const c = r.charities as unknown as { slug: string } | { slug: string }[] | null;
    const one = Array.isArray(c) ? c[0] : c;
    return one ? [one.slug] : [];
  });
}

async function addToAccount(userId: string, slugs: string[]): Promise<void> {
  if (!slugs.length) return;
  const { data, error } = await supabase!.from("charities").select("id").in("slug", slugs).eq("status", "approved");
  if (error) throw error;
  if (!data?.length) return;
  const up = await supabase!
    .from("favourites")
    .upsert(data.map((c) => ({ user_id: userId, charity_id: c.id as string })), { onConflict: "user_id,charity_id", ignoreDuplicates: true });
  if (up.error) throw up.error;
}

export function SavedProvider({ children }: { children: React.ReactNode }) {
  const account = useAccount();
  const userId = account.status === "signed-in" ? account.userId : null;
  const [slugs, setSlugs] = useState<string[]>([]);

  useEffect(() => {
    let stale = false;
    (async () => {
      const device = await loadDevice();
      if (!userId || !supabase) {
        if (!stale) setSlugs(device);
        return;
      }
      try {
        // Anything saved on this phone before signing in joins the account.
        if (device.length) {
          await addToAccount(userId, device);
          await secureStorage.removeItem(DEVICE_KEY).catch(() => undefined);
        }
        const mine = await loadAccount(userId);
        if (!stale) setSlugs(mergeSaved(mine, []));
      } catch {
        if (!stale) setSlugs(device);
      }
    })();
    return () => {
      stale = true;
    };
  }, [userId]);

  // The current list, so quick taps build on each other rather than on an old copy.
  const current = useRef<string[]>([]);
  current.current = slugs;
  const writes = useRef(Promise.resolve());

  const toggle = useCallback(
    async (slug: string) => {
      const was = current.current.includes(slug);
      const apply = (list: string[], save: boolean) => (save ? mergeSaved(list.filter((s) => s !== slug), [slug]) : list.filter((s) => s !== slug));
      current.current = apply(current.current, !was);
      setSlugs(current.current);
      // Saves go one after another, in the order they were tapped.
      const job = writes.current.then(async () => {
        try {
          if (userId && supabase) {
            if (was) {
              const { data, error } = await supabase.from("charities").select("id").eq("slug", slug).maybeSingle();
              if (error) throw error;
              if (data) {
                const del = await supabase.from("favourites").delete().eq("user_id", userId).eq("charity_id", data.id);
                if (del.error) throw del.error;
              }
            } else {
              await addToAccount(userId, [slug]);
            }
          } else {
            await saveDevice(current.current);
          }
        } catch {
          // Not saved: undo just this one.
          current.current = apply(current.current, was);
          setSlugs(current.current);
        }
      });
      writes.current = job;
      await job;
    },
    [userId],
  );

  const value = useMemo<SavedValue>(() => ({ slugs, isSaved: (s) => slugs.includes(s), toggle }), [slugs, toggle]);
  return <SavedContext value={value}>{children}</SavedContext>;
}
