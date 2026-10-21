import { secureStorage } from "./secure-storage";
import { supabase } from "./supabase";

/**
 * "What kind of giver are you?", asked on first open. Optional. It is kept on the phone first (the donor
 * may not be signed in yet) and copied to their account the first time they are, so it follows them to a
 * new phone. Charities never see it.
 */
export type GiverType = "regular" | "occasional" | "cause_focused";

export const GIVER_TYPES: { id: GiverType; label: string; line: string }[] = [
  { id: "regular", label: "Regular", line: "I give on a steady rhythm." },
  { id: "occasional", label: "Occasional", line: "I give now and then." },
  { id: "cause_focused", label: "Cause-focused", line: "I give when a cause matters to me." },
];

/** Only the three known answers: anything else read back from the phone is treated as "not answered". */
export function cleanGiverType(v: unknown): GiverType | null {
  return GIVER_TYPES.some((g) => g.id === v) ? (v as GiverType) : null;
}

const KEY = "nediv-lev.giver-type";
type Saved = { type: GiverType; synced: boolean };

async function read(): Promise<Saved | null> {
  try {
    const raw = await secureStorage.getItem(KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    const type = v && typeof v === "object" ? cleanGiverType((v as { type?: unknown }).type) : null;
    return type ? { type, synced: (v as { synced?: unknown }).synced === true } : null;
  } catch {
    return null;
  }
}

/** Keep the donor's answer (or clear it with null). Not saved is harmless: they are simply not asked again. */
export async function saveGiverType(type: GiverType | null): Promise<void> {
  try {
    if (type) await secureStorage.setItem(KEY, JSON.stringify({ type, synced: false } satisfies Saved));
    else await secureStorage.removeItem(KEY);
  } catch {
    // Not saved: nothing else depends on it.
  }
}

/**
 * Copy the phone's answer to the signed-in donor's account, once. An answer already on the account is
 * never overwritten (it may be newer, from another phone). A failure leaves it to try again next time.
 */
export async function syncGiverType(userId: string): Promise<void> {
  const saved = await read();
  if (!supabase || !saved || saved.synced) return;
  const { error } = await supabase.from("profiles").update({ giver_type: saved.type }).eq("id", userId).is("giver_type", null);
  if (error) return;
  try {
    await secureStorage.setItem(KEY, JSON.stringify({ type: saved.type, synced: true } satisfies Saved));
  } catch {
    // It will simply be checked again next time.
  }
}
