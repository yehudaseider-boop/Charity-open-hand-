"use client";

/**
 * Demo state for the charity portal: which charity is open, the date range, and any
 * changes made in the demo (campaigns, team, settings). Changes are kept in this browser
 * only (localStorage) and never leave it. Nothing here sends email, moves money or
 * touches a real record.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { DEMO_CHARITIES } from "./data/charities";
import { DEFAULT_LARGE_DONATION_CENTS, DEMO_TODAY, type FeeModel } from "./data/demo-config";
import { parseRandToCents } from "@/lib/money";
import { presetRange, type DateRange, type RangePreset } from "./data/selectors";
import { mockPortalApi } from "./data/service";
import type { Campaign, CampaignStatus, DemoCharity, DemoDataset, TeamMember, TeamRole } from "./data/types";

export type NotificationPrefs = {
  everyDonation: boolean;
  dailySummary: boolean;
  weeklyReport: boolean;
  largeDonation: boolean;
  largeDonationRand: string;
  failedMonthly: boolean;
  payoutSent: boolean;
  campaignGoal: boolean;
};

export type SecurityPrefs = {
  requireTwoStep: boolean;
  sessionTimeout: "15" | "30" | "60" | "240";
  exportsOwnersOnly: boolean;
  newDeviceAlerts: boolean;
};

export type BrandingPrefs = {
  logoDataUrl: string | null;
  coverTone: "blue" | "lilac" | "cream";
  thankYouMessage: string;
};

export type CharityOverrides = {
  profile?: Partial<Pick<DemoCharity, "name" | "shortName" | "tagline" | "contactEmail" | "contactPhone" | "city">>;
  campaigns?: Campaign[];
  team?: TeamMember[];
  notifications?: NotificationPrefs;
  security?: SecurityPrefs;
  branding?: BrandingPrefs;
  /** Follow-ups the team has dealt with: `${kind}:${id}` to the demo date it was marked done. */
  followUps?: Record<string, string>;
};

export const DEFAULT_NOTIFICATIONS: NotificationPrefs = {
  everyDonation: false,
  dailySummary: true,
  weeklyReport: true,
  largeDonation: true,
  largeDonationRand: "5000",
  failedMonthly: true,
  payoutSent: true,
  campaignGoal: true,
};

export const DEFAULT_SECURITY: SecurityPrefs = { requireTwoStep: true, sessionTimeout: "30", exportsOwnersOnly: false, newDeviceAlerts: true };

export const DEFAULT_BRANDING: BrandingPrefs = { logoDataUrl: null, coverTone: "blue", thankYouMessage: "Thank you. Your donation is already at work." };

export type Toast = { id: number; tone: "success" | "error" | "info"; title: string; body?: string };

type Persisted = { charityId: string; feeModel: FeeModel; overrides: Record<string, CharityOverrides> };

const STORAGE_KEY = "givezy-portal-demo.v1";

function readPersisted(): Partial<Persisted> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
  } catch {
    return {};
  }
}

function writePersisted(p: Persisted): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

type RangeState = { preset: RangePreset; range: DateRange };

type PortalState = {
  charities: DemoCharity[];
  charityId: string;
  /** Null while loading. Overrides are already applied. */
  data: DemoDataset | null;
  loading: boolean;
  feeModel: FeeModel;
  range: DateRange;
  rangePreset: RangePreset;
  overrides: CharityOverrides;
  toasts: Toast[];
  switchCharity: (id: string) => void;
  setFeeModel: (m: FeeModel) => void;
  setRange: (preset: RangePreset, custom?: DateRange) => void;
  saveCampaign: (c: Campaign) => void;
  setCampaignStatus: (id: string, status: CampaignStatus) => void;
  inviteMember: (name: string, email: string, role: TeamRole) => void;
  setMemberRole: (id: string, role: TeamRole) => void;
  removeMember: (id: string) => void;
  updateOverrides: (patch: Partial<CharityOverrides>) => void;
  /** Mark follow-ups (thank-yous and win-backs) as done, or undo. */
  markHandled: (keys: string[], on: boolean) => void;
  /** The amount from which a donation is "large", from Notifications (cents). */
  largeDonationCents: number;
  resetDemo: () => void;
  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;
};

const Ctx = createContext<PortalState | null>(null);

export function usePortal(): PortalState {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePortal must be used inside <PortalProvider>");
  return v;
}

