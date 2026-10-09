import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { POLICY_VERSION } from "@shared/policy";
import type { Gift, Receipt, Recurring } from "@/data/giving";
import { toGifts, toReceipts, toRecurring, type DonationRow, type KindRow, type ReceiptRow, type RecurringRow } from "./live-giving";
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

type Live = { gifts: Gift[]; recurring: Recurring[]; receipts: Receipt[]; loadedAt: Date };

type AccountValue = {
  status: AccountStatus;
  email: string | null;
  live: Live | null;
  loadError: boolean;
  refreshing: boolean;
  sendCode(email: string): Promise<{ ok: true } | { ok: false; message: string }>;
  verifyCode(email: string, code: string): Promise<{ ok: true } | { ok: false; message: string }>;
  agree(): Promise<{ ok: true } | { ok: false; message: string }>;
  refresh(): Promise<void>;
  signOut(): Promise<void>;
};

const AccountContext = createContext<AccountValue | null>(null);

export function useAccount(): AccountValue {
  const v = useContext(AccountContext);
  if (!v) throw new Error("useAccount must be used inside AccountProvider");
  return v;
}

async function loadLive(userId: string): Promise<Live> {
  const db = supabase!;
  // Only this person's own donor records: never anything an admin role could see.
  const { data: donors, error: e1 } = await db.from("donors").select("id").eq("user_id", userId);
  if (e1) throw e1;
  const donorIds = (donors ?? []).map((d) => d.id as string);
  if (donorIds.length === 0) return { gifts: [], recurring: [], receipts: [], loadedAt: new Date() };

  const [donations, kinds, recurring, receipts] = await Promise.all([
    db
      .from("donations")
      .select("id, paid_at, status, amount_cents, wants_18a, recurring_id, charities(slug, name_en)")
      .in("donor_id", donorIds)
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(2000),
    db.from("donation_giving_kinds").select("donation_id, kind"),
    db.from("recurring_donations").select("id, amount_cents, status, next_charge_at, charities(slug, name_en)").in("donor_id", donorIds),
    db
      .from("s18a_receipts")
      .select("id, tax_year, amount_cents, issued_at, status, reference:details->>receipt_reference, charity_name:details->charity->>legal_name_en")
      .in("donor_id", donorIds)
      .order("issued_at", { ascending: false }),
  ]);
  for (const r of [donations, kinds, recurring, receipts]) if (r.error) throw r.error;
  return {
    gifts: toGifts((donations.data ?? []) as unknown as DonationRow[], (kinds.data ?? []) as KindRow[]),
    recurring: toRecurring((recurring.data ?? []) as unknown as RecurringRow[]),
    receipts: toReceipts((receipts.data ?? []) as unknown as ReceiptRow[]),
    loadedAt: new Date(),
  };
}

async function hasAgreed(userId: string): Promise<boolean> {
  const { data } = await supabase!
    .from("consents")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", "account")
    .eq("policy_version", POLICY_VERSION)
    .limit(1);
  return Boolean(data && data.length > 0);
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AccountStatus>(supabase ? "loading" : "preview");
  const [live, setLive] = useState<Live | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const settle = useCallback(async (s: Session | null) => {
    setSession(s);
    if (!s) {
      setLive(null);
      setStatus("signed-out");
      return;
    }
    setStatus((await hasAgreed(s.user.id)) ? "signed-in" : "agreeing");
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => settle(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      settle(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [settle]);

  const refresh = useCallback(async () => {
    if (!supabase || !session || status !== "signed-in") return;
    setRefreshing(true);
    try {
      // Donations given with this email before signing up join the account.
      await supabase.rpc("link_my_donations");
      setLive(await loadLive(session.user.id));
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setRefreshing(false);
    }
  }, [session, status]);

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
      live,
      loadError,
      refreshing,
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
        setStatus("signed-in");
        return { ok: true };
      },
      refresh,
      async signOut() {
        await supabase?.auth.signOut();
        setLive(null);
      },
    }),
    [status, session, live, loadError, refreshing, refresh],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}
