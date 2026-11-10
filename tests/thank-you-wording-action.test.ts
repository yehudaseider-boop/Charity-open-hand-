/**
 * Saving the charity's thank-you note from the dashboard: only someone who manages that charity, empty goes
 * back to Givezy's wording, and Undo puts the previous wording back (without overwriting a newer change).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/auth", () => ({ requireViewer: async () => ({ userId: "u1", email: "admin@x.co" }) }));
vi.mock("@/lib/charity/team", () => ({ isOwner: async () => false, memberRole: async () => "admin" }));
vi.mock("@/lib/charity/thank-you-send", () => ({ sendThankYou: async () => ({ ok: true }), continueThankYou: async () => ({ ok: true }) }));

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
/** The charities this signed-in person manages. */
let manages: string[];
let nextId = 0;

function client(rowLevel: boolean) {
  return {
    storage: { from: () => ({ remove: async () => ({ error: null }) }) },
    from: (table: string) => {
      const f: ((r: Row) => boolean)[] = [];
      let op: "select" | "update" | "delete" | "insert" = "select";
      let patch: Row | null = null;
      const run = () => {
        const rows = tables[table] ?? (tables[table] = []);
        if (op === "insert") {
          const r = { id: `a0000000-0000-4000-8000-00000000000${++nextId}`, undone_at: null, created_at: new Date().toISOString(), ...(patch as Row) };
          rows.push(r);
          return { data: [r], error: null };
        }
        // Row-level security: the browser's client only reaches charities this person manages.
        const hit = rows.filter((r) => f.every((m) => m(r)) && (!rowLevel || table !== "charities" || manages.includes(r.id as string)));
        if (op === "update") hit.forEach((r) => Object.assign(r, patch));
        if (op === "delete") tables[table] = rows.filter((r) => !hit.includes(r));
        return { data: hit.map((r) => ({ ...r })), error: null };
      };
      const q: Record<string, unknown> = {
        select: () => q,
        update: (p: Row) => ((op = "update"), (patch = p), q),
        delete: () => ((op = "delete"), q),
        insert: (p: Row) => ((op = "insert"), (patch = p), q),
        eq: (c: string, v: unknown) => (f.push((r) => r[c] === v), q),
        is: (c: string, v: unknown) => (f.push((r) => (r[c] ?? null) === v), q),
        lt: (c: string, v: string) => (f.push((r) => String(r[c]) < v), q),
        single: async () => { const r = run(); return { data: r.data[0] ?? null, error: r.error }; },
        maybeSingle: async () => { const r = run(); return { data: r.data[0] ?? null, error: r.error }; },
        then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
      };
      return q;
    },
  };
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => client(false) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client(true) }));
vi.mock("@/lib/charity/queries", () => ({
  // As the real one: a 404 for anyone who doesn't manage this charity.
  loadCharityForManager: async (id: string) => {
    const charity = tables.charities.find((c) => c.id === id);
    if (!charity || !manages.includes(id)) throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    return { charity: { ...charity }, priv: null, categoryIds: [] };
  },
}));

const { saveThankYouWording } = await import("@/app/charity-admin/[id]/thank-donors/actions");
const { undoAction } = await import("@/lib/charity/charity-actions");

const MINE = "c0000000-0000-4000-8000-000000000001";
const THEIRS = "c0000000-0000-4000-8000-000000000002";
const form = (note: string, intent = "save") => {
  const f = new FormData();
  f.set("note", note);
  f.set("intent", intent);
  return f;
};
const noteOf = (id: string) => tables.charities.find((c) => c.id === id)!.thank_you_en;
const doneId = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (err: Error) => err);
  return /redirect:\/charity-admin\/[^/]+\/thank-donors\?done=(\S+)/.exec(e?.message ?? "")?.[1] ?? null;
};

beforeEach(() => {
  nextId = 0;
  manages = [MINE];
  tables = {
    charities: [
      { id: MINE, slug: "meals", name_en: "Meals Fund", status: "approved", thank_you_en: "Thank you for standing with us." },
      { id: THEIRS, slug: "books", name_en: "Books Trust", status: "approved", thank_you_en: "Their own words." },
    ],
    charity_actions: [],
  };
});

