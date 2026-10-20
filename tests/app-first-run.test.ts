/** "Small yes first": who is invited to set a goal, the "kind of giver" answer, and causes sorted first. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.mock("../apps/mobile/src/lib/secure-storage", () => ({
  secureStorage: {
    getItem: async (k: string) => store.get(k) ?? null,
    getItemStrict: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => void store.set(k, v),
    removeItem: async (k: string) => void store.delete(k),
  },
}));
// The account's profile row, as the signed-in donor's session sees it.
const profile = { giver_type: null as string | null, updates: 0, fail: false };
vi.mock("../apps/mobile/src/lib/supabase", () => ({
  supabase: {
    from: () => ({
      update: (v: { giver_type: string }) => ({
        eq: () => ({
          is: async () => {
            if (profile.fail) return { error: new Error("offline") };
            profile.updates++;
            if (profile.giver_type === null) profile.giver_type = v.giver_type;
            return { error: null };
          },
        }),
      }),
    }),
  },
}));

const { isFirstGift, shouldInviteGoal, goalInvited, markGoalInvited, goalCardDismissed, dismissGoalCard } = await import("../apps/mobile/src/lib/first-run");
const { cleanGiverType, saveGiverType, syncGiverType, GIVER_TYPES } = await import("../apps/mobile/src/lib/giver-type");
const { causesFirst } = await import("../apps/mobile/src/lib/live-charities");

beforeEach(() => {
  store.clear();
  Object.assign(profile, { giver_type: null, updates: 0, fail: false });
});

describe("the goal invitation after a first gift", () => {
  const first = { goalsReady: true, goalCount: 0, firstGift: true, confirming: false };
  it("is offered on a new donor's first confirmed gift, when they have no goal", () => {
    expect(shouldInviteGoal(first)).toBe(true);
  });
  it("is never offered to someone with a goal, or before the gift is confirmed and goals are read", () => {
    expect(shouldInviteGoal({ ...first, goalCount: 1 })).toBe(false);
    expect(shouldInviteGoal({ ...first, confirming: true })).toBe(false);
    expect(shouldInviteGoal({ ...first, goalsReady: false })).toBe(false);
    expect(shouldInviteGoal({ ...first, firstGift: false })).toBe(false);
  });
  it("counts as a first gift only for a new donor, once, and when signed in only with fresh, empty history", () => {
    const newDonor = { signedIn: false, freshHistoryEmpty: false, newDonor: true, invited: false };
    expect(isFirstGift(newDonor)).toBe(true);
    // A donor from before the new first open, giving signed out (no history to see), never gets it.
    expect(isFirstGift({ ...newDonor, newDonor: false })).toBe(false);
    expect(isFirstGift({ ...newDonor, invited: true })).toBe(false);
    // Signed in: only when the history has loaded fresh and is empty (not while loading, offline or failed).
    expect(isFirstGift({ ...newDonor, signedIn: true, freshHistoryEmpty: false })).toBe(false);
    expect(isFirstGift({ ...newDonor, signedIn: true, freshHistoryEmpty: true })).toBe(true);
  });
  it("remembers on the phone that it was shown, and that the Home card was dismissed", async () => {
    expect(await goalInvited()).toBe(false);
    await markGoalInvited();
    expect(await goalInvited()).toBe(true);
    expect(await goalCardDismissed()).toBe(false);
    await dismissGoalCard();
    expect(await goalCardDismissed()).toBe(true);
  });
});

describe("what kind of giver", () => {
  it("offers exactly the three answers", () => {
    expect(GIVER_TYPES.map((g) => g.label)).toEqual(["Regular", "Occasional", "Cause-focused"]);
    expect(cleanGiverType("regular")).toBe("regular");
    expect(cleanGiverType("whale")).toBeNull();
    expect(cleanGiverType(undefined)).toBeNull();
  });
  it("is copied to the account once signed in, and only once", async () => {
    await saveGiverType("occasional");
    await syncGiverType("user-1");
    await syncGiverType("user-1");
    expect(profile).toMatchObject({ giver_type: "occasional", updates: 1 });
  });
  it("is tried again later if the connection failed, and never overwrites an answer already on the account", async () => {
    await saveGiverType("regular");
    profile.fail = true;
    await syncGiverType("user-1");
    expect(profile.giver_type).toBeNull();
    profile.fail = false;
    profile.giver_type = "cause_focused"; // set from another phone
    await syncGiverType("user-1");
    expect(profile.giver_type).toBe("cause_focused");
  });
  it("does nothing when the donor skipped the question", async () => {
    await syncGiverType("user-1");
    expect(profile.updates).toBe(0);
  });
});

describe("charities for the chosen causes come first", () => {
  const c = (name: string, causeId: string, causeIds: string[] = []) => ({ nameEn: name, causeId, causeIds }) as never;
  const list = [c("A", "food"), c("B", "education"), c("C", "health", ["food"]), c("D", "animals")];
  const names = (l: { nameEn: string }[]) => l.map((x) => x.nameEn).join("");
  it("keeps each group in its own order and hides nothing", () => {
    expect(names(causesFirst(list, ["food"]))).toBe("ACBD");
    expect(names(causesFirst(list, ["animals", "education"]))).toBe("BDAC");
  });
  it("changes nothing when no cause was chosen", () => {
    expect(causesFirst(list, [])).toBe(list);
  });
});
