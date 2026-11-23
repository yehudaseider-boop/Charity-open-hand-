/**
 * Uploading a picture for a journey email (23/11/2026, review the same day): only someone who may message donors, only
 * once the database keeps pictures, a few at a time, only a real JPG, PNG or WebP of 4 MB or less, re-encoded at email
 * size, stored in the charity's own folder under a name we make.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const CHARITY = "11111111-2222-4333-8444-555555555555";
const state = vi.hoisted(() => ({
  refused: null as string | null,
  ready: true,
  limited: false,
  real: true,
  uploads: [] as { path: string; type: string }[],
  uploadError: null as { message: string } | null,
  cleanedSide: [] as number[],
  audits: [] as string[],
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));
vi.mock("@/lib/audit", () => ({ logAudit: async (a: { action: string }) => void state.audits.push(a.action) }));
vi.mock("@/lib/auth", () => ({ requireViewer: async () => ({ userId: "u1" }) }));
vi.mock("@/lib/charity/queries", () => ({ loadCharityForManager: async () => ({ charity: { id: CHARITY, status: "approved" } }) }));
vi.mock("@/lib/charity/team", () => ({ refusal: async () => state.refused, isOwner: async () => true }));
vi.mock("@/lib/charity/charity-actions", () => ({ recordAction: async () => "act1", same: () => false }));
vi.mock("@/lib/rate-limit", () => ({ hitRateLimit: async () => state.limited, rateLimitReached: async () => false }));
vi.mock("@/lib/charity/winback-lists", () => ({ winbackListDonors: async () => [] }));
vi.mock("@/lib/charity/journey-store", () => ({ enrolmentStates: async () => [], addExistingDonors: async () => 0, addWinbackDonors: async () => 0 }));
vi.mock("@/lib/charity/journey-write", () => ({
  journeysV2: async () => true,
  journeyPicturesReady: async () => state.ready,
  findJourney: async () => null,
  readJourneyState: async () => ({ enabled: false, switched_on_at: null, steps: [] }),
  writeJourney: async () => {},
}));
vi.mock("@/lib/charity/file-check", () => ({ isRealImage: async () => state.real }));
vi.mock("@/lib/charity/clean-image", () => ({
  cleanImage: async (file: File, side: number) => (state.cleanedSide.push(side), new Blob(["cleaned"], { type: file.type })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _b: Blob, o: { contentType: string }) => {
          if (bucket !== "charity-public") throw new Error(`wrong bucket ${bucket}`);
          state.uploads.push({ path, type: o.contentType });
          return { error: state.uploadError };
        },
      }),
    },
  }),
}));

const { uploadJourneyPicture } = await import("@/app/charity-admin/[id]/journey/actions");
const picture = (type = "image/jpeg", size = 1000) => {
  const f = new FormData();
  f.set("file", new File([new Uint8Array(size)], "photo", { type }));
  return f;
};

beforeEach(() => {
  Object.assign(state, { refused: null, ready: true, limited: false, real: true, uploads: [], uploadError: null, cleanedSide: [], audits: [] });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.test";
});

describe("uploading a journey picture", () => {
  it("stores a cleaned, email-sized picture in the charity's own folder under a name we make", async () => {
    const r = await uploadJourneyPicture(CHARITY, picture("image/png"));
    expect(r.ok).toBe(true);
    expect(state.uploads).toHaveLength(1);
    expect(state.uploads[0].path).toMatch(new RegExp(`^${CHARITY}/journey-[0-9a-f-]{36}\\.png$`));
    expect(state.uploads[0].type).toBe("image/png");
    expect(state.cleanedSide).toEqual([1200]);
    if (r.ok) expect(r.url).toBe(`https://proj.supabase.test/storage/v1/object/public/charity-public/${state.uploads[0].path}`);
    expect(state.audits).toEqual(["charity.journey_picture_uploaded"]);
  });

  it("stores the picture under the lower-case id even when the page address has capitals (review 23/11/2026)", async () => {
    const r = await uploadJourneyPicture(CHARITY.toUpperCase(), picture());
    expect(r.ok).toBe(true);
    expect(state.uploads[0].path.startsWith(`${CHARITY}/journey-`)).toBe(true);
  });

  it("refuses, and stores nothing, for someone who may not message donors, before the database keeps pictures, or too many at once", async () => {
    state.refused = "Your role doesn't include emailing donors.";
    expect(await uploadJourneyPicture(CHARITY, picture())).toEqual({ ok: false, message: "Your role doesn't include emailing donors." });
    state.refused = null;
    state.ready = false;
    expect(await uploadJourneyPicture(CHARITY, picture())).toMatchObject({ ok: false, message: expect.stringMatching(/can't be added/) });
    state.ready = true;
    state.limited = true;
    expect(await uploadJourneyPicture(CHARITY, picture())).toMatchObject({ ok: false, message: expect.stringMatching(/a lot of pictures/) });
    expect(state.uploads).toEqual([]);
  });

  it("refuses no file, a file that isn't a picture, another format, or one over 4 MB", async () => {
    expect(await uploadJourneyPicture(CHARITY, new FormData())).toMatchObject({ ok: false, message: "Choose a picture." });
    expect(await uploadJourneyPicture(CHARITY, picture("image/svg+xml"))).toMatchObject({ ok: false, message: expect.stringMatching(/JPG, PNG or WebP/) });
    state.real = false;
    expect(await uploadJourneyPicture(CHARITY, picture())).toMatchObject({ ok: false, message: expect.stringMatching(/JPG, PNG or WebP/) });
    state.real = true;
    expect(await uploadJourneyPicture(CHARITY, picture("image/jpeg", 5 * 1024 * 1024))).toMatchObject({ ok: false, message: expect.stringMatching(/4 MB/) });
    expect(state.uploads).toEqual([]);
  });

  it("says plainly when storing fails, and records nothing", async () => {
    state.uploadError = { message: "storage down" };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await uploadJourneyPicture(CHARITY, picture())).toMatchObject({ ok: false, message: expect.stringMatching(/didn't upload, so nothing changed/) });
    err.mockRestore();
    expect(state.audits).toEqual([]);
  });
});