describe("saving the thank-you note", () => {
  it("another charity's admin is refused, and nothing changes", async () => {
    await expect(saveThankYouWording(THEIRS, { ok: false }, form("Now it says what I want."))).rejects.toThrow(/404/);
    await expect(saveThankYouWording(THEIRS, { ok: false }, form("", "reset"))).rejects.toThrow(/404/);
    expect(noteOf(THEIRS)).toBe("Their own words.");
    expect(tables.charity_actions).toEqual([]);
  });

  it("saves the note trimmed, and records it so it can be taken back", async () => {
    expect(await doneId(saveThankYouWording(MINE, { ok: false }, form("  Your gift fills a table.\r\nThank you.  ")))).toBeTruthy();
    expect(noteOf(MINE)).toBe("Your gift fills a table.\nThank you.");
    expect(tables.charity_actions[0]).toMatchObject({
      charity_id: MINE, kind: "thank_you_wording_saved", details: { cleared: false },
      undo: { type: "restore", table: "charities", before: { thank_you_en: "Thank you for standing with us." }, after: { thank_you_en: "Your gift fills a table.\nThank you." } },
    });
  });

  it("an empty note, or \"Back to Givezy's wording\", clears it", async () => {
    expect(await doneId(saveThankYouWording(MINE, { ok: false }, form("   \n ")))).toBeTruthy();
    expect(noteOf(MINE)).toBeNull();
    tables.charities[0].thank_you_en = "Again.";
    // The reset button clears it whatever is in the box, even something that wouldn't save.
    expect(await doneId(saveThankYouWording(MINE, { ok: false }, form("x".repeat(900), "reset")))).toBeTruthy();
    expect(noteOf(MINE)).toBeNull();
    expect(tables.charity_actions[1]).toMatchObject({ details: { cleared: true } });
  });

  it("too long, or with a web address: says why and saves nothing", async () => {
    const long = await saveThankYouWording(MINE, { ok: false }, form("x".repeat(301)));
    expect(long).toMatchObject({ ok: false, fieldErrors: { note: expect.stringContaining("300 characters or fewer") } });
    const link = await saveThankYouWording(MINE, { ok: false }, form("Give again at https://example.com/pay"));
    expect(link).toMatchObject({ ok: false, fieldErrors: { note: expect.stringContaining("Leave out web addresses") } });
    expect(noteOf(MINE)).toBe("Thank you for standing with us.");
    expect(tables.charity_actions).toEqual([]);
  });

  it("markup is kept as the plain characters typed (it is escaped where it is shown)", async () => {
    await doneId(saveThankYouWording(MINE, { ok: false }, form("<script>alert(1)</script> thank you")));
    expect(noteOf(MINE)).toBe("<script>alert(1)</script> thank you");
  });

  it("saving the same note again changes nothing and records nothing", async () => {
    expect(await saveThankYouWording(MINE, { ok: false }, form("Thank you for standing with us."))).toMatchObject({ ok: true });
    expect(tables.charity_actions).toEqual([]);
  });

  it("someone who can't edit the charity (the database says no) is told nothing was saved", async () => {
    // Manages it on paper, but row-level security lets no row through (a suspended charity, say).
    const rowLevelNo = manages;
    manages = [];
    vi.doMock("@/lib/charity/queries", () => ({ loadCharityForManager: async () => ({ charity: { ...tables.charities[0] }, priv: null, categoryIds: [] }) }));
    vi.resetModules();
    const fresh = await import("@/app/charity-admin/[id]/thank-donors/actions");
    expect(await fresh.saveThankYouWording(MINE, { ok: false }, form("New words for donors."))).toEqual({ ok: false, message: "You can't edit this charity. Nothing was saved." });
    expect(noteOf(MINE)).toBe("Thank you for standing with us.");
    manages = rowLevelNo;
  });
});

describe("undo", () => {
  it("puts the previous wording back", async () => {
    const id = await doneId(saveThankYouWording(MINE, { ok: false }, form("A new note.")));
    expect(noteOf(MINE)).toBe("A new note.");
    expect(await undoAction(MINE, id!, "u1", "approved")).toMatchObject({ ok: true });
    expect(noteOf(MINE)).toBe("Thank you for standing with us.");
  });

  it("puts a cleared note back", async () => {
    const id = await doneId(saveThankYouWording(MINE, { ok: false }, form("", "reset")));
    expect(noteOf(MINE)).toBeNull();
    expect(await undoAction(MINE, id!, "u1", "approved")).toMatchObject({ ok: true });
    expect(noteOf(MINE)).toBe("Thank you for standing with us.");
  });

  it("doesn't overwrite a newer change, and another charity can't use it", async () => {
    const id = await doneId(saveThankYouWording(MINE, { ok: false }, form("A new note.")));
    tables.charities[0].thank_you_en = "Changed again from the profile page.";
    expect(await undoAction(MINE, id!, "u1", "approved")).toMatchObject({ ok: false, why: "changed" });
    expect(noteOf(MINE)).toBe("Changed again from the profile page.");
    expect(await undoAction(THEIRS, id!, "u1", "approved")).toMatchObject({ ok: false, why: "gone" });
    expect(noteOf(THEIRS)).toBe("Their own words.");
  });
});
