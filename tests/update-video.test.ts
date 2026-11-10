/**
 * A video on a charity update (CRM step 14, decided 10/11/2026: YouTube or Vimeo links only). The link is read on
 * the server and only the site and the id are kept; an odd stored row is "no video"; before the database change
 * runs, updates still post and show (without a video), and a charity who adds one is told plainly.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isMissingColumn, updateVideoColumns, VIDEO_LINK_MESSAGES, withUpdateVideos } from "@/lib/charity/video";

describe("update videos, read on their own", () => {
  const updates = [{ id: "u1", body_en: "Parcels" }, { id: "u2", body_en: "Kitchen" }, { id: "u3", body_en: "Hall" }];

  it("puts each update's video with it, and none on the rest", () => {
    const out = withUpdateVideos(updates, [
      { id: "u1", video_provider: "youtube", video_id: "dQw4w9WgXcQ" },
      { id: "u2", video_provider: null, video_id: null },
    ]);
    expect(out.map((u) => u.video)).toEqual([{ provider: "youtube", id: "dQw4w9WgXcQ" }, null, null]);
    expect(out[0].body_en).toBe("Parcels");
  });

  it("treats an odd stored row as no video, never a link built from it", () => {
    const out = withUpdateVideos(updates, [
      { id: "u1", video_provider: "youtube", video_id: "https://evil.example" },
      { id: "u2", video_provider: "tiktok", video_id: "123" },
      { id: 3, video_provider: "vimeo", video_id: "76979871" },
      null,
    ]);
    expect(out.every((u) => u.video === null)).toBe(true);
  });

  it("shows every update without a video when the video columns can't be read", () => {
    expect(withUpdateVideos(updates, null).map((u) => u.video)).toEqual([null, null, null]);
    expect(withUpdateVideos([], [{ id: "u1", video_provider: "vimeo", video_id: "76979871" }])).toEqual([]);
  });

  it("stores both columns or neither", () => {
    expect(updateVideoColumns({ provider: "vimeo", id: "76979871" })).toEqual({ video_provider: "vimeo", video_id: "76979871" });
    expect(updateVideoColumns(null)).toEqual({ video_provider: null, video_id: null });
  });

  it("knows the 'no such column yet' errors and nothing else", () => {
    expect(isMissingColumn({ code: "PGRST204" })).toBe(true);
    expect(isMissingColumn({ code: "42703" })).toBe(true);
    expect(isMissingColumn({ code: "42501" })).toBe(false);
    expect(isMissingColumn(null)).toBe(false);
  });
});

// ---- Posting an update with a video ----
vi.mock("server-only", () => ({}));
let role: "owner" | "admin" | "finance" | "fundraiser" | "viewer" = "admin";
let insertError: { code: string; message: string } | null = null;
const inserts: Record<string, unknown>[] = [];
vi.mock("@/lib/charity/team", async () => {
  const p = await import("@/lib/charity/permissions");
  return { refusal: async (_c: string, perm: Parameters<typeof p.can>[1]) => (p.can(role, perm) ? null : p.refusedFor(perm)) };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));
vi.mock("@/lib/auth", () => ({ requireViewer: async () => ({ userId: "u1", email: "admin@x.co" }) }));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/rate-limit", () => ({ hitRateLimit: async () => false }));
vi.mock("@/lib/charity/queries", () => ({ loadCharityForManager: async () => ({ charity: { id: "c1", slug: "meals", name_en: "Meals Fund", status: "approved" } }) }));
vi.mock("@/lib/charity/charity-actions", () => ({ recordAction: async () => "a1" }));
vi.mock("@/lib/charity/clean-image", () => ({ cleanImage: async () => new Uint8Array() }));
vi.mock("@/lib/charity/file-check", () => ({ isRealImage: async () => true }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ storage: { from: () => ({ remove: async () => ({}) }) } }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => ({
        select: () => ({ single: async () => (inserts.push(row), insertError ? { data: null, error: insertError } : { data: { id: "n1" }, error: null }) }),
      }),
    }),
  }),
}));

const { postUpdate } = await import("@/app/charity-admin/[id]/updates/actions");
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const ok = { ok: true } as const;

describe("posting an update with a video", () => {
  beforeEach(() => {
    role = "admin";
    insertError = null;
    inserts.length = 0;
  });

  it("keeps only the site and the id, never the link", async () => {
    await expect(postUpdate("c1", ok, form({ body_en: "Our kitchen this week.", video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s&list=PL1" }))).rejects.toThrow("redirect:");
    expect(inserts).toEqual([{ charity_id: "c1", body_en: "Our kitchen this week.", photo_path: null, video_provider: "youtube", video_id: "dQw4w9WgXcQ" }]);
    expect(JSON.stringify(inserts)).not.toContain("youtube.com");
  });

  it("posts an update without a video as before, with no video columns", async () => {
    await expect(postUpdate("c1", ok, form({ body_en: "Parcels packed.", video_url: "" }))).rejects.toThrow("redirect:");
    expect(inserts).toEqual([{ charity_id: "c1", body_en: "Parcels packed.", photo_path: null }]);
  });

  it("says plainly what's wrong with a link, and posts nothing", async () => {
    for (const [link, message] of [
      ["https://example.com/watch?v=dQw4w9WgXcQ", VIDEO_LINK_MESSAGES.otherSite],
      ['<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>', VIDEO_LINK_MESSAGES.embedCode],
      ["http://youtu.be/dQw4w9WgXcQ", VIDEO_LINK_MESSAGES.notHttps],
      ["https://vimeo.com/76979871?h=abc123", VIDEO_LINK_MESSAGES.privateVimeo],
    ]) {
      const r = await postUpdate("c1", ok, form({ body_en: "Our kitchen.", video_url: link }));
      expect(r).toEqual({ ok: false, message: "That update wasn't posted.", fieldErrors: { video_url: message } });
    }
    expect(inserts).toEqual([]);
  });

  it("before the database change runs, says videos aren't on yet and keeps what was typed", async () => {
    insertError = { code: "PGRST204", message: "Could not find the 'video_id' column" };
    const r = await postUpdate("c1", ok, form({ body_en: "Our kitchen.", video_url: "https://youtu.be/dQw4w9WgXcQ" }));
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/aren't switched on yet\. Nothing was posted/);
    expect(r.fieldErrors?.video_url).toMatch(/aren't switched on yet/);
  });

  it("refuses a role that can't change the page, before anything is read or posted", async () => {
    role = "viewer";
    const r = await postUpdate("c1", ok, form({ body_en: "Our kitchen.", video_url: "https://youtu.be/dQw4w9WgXcQ" }));
    expect(r.ok).toBe(false);
    expect(inserts).toEqual([]);
  });
});
