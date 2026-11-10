/**
 * Team roles, the security review's fixes (10/11/2026): a role that can't check receipts never gets a receipt's
 * preview (which shows the donor's postal address); donor care actions give a role without "message" the plain
 * refusal and change nothing; erasing a donor takes their name out of the receipt check's records.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CERTIFICATE_KINDS, TEAM_KINDS, namesFrom, scrubCertificateDetails } from "@/lib/privacy/scrub-actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
  notFound: () => {
    throw new Error("not found");
  },
}));
vi.mock("@/lib/auth", () => ({ requireViewer: async () => ({ userId: "u1" }) }));
vi.mock("@/lib/charity/queries", () => ({ loadCharityForManager: async () => ({ charity: { id: "c1", status: "approved" }, priv: null }) }));
vi.mock("@/lib/charities", () => ({ canIssue18a: () => true }));
vi.mock("@/lib/receipts/runs", () => ({ closedTaxYears: () => [2026] }));
let role = "viewer";
vi.mock("@/lib/charity/team", async () => {
  const p = await import("@/lib/charity/permissions");
  return {
    viewerCan: async (_c: string, perm: Parameters<typeof p.can>[1]) => p.can(role as Parameters<typeof p.can>[0], perm),
    refusal: async (_c: string, perm: Parameters<typeof p.can>[1]) => (p.can(role as Parameters<typeof p.can>[0], perm) ? null : p.refusedFor(perm)),
  };
});
const loaded: string[] = [];
vi.mock("@/lib/receipts/review-store", () => ({
  loadCertificate: async (_c: string, _y: number, key: string) => (loaded.push(key), null),
}));
const changed: string[] = [];
vi.mock("@/lib/charity/donor-care", () => {
  const touch = (what: string) => async () => (changed.push(what), true);
  return {
    addNote: touch("addNote"), addReminder: touch("addReminder"), deleteNote: touch("deleteNote"), deleteReminder: touch("deleteReminder"),
    deleteSegment: touch("deleteSegment"), deleteTag: touch("deleteTag"), editNote: touch("editNote"), listTags: async () => [],
    saveSegment: touch("saveSegment"), setLapsedDays: touch("setLapsedDays"), setReminderDone: touch("setReminderDone"),
    tagDonor: touch("tagDonor"), tagNamed: async () => ({ id: "t1", name: "Volunteer" }), untagDonor: touch("untagDonor"),
    donorGaveTo: async () => true,
    TooManyTags: class extends Error {},
  };
});

const C = "0b9d3c1e-5a7f-4e2b-8c6d-1f2e3a4b5c6d";
const D = "1c9d3c1e-5a7f-4e2b-8c6d-1f2e3a4b5c6d";
const N = "2d9d3c1e-5a7f-4e2b-8c6d-1f2e3a4b5c6d";

beforeEach(() => {
  loaded.length = 0;
  changed.length = 0;
});

describe("the receipt preview is for the roles that check receipts", () => {
  const open = async () => {
    const { default: Page } = await import("@/app/charity-admin/[id]/receipts/certificate/page");
    return Page({ params: Promise.resolve({ id: C }), searchParams: Promise.resolve({ year: "2026", c: "key-1" }) } as never);
  };

  it("a viewer, or a fundraiser, gets a plain notice and the certificate is never loaded", async () => {
    for (const r of ["viewer", "fundraiser"]) {
      role = r;
      const page = JSON.stringify(await open());
      expect(page).toContain("Your role doesn");
      expect(loaded).toEqual([]);
    }
  });

  it("finance, an admin and the owner load it", async () => {
    for (const r of ["finance", "admin", "owner"]) {
      role = r;
      loaded.length = 0;
      await open();
      expect(loaded).toEqual(["key-1"]);
    }
  });
});

describe("donor care actions refuse a role without 'message', plainly", () => {
  const form = (o: Record<string, string> = {}) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) f.set(k, v);
    return f;
  };

  it("viewer and finance get the refusal back and nothing changes", async () => {
    const a = await import("@/app/charity-admin/[id]/donors/care-actions");
    for (const r of ["viewer", "finance"]) {
      role = r;
      const refused = { ok: false, message: expect.stringContaining("Your role doesn't include thanking or emailing donors") };
      expect(await a.addDonorNote(C, D, { ok: false }, form({ body: "Called to say thanks" }))).toEqual(refused);
      expect(await a.editDonorNote(C, D, N, { ok: false }, form({ body: "Edited" }))).toEqual(refused);
      expect(await a.deleteDonorNote(C, D, N, { ok: false }, form())).toEqual(refused);
      expect(await a.addDonorReminder(C, D, { ok: false }, form({ what: "Call", due_on: "2027-01-10" }))).toEqual(refused);
      expect(await a.markReminder(C, D, N, true, { ok: false }, form())).toEqual(refused);
      expect(await a.deleteDonorReminder(C, D, N, { ok: false }, form())).toEqual(refused);
      expect(await a.addDonorTag(C, D, { ok: false }, form({ name: "Volunteer" }))).toEqual(refused);
      expect(await a.removeDonorTag(C, D, N, { ok: false }, form())).toEqual(refused);
      expect(changed).toEqual([]);
    }
  });

  it("a fundraiser can add a note", async () => {
    role = "fundraiser";
    const a = await import("@/app/charity-admin/[id]/donors/care-actions");
    expect(await a.addDonorNote(C, D, { ok: false }, form({ body: "Called to say thanks" }))).toMatchObject({ ok: true });
    expect(changed).toEqual(["addNote"]);
  });
});

describe("erasing a donor takes their name out of the receipt check's records", () => {
  const names = namesFrom([{ first_name: "Thandi", last_name: " Mokoena " }, { organisation_name: "Mokoena Holdings" }, { first_name: null, last_name: null }]);

  it("collects the names they gave, ignoring case and spacing", () => {
    expect([...names].sort()).toEqual(["mokoena holdings", "thandi mokoena"]);
  });

  it("replaces their name and the 'next to check' name, and leaves others alone", () => {
    expect(scrubCertificateDetails({ taxYear: 2026, key: "k", name: "THANDI  Mokoena", nextName: "Sipho Dlamini" }, names)).toEqual({ taxYear: 2026, key: "k", name: "a donor", nextName: "Sipho Dlamini" });
    expect(scrubCertificateDetails({ name: "Sipho Dlamini", nextName: "Mokoena Holdings" }, names)).toEqual({ name: "Sipho Dlamini", nextName: "the next donor" });
    expect(scrubCertificateDetails({ name: "Sipho Dlamini" }, names)).toBeNull();
  });

  it("covers every receipt check action, and role changes among the team records", () => {
    expect([...CERTIFICATE_KINDS]).toEqual(["certificate_approved", "certificate_edited", "certificate_declined", "certificate_reopened"]);
    expect(TEAM_KINDS).toContain("role_changed");
  });
});