/** The loaded dataset; only call inside screens that render after loading. */
export function useData(): DemoDataset {
  const { data } = usePortal();
  if (!data) throw new Error("Portal data not loaded yet");
  return data;
}

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const [charityId, setCharityId] = useState(DEMO_CHARITIES[1].id);
  const [feeModel, setFeeModelState] = useState<FeeModel>("charity");
  const [allOverrides, setAllOverrides] = useState<Record<string, CharityOverrides>>({});
  const [raw, setRaw] = useState<DemoDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [rangeState, setRangeState] = useState<RangeState>({ preset: "12m", range: presetRange("12m") });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const toastId = useRef(0);

  // Restore the demo from this browser once, after the first render (avoids a hydration mismatch).
  useEffect(() => {
    const p = readPersisted();
    /* eslint-disable react-hooks/set-state-in-effect -- one-time restore from browser storage */
    if (p.charityId && DEMO_CHARITIES.some((c) => c.id === p.charityId)) setCharityId(p.charityId);
    if (p.feeModel === "charity" || p.feeModel === "not_charity") setFeeModelState(p.feeModel);
    if (p.overrides && typeof p.overrides === "object") setAllOverrides(p.overrides);
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (hydrated) writePersisted({ charityId, feeModel, overrides: allOverrides });
  }, [hydrated, charityId, feeModel, allOverrides]);

  useEffect(() => {
    if (!hydrated) return;
    let live = true;
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for the mock API call */
    setLoading(true);
    mockPortalApi.loadCharity(charityId, feeModel).then((ds) => {
      if (!live) return;
      setRaw(ds);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [hydrated, charityId, feeModel]);

  const overrides = useMemo(() => allOverrides[charityId] ?? {}, [allOverrides, charityId]);

  const data = useMemo<DemoDataset | null>(() => {
    if (!raw || raw.charity.id !== charityId) return null;
    return {
      ...raw,
      charity: { ...raw.charity, ...overrides.profile },
      campaigns: overrides.campaigns ?? raw.campaigns,
      team: overrides.team ?? raw.team,
    };
  }, [raw, charityId, overrides]);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = ++toastId.current;
    setToasts((list) => [...list.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 5200);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((list) => list.filter((x) => x.id !== id)), []);

  const updateOverrides = useCallback(
    (patch: Partial<CharityOverrides>) => setAllOverrides((all) => ({ ...all, [charityId]: { ...all[charityId], ...patch } })),
    [charityId],
  );

  const campaigns = data?.campaigns;
  const team = data?.team;

  const value = useMemo<PortalState>(
    () => ({
      charities: DEMO_CHARITIES.map((c) => ({ ...c, ...allOverrides[c.id]?.profile })),
      charityId,
      data,
      loading: loading || !data,
      feeModel,
      range: rangeState.range,
      rangePreset: rangeState.preset,
      overrides,
      toasts,
      switchCharity: (id) => {
        if (id === charityId) return;
        setRaw(null);
        setCharityId(id);
      },
      setFeeModel: (m) => setFeeModelState(m),
      setRange: (preset, custom) => setRangeState({ preset, range: preset === "custom" ? custom ?? rangeState.range : presetRange(preset) }),
      saveCampaign: (c) => {
        const list = campaigns ?? [];
        const exists = list.some((x) => x.id === c.id);
        updateOverrides({ campaigns: exists ? list.map((x) => (x.id === c.id ? c : x)) : [c, ...list] });
      },
      setCampaignStatus: (id, status) => updateOverrides({ campaigns: (campaigns ?? []).map((x) => (x.id === id ? { ...x, status } : x)) }),
      inviteMember: (name, email, role) =>
        updateOverrides({ team: [...(team ?? []), { id: `tm-demo-${Date.now()}`, name, email, role, status: "invited", lastActive: null, twoStep: false }] }),
      setMemberRole: (id, role) => updateOverrides({ team: (team ?? []).map((m) => (m.id === id ? { ...m, role } : m)) }),
      removeMember: (id) => updateOverrides({ team: (team ?? []).filter((m) => m.id !== id) }),
      updateOverrides,
      markHandled: (keys, on) => {
        const next = { ...(overrides.followUps ?? {}) };
        for (const k of keys) {
          if (on) next[k] = DEMO_TODAY;
          else delete next[k];
        }
        updateOverrides({ followUps: next });
      },
      largeDonationCents: parseRandToCents(overrides.notifications?.largeDonationRand ?? DEFAULT_NOTIFICATIONS.largeDonationRand) ?? DEFAULT_LARGE_DONATION_CENTS,
      resetDemo: () => {
        setAllOverrides({});
        setFeeModelState("charity");
        setRangeState({ preset: "12m", range: presetRange("12m") });
      },
      toast,
      dismissToast,
    }),
    [charityId, data, loading, feeModel, rangeState, overrides, toasts, allOverrides, campaigns, team, updateOverrides, toast, dismissToast],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
