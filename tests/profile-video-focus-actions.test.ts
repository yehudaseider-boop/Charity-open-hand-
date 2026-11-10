/**
 * Saving the profile video and the charity's focus: only someone who manages the charity gets anywhere, only a
 * site and a video id are ever written, and each save can be taken back.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
let manages = true;
let status = "approved";
let video: { provider: string; id: string } | null = null;
let focusRow: Record<string, unknown> | null = null;
let available = true;
const writes: unknown[] = [];
const recorded: { kind: string; details: Record<string, unknown>; undo: unknown }[] = [];
const told: string[] = [];
const CAMPAIGN = "11111111-1111-4111-8111-111111111111";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));
vi.mock("@/lib/auth", () => ({ requireViewer: async () => ({ userId: "u1", email: "admin@x.co" }) }));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/charity/queries", () => ({
  // As the real one does for a stranger (another charity's admin included): "not found", before anything is read.
  loadCharityForManager: async () => {
    if (!manages) throw new Error("not-found");
    return { charity: { id: "c1", slug: "meals", name_en: "Meals Fund", status }, priv: null, categoryIds: [] };
  },
}));
vi.mock("@/lib/charity/charity-actions", () => ({
  recordAction: async (_c: string, _u: string, kind: string, details: Record<string, unknown>, undo: unknown) => (recorded.push({ kind, details, undo }), "a1"),
}));
vi.mock("@/lib/charity/emails", () => ({ notifyCharity: async (m: string) => void told.push(m), publicChangeEmail: (_to: string, _n: string, _id: string, what: string) => what }));
vi.mock("@/lib/charity/clean-image", () => ({ cleanImage: async () => new Uint8Array() }));
vi.mock("@/lib/charity/file-check", () => ({ isRealImage: async () => true }));
vi.mock("@/lib/charity/campaign-queries", () => ({
  loadCampaigns: async () => [
    { id: CAMPAIGN, title: "Winter blanket drive", status: "active", endsAt: null },
    { id: "22222222-2222-4222-8222-222222222222", title: "Last year's drive", status: "ended", endsAt: null },
  ],
}));
vi.mock("@/lib/charity/profile-extras", () => ({
  loadVideo: async () => ({ available, video }),
  loadFocusForManager: async () => ({ available, row: focusRow }),
  writeFocus: async (charityId: string, row: unknown) => void writes.push({ table: "charity_focus", charityId, row }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => ({
      update: (values: unknown) => ({ eq: (_k: string, id: string) => ({ select: async () => (writes.push({ table, id, values }), { data: [{ id }], error: null }) }) }),
    }),
  }),
}));

const { removeFocus, removeVideo, saveFocus, saveVideo } = await import("@/app/charity-admin/[id]/profile/actions");
const { jhbToday, focusDay } = await import("@/lib/charity/focus");

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const day = (offset: number) => focusDay(new Date(Date.parse(`${jhbToday()}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10));
const iso = (offset: number) => new Date(Date.parse(`${jhbToday()}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
const focusForm = (o: Record<string, string> = {}) => form({ title: "Winter blankets", message: "Nights are cold.", starts_on: day(0), ends_on: day(20), ...o });

beforeEach(() => {
  process.env.ADMIN_NOTIFY_EMAIL = "review@givezy.test";
  manages = true;
  status = "approved";
  video = null;
  focusRow = null;
  available = true;
  writes.length = 0;
  recorded.length = 0;
  told.length = 0;
});

describe("someone who doesn't manage the charity", () => {
  it("another charity's admin is refused on every action, and nothing is written or recorded", async () => {
    manages = false;
    video = { provider: "youtube", id: "dQw4w9WgXcQ" };
    focusRow = { campaign_id: null, title: "Theirs", message: "Theirs.", starts_on: iso(0), ends_on: iso(5) };
    await expect(saveVideo("c1", { ok: false }, form({ video_url: "https://youtu.be/dQw4w9WgXcQ" }))).rejects.toThrow("not-found");
    await expect(removeVideo("c1", { ok: false })).rejects.toThrow("not-found");
    await expect(saveFocus("c1", { ok: false }, focusForm())).rejects.toThrow("not-found");
    await expect(removeFocus("c1", { ok: false })).rejects.toThrow("not-found");
    expect(writes).toEqual([]);
    expect(recorded).toEqual([]);
  });
});

describe("the profile video", () => {
  it("stores only the site and the video's id, tells the reviewer, and can be taken back", async () => {
    await expect(saveVideo("c1", { ok: false }, form({ video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL1" }))).rejects.toThrow(/redirect:\/charity-admin\/c1\/profile\?done=a1/);
    expect(writes).toEqual([{ table: "charities", id: "c1", values: { video_provider: "youtube", video_id: "dQw4w9WgXcQ" } }]);
    expect(recorded).toEqual([{
      kind: "video_saved", details: { site: "YouTube", had: false },
      undo: { type: "restore", table: "charities", before: { video_provider: null, video_id: null }, after: { video_provider: "youtube", video_id: "dQw4w9WgXcQ" } },
    }]);
    expect(told).toEqual(["its profile video"]);
  });

  it("a hostile or wrong link gets a plain message on the field and nothing is written", async () => {
    for (const link of ["javascript:alert(1)", "https://evil.example/watch?v=dQw4w9WgXcQ", '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>', "http://youtu.be/dQw4w9WgXcQ"]) {
      const r = await saveVideo("c1", { ok: false }, form({ video_url: link }));
      expect(r.ok, link).toBe(false);
      expect(r.fieldErrors?.video_url, link).toBeTruthy();
      expect(r.fieldErrors!.video_url, link).not.toMatch(/!/);
    }
    expect(writes).toEqual([]);
    expect(recorded).toEqual([]);
  });

  it("removing it clears both values, and Undo would put the same video back", async () => {
    video = { provider: "vimeo", id: "76979871" };
    await expect(removeVideo("c1", { ok: false })).rejects.toThrow(/redirect:.*done=a1/);
    expect(writes).toEqual([{ table: "charities", id: "c1", values: { video_provider: null, video_id: null } }]);
    expect(recorded[0]).toMatchObject({ kind: "video_removed", undo: { type: "restore", before: { video_provider: "vimeo", video_id: "76979871" }, after: { video_provider: null, video_id: null } } });
    expect(told).toEqual([]);
  });

  it("saving the same video again, or an empty box with no video, changes nothing", async () => {
    expect(await saveVideo("c1", { ok: false }, form({ video_url: "" }))).toMatchObject({ ok: false, fieldErrors: { video_url: expect.any(String) } });
    expect(await removeVideo("c1", { ok: false })).toEqual({ ok: true, message: "There is no video on your page." });
    video = { provider: "youtube", id: "dQw4w9WgXcQ" };
    expect(await saveVideo("c1", { ok: false }, form({ video_url: "https://youtu.be/dQw4w9WgXcQ" }))).toMatchObject({ ok: true });
    expect(writes).toEqual([]);
  });

  it("a charity that isn't approved yet can save it (it shows once approved), without a note to the reviewer", async () => {
    status = "pending_review";
    await expect(saveVideo("c1", { ok: false }, form({ video_url: "https://vimeo.com/76979871" }))).rejects.toThrow(/redirect/);
    expect(writes).toHaveLength(1);
    expect(told).toEqual([]);
  });

  it("where the database doesn't have it yet, says so and writes nothing", async () => {
    available = false;
    expect(await saveVideo("c1", { ok: false }, form({ video_url: "https://youtu.be/dQw4w9WgXcQ" }))).toMatchObject({ ok: false, message: expect.stringContaining("nothing was saved") });
    expect(await saveFocus("c1", { ok: false }, focusForm())).toMatchObject({ ok: false, message: expect.stringContaining("nothing was saved") });
    expect(writes).toEqual([]);
  });
});

describe("the charity's focus", () => {
  it("saves one focus with Johannesburg dates and records how to take it back", async () => {
    await expect(saveFocus("c1", { ok: false }, focusForm({ campaign_id: CAMPAIGN, title: "" }))).rejects.toThrow(/redirect:\/charity-admin\/c1\/profile\?done=a1/);
    const row = { campaign_id: CAMPAIGN, title: "Winter blanket drive", message: "Nights are cold.", starts_on: iso(0), ends_on: iso(20) };
    expect(writes).toEqual([{ table: "charity_focus", charityId: "c1", row }]);
    expect(recorded).toEqual([{ kind: "focus_saved", details: { title: "Winter blanket drive", from: day(0), to: day(20), status: "showing", had: false }, undo: { type: "focus", before: null, after: row } }]);
  });

  it("can't point at a campaign that has ended, or one that isn't the charity's", async () => {
    for (const id of ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"]) {
      expect(await saveFocus("c1", { ok: false }, focusForm({ campaign_id: id }))).toMatchObject({ ok: false, fieldErrors: { campaign_id: expect.any(String) } });
    }
    expect(writes).toEqual([]);
  });

  it("refuses dates the wrong way round or too far apart, keeping what was typed for the form", async () => {
    expect(await saveFocus("c1", { ok: false }, focusForm({ ends_on: day(0) }))).toMatchObject({ ok: false, fieldErrors: { ends_on: "The last day must be after the first day" } });
    expect(await saveFocus("c1", { ok: false }, focusForm({ ends_on: day(62) }))).toMatchObject({ ok: false, fieldErrors: { ends_on: expect.stringContaining("62 days") } });
    expect(writes).toEqual([]);
  });

  it("replacing or removing it keeps the earlier one for Undo", async () => {
    focusRow = { campaign_id: null, title: "Roof repairs", message: "The hall roof leaks.", starts_on: iso(-3), ends_on: iso(4) };
    await expect(saveFocus("c1", { ok: false }, focusForm({ starts_on: day(5) }))).rejects.toThrow(/redirect/);
    expect(recorded[0]).toMatchObject({ kind: "focus_saved", details: { status: "scheduled", had: true }, undo: { type: "focus", before: focusRow } });
    await expect(removeFocus("c1", { ok: false })).rejects.toThrow(/redirect/);
    expect(writes[1]).toEqual({ table: "charity_focus", charityId: "c1", row: null });
    expect(recorded[1]).toEqual({ kind: "focus_removed", details: { title: "Roof repairs" }, undo: { type: "focus", before: focusRow, after: null } });
    focusRow = null;
    expect(await removeFocus("c1", { ok: false })).toEqual({ ok: true, message: "You have no focus set." });
  });
});
