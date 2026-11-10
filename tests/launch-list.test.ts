/**
 * The landing page's "Notify me at launch" (10/11/2026): what counts as an email, the bot trap, the stop link, which
 * door a link opens, and the action: off by default, nothing saved for a bot or a bad address, rate limited, and a
 * plain answer whatever happens. Wording follows CLAUDE.md (no exclamation marks, no em dashes).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LAUNCH_LIST_CONSENT, LAUNCH_LIST_MESSAGES, checkLaunchListEmail, doorFromHash, isBot, isStopToken } from "@/lib/launch-list";
import { initialFormState } from "@/lib/form";

const state = vi.hoisted(() => ({ open: false, limited: false, upsert: vi.fn(), del: vi.fn(), upsertError: null as null | { code?: string; message: string } }));

vi.mock("@/config/app-links", () => ({
  get appLinks() {
    return { appStoreUrl: null, playStoreUrl: null, launchMonth: "January 2027", launchListOpen: state.open };
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "198.51.100.7" }) }));
vi.mock("@/lib/rate-limit", () => ({ hitRateLimit: async () => state.limited, ipKeys: (ip: string) => [`ip:${ip}`] }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      upsert: (row: unknown, opts: unknown) => {
        state.upsert(row, opts);
        return Promise.resolve({ error: state.upsertError });
      },
      delete: () => ({
        eq: (col: string, val: string) => {
          state.del(col, val);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
}));

const { joinLaunchList, leaveLaunchList } = await import("@/app/launch-list/actions");
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

beforeEach(() => {
  state.open = true;
  state.limited = false;
  state.upsertError = null;
  state.upsert.mockReset();
  state.del.mockReset();
});

describe("an email for the launch list", () => {
  it("is trimmed and lower-cased", () => {
    expect(checkLaunchListEmail("  Thandi@Example.CO.ZA ")).toEqual({ ok: true, email: "thandi@example.co.za" });
  });
  it("must be a plain address", () => {
    for (const bad of ["", "   ", "thandi", "thandi@", "@example.com", "thandi @example.com", "thandi@example", "<a@b.co>", `${"a".repeat(250)}@b.co`]) {
      expect(checkLaunchListEmail(bad).ok).toBe(false);
    }
    expect(checkLaunchListEmail("").ok === false && checkLaunchListEmail("")).toMatchObject({ message: LAUNCH_LIST_MESSAGES.empty });
  });
});

describe("the small helpers", () => {
  it("spot a bot by the hidden field", () => {
    expect(isBot("http://spam")).toBe(true);
    expect(isBot("")).toBe(false);
    expect(isBot(null)).toBe(false);
  });
  it("accept only a uuid as a stop token", () => {
    expect(isStopToken("2f1c9a1e-3b7d-4c55-9a1e-1234567890ab")).toBe(true);
    expect(isStopToken("../../etc")).toBe(false);
    expect(isStopToken(undefined)).toBe(false);
  });
  it("read the door from the address", () => {
    expect(doorFromHash("#give")).toBe("give");
    expect(doorFromHash("#CHARITY")).toBe("charity");
    expect(doorFromHash("#how")).toBeNull();
    expect(doorFromHash("")).toBeNull();
  });
  it("keep the wording plain", () => {
    for (const text of [LAUNCH_LIST_CONSENT.text, ...Object.values(LAUNCH_LIST_MESSAGES)]) {
      expect(text).not.toMatch(/[!—]/);
    }
  });
});

describe("joining the launch list", () => {
  it("saves nothing while the list is switched off", async () => {
    state.open = false;
    expect(await joinLaunchList(initialFormState, form({ email: "thandi@example.test" }))).toEqual({ ok: false, message: LAUNCH_LIST_MESSAGES.closed });
    expect(state.upsert).not.toHaveBeenCalled();
  });
  it("tells a bot it's done and saves nothing", async () => {
    expect(await joinLaunchList(initialFormState, form({ email: "thandi@example.test", website: "x" }))).toEqual({ ok: true, message: LAUNCH_LIST_MESSAGES.done });
    expect(state.upsert).not.toHaveBeenCalled();
  });
  it("points at the field for a bad address", async () => {
    expect(await joinLaunchList(initialFormState, form({ email: "nope" }))).toMatchObject({ ok: false, fieldErrors: { email: LAUNCH_LIST_MESSAGES.invalid } });
    expect(state.upsert).not.toHaveBeenCalled();
  });
  it("stops after too many tries from one address", async () => {
    state.limited = true;
    expect(await joinLaunchList(initialFormState, form({ email: "thandi@example.test" }))).toEqual({ ok: false, message: LAUNCH_LIST_MESSAGES.tooMany });
    expect(state.upsert).not.toHaveBeenCalled();
  });
  it("saves the address with the consent version, and says the same thing if it was already there", async () => {
    expect(await joinLaunchList(initialFormState, form({ email: " Thandi@Example.test " }))).toEqual({ ok: true, message: LAUNCH_LIST_MESSAGES.done });
    expect(state.upsert).toHaveBeenCalledWith(
      { email: "thandi@example.test", consent_version: LAUNCH_LIST_CONSENT.version, source: "landing" },
      { onConflict: "email", ignoreDuplicates: true },
    );
  });
  it("says the list isn't open when its table isn't on the database yet", async () => {
    state.upsertError = { code: "PGRST205", message: "no table" };
    expect(await joinLaunchList(initialFormState, form({ email: "thandi@example.test" }))).toEqual({ ok: false, message: LAUNCH_LIST_MESSAGES.closed });
  });
  it("says plainly that nothing was saved when the database fails", async () => {
    state.upsertError = { code: "XX000", message: "down" };
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await joinLaunchList(initialFormState, form({ email: "thandi@example.test" }))).toEqual({ ok: false, message: LAUNCH_LIST_MESSAGES.failed });
  });
});

describe("leaving the launch list", () => {
  it("removes by token, and answers the same whether or not the address was there", async () => {
    const token = "2f1c9a1e-3b7d-4c55-9a1e-1234567890ab";
    expect(await leaveLaunchList(initialFormState, form({ token }))).toMatchObject({ ok: true });
    expect(state.del).toHaveBeenCalledWith("stop_token", token);
  });
  it("refuses a broken link without touching anything", async () => {
    expect(await leaveLaunchList(initialFormState, form({ token: "nope" }))).toMatchObject({ ok: false });
    expect(state.del).not.toHaveBeenCalled();
  });
});
