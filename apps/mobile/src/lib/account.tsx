import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { POLICY_VERSION } from "@shared/policy";
import type { Gift, GivingKind, Receipt, Recurring } from "@/data/giving";
import { toElsewhere, type Elsewhere, type ElsewhereRow } from "./ledger";
import { secureStorage } from "./secure-storage";
import { fromCache, newArrivals, seenFrom, toCache, type Seen, toGifts, toReceipts, toRecurring, type DonationRow, type KindRow, type ReceiptRow, type RecurringRow } from "./live-giving";
import { supabase } from "./supabase";

/**
 * Who is using the app, and their real giving.
 *
 *   preview      no live database yet: screens show sample data
 *   signed-out   live, not signed in
 *   agreeing     signed in, but hasn't agreed to the current Terms and Privacy Policy
 *   signed-in    live data, read through row-level security (own rows only)
 *
 * Giving history is written by the server when the payment provider confirms a
 * payment (the webhook). The app only reads, and re-reads whenever it comes
 * back to the front, e.g. on the way back from the website after donating.
 */
export type AccountStatus = "preview" | "loading" | "signed-out" | "agreeing" | "signed-in";

/** `fromCache`: what the phone saved last time, shown until fresh data arrives (or while offline). */
type Live = { gifts: Gift[]; recurring: Recurring[]; receipts: Receipt[]; elsewhere: Elsewhere[]; loadedAt: Date; fromCache?: boolean };
type Result = { ok: true } | { ok: false; message: string };

type AccountValue = {
  status: AccountStatus;
  email: string | null;
  userId: string | null;
  live: Live | null;
  loadError: boolean;
  refreshing: boolean;
  /** Donations that arrived since the donor last looked: the app thanks them. */
  arrived: Gift[];
  dismissArrived(): void;
  sendCode(email: string): Promise<{ ok: true } | { ok: false; message: string }>;
  verifyCode(email: string, code: string): Promise<{ ok: true } | { ok: false; message: string }>;
  agree(): Promise<{ ok: true } | { ok: false; message: string }>;
  refresh(): Promise<void>;
  signOut(): Promise<void>;
  addElsewhere(e: { cents: number; date: string; recipient: string; kind: GivingKind }): Promise<Result>;
  removeElsewhere(id: string): Promise<Result>;
  setRecurringStatus(id: string, status: "active" | "paused" | "cancelled"): Promise<Result>;
};

const AccountContext = createContext<AccountValue | null>(null);

export function useAccount(): AccountValue {
  const v = useContext(AccountContext);
  if (!v) throw new Error("useAccount must be used inside AccountProvider");
  return v;
}

/** The server hands out at most 1 000 rows at a time: read page by page (up to 5 000). */
async function allPages<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 5000; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

async function loadLive(userId: string): Promise<Live> {
  const db = supabase!;
  // Only this person's own donor records: never anything an admin role could see.
  const { data: donors, error: e1 } = await db.from("donors").select("id").eq("user_id", userId);
  if (e1) throw e1;
  const donorIds = (donors ?? []).map((d) => d.id as string);
  // Giving logged by hand belongs to the account itself, not to a donor record.
  const elsewhere = await allPages<ElsewhereRow>((a, b) =>
    db.from("external_giving_entries").select("id, entry_date, recipient_text, amount_cents, kind").eq("user_id", userId).order("entry_date", { ascending: false }).order("id").range(a, b),
  );
  const loggedElsewhere = toElsewhere(elsewhere);
  if (donorIds.length === 0) return { gifts: [], recurring: [], receipts: [], elsewhere: loggedElsewhere, loadedAt: new Date() };

  const [donations, recurring, receipts] = await Promise.all([
    // Each donation carries its own maaser/chomesh/tzedaka choice.
    allPages<DonationRow & { donation_giving_kinds: { kind: string } | { kind: string }[] | null }>((a, b) =>
      db
        .from("donations")
        .select("id, paid_at, status, amount_cents, wants_18a, recurring_id, charities(slug, name_en, thank_you_en), donation_giving_kinds(kind)")
        .in("donor_id", donorIds)
        .eq("status", "paid")
        .order("paid_at", { ascending: false })
        .order("id")
        .range(a, b),
    ),
    db.from("recurring_donations").select("id, amount_cents, status, needs_gateway_sync, next_charge_at, charities(slug, name_en)").in("donor_id", donorIds),
    db
      .from("s18a_receipts")
      .select("id, tax_year, amount_cents, issued_at, status, reference:details->>receipt_reference, charity_name:details->charity->>legal_name_en")
      .in("donor_id", donorIds)
      .order("issued_at", { ascending: false }),
  ]);
  for (const r of [recurring, receipts]) if (r.error) throw r.error;
  const kinds: KindRow[] = donations.flatMap((d) => {
    const k = Array.isArray(d.donation_giving_kinds) ? d.donation_giving_kinds[0] : d.donation_giving_kinds;
    return k ? [{ donation_id: d.id, kind: k.kind }] : [];
  });
  return {
    gifts: toGifts(donations, kinds),
    recurring: toRecurring((recurring.data ?? []) as unknown as RecurringRow[]),
    receipts: toReceipts((receipts.data ?? []) as unknown as ReceiptRow[]),
    elsewhere: loggedElsewhere,
    loadedAt: new Date(),
  };
}

