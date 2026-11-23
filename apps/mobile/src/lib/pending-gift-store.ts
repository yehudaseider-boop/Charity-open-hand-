import { loadOwned, saveOwned } from "./owned-storage";
import { adoptSignedOut, cleanPendingGifts, dropsRecord, type PendingGift } from "./pending-gift";

/**
 * Gifts we haven't heard the end of (see pending-gift.ts), in the phone's secure storage, one record per person.
 * Never handed to whoever signs in next (`adoptShared: false`): the check token and the email are the giver's own.
 * The one exception (23/11/2026): a gift waiting in the signed-out record that was given with the signed-in
 * account's own email moves to that person's record when their gifts are read (see adoptSignedOut).
 * A read that fails reads as "nothing waiting": the server still records the gift, and its email still arrives.
 */
const KEY = "nediv-lev.pending-gifts";
/** Gifts paid in the app with "Add my details after paying", by donation id. */
const LATER_KEY = "nediv-lev.s18a-details-later";

let queue: Promise<unknown> = Promise.resolve();
/** Read-change-write, one at a time, so two screens can't overwrite each other's change. */
function serial<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job);
  queue = next.catch(() => undefined);
  return next;
}

const listeners = new Set<() => void>();
/** Called whenever a waiting gift is kept or dropped, so another screen can show the change. */
export function onPendingGiftsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function readAll(userId: string | null): Promise<Record<string, PendingGift>> {
  try {
    const raw = await loadOwned(KEY, userId, { adoptShared: false });
    return raw ? cleanPendingGifts(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

/** The signed-in person's gifts, with any of theirs left waiting from before they signed in moved over first. */
async function readMine(userId: string | null, accountEmail: string | null | undefined): Promise<Record<string, PendingGift>> {
  const own = await readAll(userId);
  if (!userId || !accountEmail) return own;
  const shared = await readAll(null);
  const next = adoptSignedOut(shared, own, accountEmail);
  if (!next.moved) return own;
  try {
    // Theirs first, then off the shared record: a failure in between leaves it in both, never in neither.
    await saveOwned(KEY, userId, JSON.stringify(next.own));
    await saveOwned(KEY, null, JSON.stringify(next.shared));
  } catch {
    // Not moved this time: it is still in the signed-out record, and is tried again on the next read.
    return own;
  }
  return next.own;
}

/** `accountEmail`: the signed-in account's email, so a gift they left waiting while signed out is theirs again. */
export function loadPendingGifts(userId: string | null, accountEmail?: string | null): Promise<PendingGift[]> {
  return serial(async () => Object.values(await readMine(userId, accountEmail)).sort((a, b) => b.sentAt.localeCompare(a.sentAt)));
}

export async function loadPendingGift(userId: string | null, slug: string, accountEmail?: string | null): Promise<PendingGift | null> {
  return serial(async () => (await readMine(userId, accountEmail))[slug] ?? null);
}

/** Keep (or replace) the waiting gift for its charity. Resolves false if the phone couldn't save it. */
export function keepPendingGift(userId: string | null, gift: PendingGift): Promise<boolean> {
  return serial(async () => {
    try {
      const all = await readAll(userId);
      all[gift.slug] = gift;
      await saveOwned(KEY, userId, JSON.stringify(all));
      listeners.forEach((l) => l());
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * Forget a saved-card attempt, but only if the gift kept for this charity is still that attempt: an older waiting
 * gift (a payment page still being confirmed) is never dropped by mistake (review 18/11/2026).
 */
export function dropPendingAttempt(userId: string | null, slug: string, attemptId: string): Promise<void> {
  return serial(async () => {
    try {
      const all = await readAll(userId);
      if (all[slug]?.attemptId !== attemptId) return;
      delete all[slug];
      await saveOwned(KEY, userId, JSON.stringify(all));
      listeners.forEach((l) => l());
    } catch {
      // Kept: asked about again later, which never charges twice.
    }
  });
}

/**
 * Forget the waiting gift for this charity (paid, declined, not found, or the donor said they didn't pay), but only
 * if it is still the payment `reference` names: another attempt's record for the same charity is left alone.
 */
export function dropPendingGift(userId: string | null, slug: string, reference: string): Promise<void> {
  return serial(async () => {
    try {
      const all = await readAll(userId);
      if (!dropsRecord(all[slug], reference)) return;
      delete all[slug];
      await saveOwned(KEY, userId, JSON.stringify(all));
      listeners.forEach((l) => l());
    } catch {
      // Left as it was: the next check settles it again.
    }
  });
}

type Later = { id: string; at: string };
const LATER_KEEP_MS = 2 * 366 * 24 * 3_600_000;

async function readLater(userId: string | null): Promise<Later[]> {
  try {
    const raw = await loadOwned(LATER_KEY, userId, { adoptShared: false });
    const v: unknown = raw ? JSON.parse(raw) : [];
    const now = Date.now();
    return Array.isArray(v)
      ? v.filter((x): x is Later => !!x && typeof x.id === "string" && typeof x.at === "string" && now - Date.parse(x.at) < LATER_KEEP_MS)
      : [];
  } catch {
    return [];
  }
}

/** Remember that this paid gift still needs its s18A details (so Receipts doesn't count it towards a receipt yet). */
export function markDetailsLater(userId: string | null, donationId: string): Promise<void> {
  return serial(async () => {
    try {
      const list = await readLater(userId);
      if (list.some((x) => x.id === donationId)) return;
      await saveOwned(LATER_KEY, userId, JSON.stringify([...list, { id: donationId, at: new Date().toISOString() }].slice(-200)));
    } catch {
      // Not kept: Receipts then counts it as the server does.
    }
  });
}

/** The donor says they've added the details (on our website): count these gifts again. */
export function clearDetailsLater(userId: string | null, donationIds: readonly string[]): Promise<void> {
  return serial(async () => {
    try {
      const list = await readLater(userId);
      await saveOwned(LATER_KEY, userId, JSON.stringify(list.filter((x) => !donationIds.includes(x.id))));
    } catch {
      // Left as it was.
    }
  });
}

/** The ids of gifts given on this phone with "Add my details after paying". */
export async function loadDetailsLater(userId: string | null): Promise<Set<string>> {
  return serial(async () => new Set((await readLater(userId)).map((x) => x.id)));
}
