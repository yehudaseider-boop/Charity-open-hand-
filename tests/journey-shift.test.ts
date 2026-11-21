/**
 * Review 21/11/2026: saving a journey that moves an email to another number, while donors are part way through it,
 * is refused on the server's own reading of the saved and new emails, whatever the browser says.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { journeyStepsMoved, type JourneyStep } from "@/lib/charity/journey";

const step = (n: string, waitDays = 7): JourneyStep => ({ subject: `Email ${n}`, body: `Words of email ${n}, written for our donors.`, waitDays });
const A = step("A"), B = step("B"), C = step("C"), X = step("X");

describe("does saving move an email to another number", () => {
  it("no: words changed in place, waits changed, emails added at the end or removed from the end", () => {
    expect(journeyStepsMoved([A, B, C], [A, { ...B, body: "New words for the second email, for our donors." }, C])).toBe(false);
    expect(journeyStepsMoved([A, B, C], [A, { ...B, subject: "A new subject" }, C])).toBe(false);
    expect(journeyStepsMoved([A, B, C], [A, { ...B, waitDays: 30 }, C])).toBe(false);
    expect(journeyStepsMoved([A, B], [A, B, X])).toBe(false);
    expect(journeyStepsMoved([A, B, C], [A, B])).toBe(false);
    expect(journeyStepsMoved([A, B, C], [A, { ...B, body: "Edited while the last one goes." }])).toBe(false);
    expect(journeyStepsMoved([], [A])).toBe(false);
  });

  it("yes: one removed from the middle or the start, one put in before others, or the order changed", () => {
    expect(journeyStepsMoved([A, B, C], [A, C])).toBe(true);
    expect(journeyStepsMoved([A, B, C], [B, C])).toBe(true);
    expect(journeyStepsMoved([A, B, C], [A, X, B, C])).toBe(true);
    expect(journeyStepsMoved([A, B, C], [A, C, B])).toBe(true);
    // The middle one removed and the next one's words changed too: its subject gives it away.
    expect(journeyStepsMoved([A, B, C], [A, { ...C, body: "Changed words for what was the third email." }])).toBe(true);
    // A copy kept in its place, the middle one removed.
    expect(journeyStepsMoved([A, B, A], [A, A])).toBe(true);
  });

  // Charities often give every email the same subject (review 21/11/2026).
  const shared = (n: string): JourneyStep => ({ subject: "A note from Hope", body: `Words of email ${n}, written for our donors.`, waitDays: 7 });
  const [SA, SB, SC, SX] = [shared("A"), shared("B"), shared("C"), shared("X")];

  it("yes: the middle one removed when every email has the same subject", () => {
    expect(journeyStepsMoved([SA, SB, SC], [SA, SC])).toBe(true);
    expect(journeyStepsMoved([SA, SB, SC], [SB, SC])).toBe(true);
    expect(journeyStepsMoved([SA, SB, SC], [SA, { ...SC, subject: "A new subject" }])).toBe(true);
    expect(journeyStepsMoved([SA, SB, SC], [SA, SC, SB])).toBe(true);
  });

  it("no: the last one removed and the new last one written afresh, with shared subjects or not", () => {
    expect(journeyStepsMoved([A, B, C], [A, X])).toBe(false);
    expect(journeyStepsMoved([SA, SB, SC], [SA, SX])).toBe(false);
    expect(journeyStepsMoved([SA, SB, SC], [SA, { ...SB, body: "Edited while the last one goes." }])).toBe(false);
  });

  it("no: an email replaced by a copy of one that stays in place", () => {
    expect(journeyStepsMoved([A, B], [A, A])).toBe(false);
    expect(journeyStepsMoved([A, B, C], [A, C, C])).toBe(false);
    expect(journeyStepsMoved([A, B], [A, B, A])).toBe(false);
  });
});

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/auth", () => ({ requireViewer: async () => ({ userId: "u1" }) }));
vi.mock("@/lib/charity/queries", () => ({ loadCharityForManager: async () => ({ charity: { id: "c1", status: "approved" } }) }));
vi.mock("@/lib/charity/team", () => ({ refusal: async () => null, isOwner: async () => true }));
vi.mock("@/lib/charity/charity-actions", () => ({ recordAction: async () => "act1", same: (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b) }));
vi.mock("@/lib/rate-limit", () => ({ hitRateLimit: async () => {}, rateLimitReached: async () => false }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/charity/winback-lists", () => ({ winbackListDonors: async () => [] }));

let saved: JourneyStep[] = [];
let active = 0;
const written: unknown[] = [];
vi.mock("@/lib/charity/journey-write", () => ({
  journeysV2: async () => true,
  findJourney: async () => ({ id: "j1" }),
  readJourneyState: async () => ({ enabled: true, switched_on_at: null, steps: saved }),
  writeJourney: async (_c: string, _u: string, state: unknown) => void written.push(state),
}));
vi.mock("@/lib/charity/journey-store", () => ({
  enrolmentStates: async () => Array.from({ length: active }, () => ({ status: "active" })),
  addExistingDonors: async () => 0,
  addWinbackDonors: async () => 0,
}));

const { saveJourney } = await import("@/app/charity-admin/[id]/journey/actions");

function form(steps: JourneyStep[], shifted = "") {
  const f = new FormData();
  f.set("steps", String(steps.length));
  f.set("shifted", shifted);
  steps.forEach((s, i) => {
    f.set(`subject_${i + 1}`, s.subject);
    f.set(`body_${i + 1}`, s.body);
    f.set(`wait_${i + 1}`, String(s.waitDays));
  });
  return f;
}

beforeEach(() => {
  saved = [A, B, C];
  active = 2;
  written.length = 0;
});

describe("saving a journey while donors are part way through it", () => {
  it("refuses an email removed from the middle even when the browser doesn't say so, and saves nothing", async () => {
    const r = await saveJourney("c1", "general", { ok: false }, form([A, C]));
    expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/^2 people are part way through this journey.*Nothing was saved\.$/) });
    expect(written).toEqual([]);
  });

  it("still refuses when the browser says it moved, even if the words alone can't tell", async () => {
    const r = await saveJourney("c1", "general", { ok: false }, form([A, { ...C, subject: "All new", body: "All new words for the last email we send." }], "yes"));
    expect(r).toMatchObject({ ok: false });
    expect(written).toEqual([]);
  });

  it("saves the last email removed, or words changed in place", async () => {
    await expect(saveJourney("c1", "general", { ok: false }, form([A, B]))).rejects.toThrow(/redirect:/);
    await expect(saveJourney("c1", "general", { ok: false }, form([A, { ...B, body: "Better words for the second email, thank you." }, C]))).rejects.toThrow(/redirect:/);
    expect(written).toHaveLength(2);
  });

  it("saves the last email removed with the new last one rewritten, unless the page says it moved", async () => {
    await expect(saveJourney("c1", "general", { ok: false }, form([A, X]))).rejects.toThrow(/redirect:/);
    expect(written).toHaveLength(1);
    expect(await saveJourney("c1", "general", { ok: false }, form([A, X], "yes"))).toMatchObject({ ok: false });
    expect(written).toHaveLength(1);
  });

  it("refuses the middle one removed when every email has the same subject", async () => {
    const same = (n: string): JourneyStep => ({ subject: "A note from Hope", body: `Words of email ${n}.`, waitDays: 7 });
    saved = [same("A"), same("B"), same("C")];
    expect(await saveJourney("c1", "general", { ok: false }, form([same("A"), same("C")]))).toMatchObject({ ok: false });
    expect(written).toEqual([]);
  });

  it("with nobody part way, any change is saved", async () => {
    active = 0;
    await expect(saveJourney("c1", "general", { ok: false }, form([A, C]))).rejects.toThrow(/redirect:/);
    expect(written).toHaveLength(1);
  });
});