/** Which donations this phone has already shown the donor (ids only, on the phone). */
const seenKey = (userId: string) => `nediv-lev.seen.${userId}`;
async function loadSeen(userId: string): Promise<Seen | null> {
  try {
    const raw = await secureStorage.getItem(seenKey(userId));
    const v = raw ? (JSON.parse(raw) as Partial<Seen>) : null;
    if (!v || !Array.isArray(v.ids)) return null;
    return { ids: v.ids.filter((x): x is string => typeof x === "string"), since: typeof v.since === "string" ? v.since : null };
  } catch {
    return null;
  }
}
async function saveSeen(userId: string, seen: Seen): Promise<void> {
  try {
    await secureStorage.setItem(seenKey(userId), JSON.stringify(seen));
  } catch {
    // Not saved: at worst a thank-you shows again.
  }
}

/** The last giving loaded, on this phone only (secure storage), so the app opens instantly and works offline. */
const cacheKey = (userId: string) => `nediv-lev.giving.${userId}`;

/** true / false, or null when we couldn't find out (e.g. offline). */
async function hasAgreed(userId: string): Promise<boolean | null> {
  const { data, error } = await supabase!
    .from("consents")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", "account")
    .eq("policy_version", POLICY_VERSION)
    .limit(1);
  if (error) return null;
  return Boolean(data && data.length > 0);
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AccountStatus>(supabase ? "loading" : "preview");
  const [live, setLive] = useState<Live | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [arrived, setArrived] = useState<Gift[]>([]);
  const lastCached = useRef<string | null>(null);
  // Each sign-in check gets a number; a slow answer for an older one is ignored.
  const settleRun = useRef(0);
  const agreedFor = useRef<string | null>(null);
  const lastUser = useRef<string | null>(null);

  const settle = useCallback(async (s: Session | null) => {
    const run = ++settleRun.current;
    setSession(s);
    if (!s) {
      agreedFor.current = null;
      setLive(null);
      setLoadError(false);
      setArrived([]);
      setStatus("signed-out");
      return;
    }
    // Someone else signed in: nothing of the last person's stays on screen.
    if (lastUser.current && lastUser.current !== s.user.id) {
      setLive(null);
      setLoadError(false);
      setArrived([]);
    }
    lastUser.current = s.user.id;
    // Already checked for this person in this session: nothing to ask again.
    if (agreedFor.current === s.user.id) return setStatus("signed-in");
    const agreed = await hasAgreed(s.user.id);
    if (run !== settleRun.current) return;
    if (agreed === false) return setStatus("agreeing");
    // Agreed, or we couldn't check (offline): show their giving. The website
    // still asks for agreement before anything is saved there.
    if (agreed) agreedFor.current = s.user.id;
    setStatus("signed-in");
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => settle(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // A routine token refresh is the same person: no need to re-check anything.
      if (event === "TOKEN_REFRESHED") return setSession(s);
      settle(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [settle]);

  const userId = session?.user.id ?? null;
  // Whose data the screens may show right now. A load that finishes after
  // sign-out (or after someone else signs in) is thrown away.
  const currentUser = useRef<string | null>(null);
  currentUser.current = status === "signed-in" ? userId : null;
  const inFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase || !userId || status !== "signed-in") return;
    // One load at a time: callers share the one already running.
    if (inFlight.current) return inFlight.current;
    const uid = userId;
    const mine = () => currentUser.current === uid;
    const job = (async () => {
    setRefreshing(true);
    try {
      // Donations given with this email before signing up join the account.
      await supabase!.rpc("link_my_donations");
      const next = await loadLive(uid);
      if (!mine()) return;
      setLive(next);
      setLoadError(false);
      // Only write when the giving itself changed (not just the time it was loaded).
      const unchanged = toCache({ ...next, loadedAt: new Date(0) });
      if (unchanged !== lastCached.current) {
        lastCached.current = unchanged;
        await secureStorage.setItem(cacheKey(uid), toCache(next)).catch(() => undefined);
        // Signed out while that was being written: take it off the phone again.
        if (!mine()) await secureStorage.removeItem(cacheKey(uid)).catch(() => undefined);
      }
      // Thank the donor for anything new since they last looked, then remember it as seen.
      const seen = await loadSeen(uid);
      if (!mine()) return;
      const fresh = newArrivals(next.gifts, seen);
      if (fresh.length) setArrived((a) => [...a, ...fresh.filter((f) => !a.some((x) => x.id === f.id))]);
      await saveSeen(uid, seenFrom(next.gifts));
    } catch {
      if (mine()) setLoadError(true);
    } finally {
      setRefreshing(false);
    }
    })();
    inFlight.current = job;
    try {
      await job;
    } finally {
      inFlight.current = null;
    }
  }, [userId, status]);

  // Show what the phone saved last time straight away; fresh data replaces it.
  useEffect(() => {
    if (status !== "signed-in" || !userId) return;
    const uid = userId;
    secureStorage
      .getItem(cacheKey(uid))
      .then((raw) => {
        const cached = fromCache(raw);
        if (cached && currentUser.current === uid) setLive((l) => l ?? { ...cached, fromCache: true });
      })
      .catch(() => undefined);
  }, [status, userId]);

  // Load once signed in, and again each time the app comes back to the front.
  useEffect(() => {
    if (status !== "signed-in") return;
    refresh();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") refresh();
    });
    return () => sub.remove();
  }, [status, refresh]);

  const value = useMemo<AccountValue>(
    () => ({
      status,
      email: session?.user.email ?? null,
      userId: session?.user.id ?? null,
      live,
      loadError,
      refreshing,
      arrived,
      dismissArrived: () => setArrived([]),
      async sendCode(email) {
        if (!supabase) return { ok: false, message: "Sign-in isn't available in this preview." };
        const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
        return error ? { ok: false, message: "We couldn't send the code. Please check the address and try again in a minute." } : { ok: true };
      },
      async verifyCode(email, code) {
        if (!supabase) return { ok: false, message: "Sign-in isn't available in this preview." };
        const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: "email" });
        return error ? { ok: false, message: "That code didn't work or has expired. Check it, or ask for a new one." } : { ok: true };
      },
      async agree() {
        if (!supabase || !session) return { ok: false, message: "Please sign in again." };
        const { error } = await supabase.rpc("agree_to_policy", { p_version: POLICY_VERSION });
        if (error) return { ok: false, message: "We couldn't save that. Please try again." };
        agreedFor.current = session.user.id;
        setStatus("signed-in");
        return { ok: true };
      },
      refresh,
      async signOut() {
        // Nothing of theirs stays on the phone once they sign out.
        if (session) await secureStorage.removeItem(cacheKey(session.user.id)).catch(() => undefined);
        lastCached.current = null;
        await supabase?.auth.signOut();
        setLive(null);
        setLoadError(false);
        setArrived([]);
      },
      async addElsewhere(e) {
        if (!supabase || !session) return { ok: false, message: "Please sign in again." };
        const { error } = await supabase.from("external_giving_entries").insert({
          user_id: session.user.id,
          amount_cents: e.cents,
          entry_date: e.date,
          recipient_text: e.recipient,
          kind: e.kind,
        });
        if (error) return { ok: false, message: "We couldn't save that. Please try again." };
        await refresh();
        return { ok: true };
      },
      async removeElsewhere(id) {
        if (!supabase || !session) return { ok: false, message: "Please sign in again." };
        const { error } = await supabase.from("external_giving_entries").delete().eq("id", id).eq("user_id", session.user.id);
        if (error) return { ok: false, message: "We couldn't remove that. Please try again." };
        await refresh();
        return { ok: true };
      },
      async setRecurringStatus(id, status) {
        if (!supabase || !session) return { ok: false, message: "Please sign in again." };
        const { error } = await supabase.rpc("set_my_recurring_status", { p_id: id, p_status: status });
        if (error) return { ok: false, message: "We couldn't change that. Please try again." };
        await refresh();
        return { ok: true };
      },
    }),
    [status, session, live, loadError, refreshing, refresh, arrived],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}
