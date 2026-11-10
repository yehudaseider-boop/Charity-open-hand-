/**
 * The IT3(d) history's gates (CRM build plan step 15): only the charity's owner marks a download as uploaded or
 * takes the mark off, an entry of another charity can't be reached, and each download writes counts only, and
 * only after the person was checked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));

const MINE = "0f9a2c71-0b1d-4e5f-9a8b-123456789abc";
const THEIRS = "1a2b3c4d-0b1d-4e5f-9a8b-abcdefabcdef";
const C1 = "0b9d3c1e-5a7f-4e2b-8c6d-1f2e3a4b5c6d";

let owner = true;
let authorised: { userId: string } | { status: number; message: string } = { userId: "u1" };
type Entry = { charityId: string; createdAt: string; uploadedOn: string | null; reference: string | null };
let entries: Record<string, Entry> = {};
const recorded: Record<string, unknown>[] = [];
const audits: Record<string, unknown>[] = [];
let storeFails = false;

vi.mock("@/lib/auth", () => ({ requireViewer: async () => ({ userId: "u1", email: "owner@x.co" }) }));
vi.mock("@/lib/audit", () => ({ logAudit: async (a: Record<string, unknown>) => void audits.push(a) }));
vi.mock("@/lib/charity/queries", () => ({ loadCharityForManager: async () => ({ charity: { id: C1, status: "approved" }, priv: null }) }));
vi.mock("@/lib/charity/team", async () => {
  const p = await import("@/lib/charity/permissions");
  const role = () => (owner ? "owner" : "fundraiser") as "owner" | "fundraiser";
  return {
    isOwner: async () => owner,
    viewerCan: async (_c: string, perm: Parameters<typeof p.can>[1]) => p.can(role(), perm),
    refusal: async (_c: string, perm: Parameters<typeof p.can>[1]) => (p.can(role(), perm) ? null : p.refusedFor(perm)),
  };
});
vi.mock("@/lib/charity/charity-actions", () => ({ recordAction: async () => "a1" }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => { throw new Error("the actions reach the database only through the history store"); } }));
vi.mock("@/lib/charity/export", () => ({
  audit: async (a: Record<string, unknown>) => void audits.push(a),
  xlsxResponse: (_file: unknown, name: string) => new Response("sheet", { headers: { "Content-Disposition": `attachment; filename="${name}"` } }),
}));
vi.mock("@/lib/receipts/it3d-history-store", () => ({
  recordIt3dDownload: async (e: Record<string, unknown>) => {
    if (storeFails) throw new Error("IT3(d) history write failed: down");
    recorded.push(e);
  },
  loadIt3dHistoryEntry: async (charityId: string, id: string) => {
    const e = entries[id];
    return e && e.charityId === charityId ? { id, createdAt: e.createdAt, uploadedOn: e.uploadedOn, uploadReference: e.reference } : null;
  },
  markIt3dUploaded: async (a: { charityId: string; id: string; uploadedOn: string; reference: string | null }) => {
    if (storeFails) throw new Error("down");
    const e = entries[a.id];
    if (!e || e.charityId !== a.charityId || e.uploadedOn) return false;
    e.uploadedOn = a.uploadedOn;
    e.reference = a.reference;
    return true;
  },
  clearIt3dUploaded: async (a: { charityId: string; id: string }) => {
    const e = entries[a.id];
    if (!e || e.charityId !== a.charityId || !e.uploadedOn) return false;
    e.uploadedOn = null;
    e.reference = null;
    return true;
  },
}));

const SOURCE = "S".repeat(144);
const built = {
  lines: ["H|GH", "B|DE|Sarah|Example|8001015009087"],
  fileName: "I3D_1_9000000007_x_20270301T101500.psv",
  problems: [{ severity: "warning", message: "Check: Sarah Example", fix: null, donorName: "Sarah Example", idLast4: "9087" }],
  totals: { receipts: 3, donors: 2, donations: 4, totalCents: 125_000 },
  nil: false,
  fileReady: true,
  sheet: { entity: [], header: [], rows: [], amountColumn: 2 },
};
vi.mock("@/lib/receipts/it3d-request", () => ({
  authoriseIt3d: async () => authorised,
  prepareIt3d: async () => built,
  readChoice: (year: unknown, period: unknown) => (Number(year) === 2027 && (period === "full_year" || period === "first_half") ? { taxYear: 2027, period } : null),
}));
vi.mock("@/lib/receipts/it3d-store", () => ({ loadIt3dCharity: async () => ({ tradingName: "Meals Fund" }) }));
vi.mock("@/lib/receipts/it3d-sheet", () => ({ it3dCaptureSheet: () => new Uint8Array([1]) }));

const { markUploadedToSars, unmarkUploadedToSars } = await import("@/app/charity-admin/[id]/receipts/sars/actions");
const fileRoute = await import("@/app/charity-admin/[id]/receipts/sars/file/route");
const sheetRoute = await import("@/app/charity-admin/[id]/receipts/sars/sheet/route");
const { isoDateInJhb } = await import("@/lib/dates");
const { showDay } = await import("@/lib/typed-date");

const today = () => showDay(isoDateInJhb(new Date()));
const form = (over: Record<string, string> = {}) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ uploaded_on: today(), upload_reference: "", ...over })) f.set(k, v);
  return f;
};
const mark = (id: string, f = form()) => markUploadedToSars(C1, id, 2027, "full_year", { ok: false }, f);
const unmark = (id: string) => unmarkUploadedToSars(C1, id, 2027, "full_year", { ok: false }, new FormData());

beforeEach(() => {
  owner = true;
  authorised = { userId: "u1" };
  storeFails = false;
  recorded.length = 0;
  audits.length = 0;
  const createdAt = new Date(Date.now() - 3_600_000).toISOString();
  entries = { [MINE]: { charityId: C1, createdAt, uploadedOn: null, reference: null }, [THEIRS]: { charityId: "another-charity", createdAt, uploadedOn: null, reference: null } };
});

describe("marking a download as uploaded to SARS", () => {
  it("a role without downloads (a fundraiser) is refused, for the mark and for Undo, and nothing changes", async () => {
    owner = false;
    const message = "Your role doesn't include downloads or the SARS files. Nothing was downloaded or changed. Ask your charity's owner if you need them.";
    expect(await mark(MINE)).toEqual({ ok: false, message });
    entries[MINE].uploadedOn = "2026-11-10";
    expect(await unmark(MINE)).toEqual({ ok: false, message });
    expect(entries[MINE].uploadedOn).toBe("2026-11-10");
  });

  it("another charity's entry, or an id that isn't one, can't be marked or unmarked", async () => {
    for (const id of [THEIRS, "not-an-id", "'; drop table x; --"]) {
      expect(await mark(id)).toMatchObject({ ok: false, message: expect.stringContaining("couldn't find that download") });
    }
    entries[THEIRS].uploadedOn = "2026-11-10";
    expect(await unmark(THEIRS)).toMatchObject({ ok: false, message: expect.stringContaining("already been taken off") });
    expect(await unmark("not-an-id")).toMatchObject({ ok: false });
    expect(entries[THEIRS].uploadedOn).toBe("2026-11-10");
  });

  it("the owner marks it with a date and a reference, and lands back on the history", async () => {
    await expect(mark(MINE, form({ upload_reference: " eFiling 2027/00123 " }))).rejects.toThrow(`redirect:/charity-admin/${C1}/receipts/sars?year=2027&period=full_year&marked=${MINE}#sars-history`);
    expect(entries[MINE].uploadedOn).toBe(isoDateInJhb(new Date()));
    expect(entries[MINE].reference).toBe("eFiling 2027/00123");
  });

  it("Undo takes the mark off again, once", async () => {
    await expect(mark(MINE)).rejects.toThrow(/redirect:/);
    await expect(unmark(MINE)).rejects.toThrow(`redirect:/charity-admin/${C1}/receipts/sars?year=2027&period=full_year&unmarked=${MINE}#sars-history`);
    expect(entries[MINE]).toMatchObject({ uploadedOn: null, reference: null });
    expect(await unmark(MINE)).toEqual({ ok: false, message: "The mark has already been taken off. Reload the page to see it." });
  });

  it("an entry already marked isn't marked again", async () => {
    entries[MINE].uploadedOn = "2026-11-10";
    expect(await mark(MINE)).toMatchObject({ ok: false, message: expect.stringContaining("already marked as uploaded") });
    expect(entries[MINE].uploadedOn).toBe("2026-11-10");
  });

  it("empty and silly input is refused by field, and what was kept is said", async () => {
    const r = await mark(MINE, form({ uploaded_on: "", upload_reference: "8001015009087" }));
    expect(r).toEqual({
      ok: false,
      message: "Please fix the highlighted fields. Nothing was saved, and what you typed is still here.",
      fieldErrors: { uploaded_on: "Enter the date you uploaded it, as dd/mm/yyyy", upload_reference: "That looks like an ID number. Use your eFiling reference only, never a donor's details" },
    });
    expect(await mark(MINE, form({ uploaded_on: "01/01/2099" }))).toMatchObject({ ok: false, fieldErrors: { uploaded_on: expect.stringContaining("in the future") } });
    expect(entries[MINE].uploadedOn).toBeNull();
  });

  it("a database hiccup is said plainly, and nothing is changed", async () => {
    storeFails = true;
    expect(await mark(MINE)).toEqual({ ok: false, message: "That didn't save, so nothing was changed. What you typed is still here. Please try again." });
  });
});

describe("each download goes into the history", () => {
  const params = { params: Promise.resolve({ id: C1 }) } as never;
  const postFile = (test = "L") => {
    const body = new FormData();
    for (const [k, v] of Object.entries({ year: "2027", period: "full_year", test_data: test, source_identifier: SOURCE })) body.set(k, v);
    return fileRoute.POST(new Request(`https://givezy.test/charity-admin/${C1}/receipts/sars/file`, { method: "POST", body, headers: { host: "givezy.test", origin: "https://givezy.test" } }) as never, params);
  };
  const getSheet = async () => {
    const { NextRequest } = await import("next/server");
    return sheetRoute.GET(new NextRequest(`https://givezy.test/charity-admin/${C1}/receipts/sars/sheet?year=2027&period=first_half`), params);
  };

  it("the data file: counts and the total only, never a name, an ID number, the file name or the Source Identifier", async () => {
    const r = await postFile("T");
    expect(r.status).toBe(200);
    expect(recorded).toEqual([{ charity_id: C1, tax_year: 2027, period: "full_year", kind: "file", test_data: true, receipts: 3, donors: 2, donations: 4, total_cents: 125_000, receipts_left_out: 0, created_by: "u1" }]);
    const text = JSON.stringify(recorded);
    for (const secret of ["Sarah", "8001015009087", "9087", SOURCE, ".psv", "9000000007"]) expect(text).not.toContain(secret);
  });

  it("the capture sheet", async () => {
    const r = await getSheet();
    expect(r.status).toBe(200);
    expect(recorded).toEqual([{ charity_id: C1, tax_year: 2027, period: "first_half", kind: "sheet", test_data: false, receipts: 3, donors: 2, donations: 4, total_cents: 125_000, receipts_left_out: 0, created_by: "u1" }]);
  });

  it("someone who isn't the owner gets no file and leaves no entry", async () => {
    authorised = { status: 403, message: "Only your charity's owner can download the SARS files, because they hold donors' ID numbers. Nothing was downloaded." };
    expect((await postFile()).status).toBe(403);
    expect((await getSheet()).status).toBe(403);
    expect(recorded).toEqual([]);
    expect(audits).toEqual([]);
  });

  it("if the history can't be written, no file is handed over, the audit says nothing was downloaded and the message is plain", async () => {
    storeFails = true;
    for (const res of [await postFile(), await getSheet()]) {
      expect(res.status).toBe(503);
      expect(res.headers.get("Content-Disposition")).toBeNull();
      expect(await res.text()).toBe("We couldn't record this download in your history, so nothing was downloaded. Please try again.");
    }
    expect(audits).toEqual([]);
  });
});
