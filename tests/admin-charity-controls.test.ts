/** Platform admin controls after approval: remove an admin, reset a lost authenticator, set up s18A later. */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const audits: { action: string; details?: Record<string, unknown> }[] = [];
const mails: { to: string; subject: string }[] = [];
const deleted: string[] = [];
const updates: Record<string, unknown>[] = [];
let memberRow: unknown = { user_id: "u2" };
let factors = [{ id: "f1" }];
let charity: Record<string, unknown> = {};
let documents: { document_type: string; signed_on?: string; storage_path: string }[] = [];
const ADMIN = "11111111-1111-4111-8111-111111111111";
const CH = "22222222-2222-4222-8222-222222222222";
const U2 = "33333333-3333-4333-8333-333333333333";

vi.mock("@/lib/auth", () => ({ requirePlatformAdmin: async () => ({ userId: ADMIN }) }));
vi.mock("@/lib/audit", () => ({ logAudit: async (a: { action: string; details?: Record<string, unknown> }) => void audits.push(a) }));
vi.mock("@/lib/charity/emails", async (orig) => ({ ...(await orig<object>()), notifyCharity: async (m: { to: string; subject: string }) => void mails.push(m) }));
vi.mock("@/lib/charity/queries", () => ({
  loadCharityForManager: async () => ({ charity, priv: { contact_email: "charity@x.co" }, documents }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in"]) b[m] = () => b;
      b.delete = () => {
        deleted.push(table);
        return { eq: () => ({ eq: () => ({ select: async () => ({ data: memberRow ? [memberRow] : [], error: null }) }) }) };
      };
      b.update = (row: Record<string, unknown>) => {
        updates.push({ table, ...row });
        return { eq: async () => ({ error: null }) };
      };
      b.maybeSingle = async () => ({ data: table === "profiles" ? { email: "p@x.co" } : table === "charity_admins" ? memberRow : { name_en: "Meals Fund" }, error: null });
      return b;
    },
    auth: {
      admin: {
        mfa: {
          listFactors: async () => ({ data: { factors }, error: null }),
          deleteFactor: async ({ id }: { id: string }) => (deleted.push(`factor:${id}`), { error: null }),
        },
      },
    },
  }),
}));

const { removeCharityAdmin, resetSecondStep, setUpReceipts } = await import("@/app/admin/charities/[id]/actions");
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeEach(() => {
  audits.length = mails.length = deleted.length = updates.length = 0;
  memberRow = { user_id: U2 };
  factors = [{ id: "f1" }];
  charity = { status: "approved", name_en: "Meals Fund", slug: "meals", is_s18a: false, mandate_signed_at: null, s18a_reference: null };
  documents = [];
});

describe("remove a charity admin", () => {
  it("removes the access, records it and tells the person", async () => {
    const r = await removeCharityAdmin(CH, U2, { ok: false });
    expect(r.ok).toBe(true);
    expect(deleted).toEqual(["charity_admins"]);
    expect(audits[0]).toMatchObject({ action: "charity.admin_removed", details: { email: "p@x.co" } });
    expect(mails[0]).toMatchObject({ to: "p@x.co" });
  });
  it("says so when they had already gone", async () => {
    memberRow = null;
    expect((await removeCharityAdmin(CH, U2, { ok: false })).ok).toBe(false);
    expect(audits).toHaveLength(0);
  });
});

describe("reset a lost authenticator", () => {
  it("needs a note of how the admin checked who it was", async () => {
    const r = await resetSecondStep(CH, U2, { ok: false }, form({ reason: "" }));
    expect(r.fieldErrors?.reason).toBeTruthy();
    expect(deleted).toHaveLength(0);
  });
  it("removes their factors, records the check and emails them", async () => {
    const r = await resetSecondStep(CH, U2, { ok: false }, form({ reason: "Called them on the number from the application" }));
    expect(r.ok).toBe(true);
    expect(deleted).toEqual(["factor:f1"]);
    expect(audits[0]).toMatchObject({ action: "charity.admin_second_step_reset", details: { checked: "Called them on the number from the application" } });
    expect(mails[0].subject).toMatch(/second step was reset/);
  });
  it("never for someone outside this charity, or for the admin themselves", async () => {
    memberRow = null;
    expect((await resetSecondStep(CH, U2, { ok: false }, form({ reason: "Called them" }))).ok).toBe(false);
    memberRow = { user_id: ADMIN };
    expect((await resetSecondStep(CH, ADMIN, { ok: false }, form({ reason: "Called them" }))).ok).toBe(false);
    expect(deleted).toHaveLength(0);
  });
});

describe("set up s18A after approval", () => {
  it("needs the SARS letter and the signed mandate on file", async () => {
    const r = await setUpReceipts(CH, { ok: false }, form({ s18a_reference: "930/123/45/6", confirm_s18a: "on", confirm_mandate: "on" }));
    expect(r.ok).toBe(false);
    expect(updates).toHaveLength(0);
  });
  it("confirms both, and emails the charity that receipts are set up", async () => {
    documents = [
      { document_type: "s18a_approval", storage_path: "c/s.pdf" },
      { document_type: "receipting_mandate", signed_on: "2026-10-01", storage_path: "c/m.pdf" },
    ];
    const r = await setUpReceipts(CH, { ok: false }, form({ s18a_reference: "930/123/45/6", confirm_s18a: "on", confirm_mandate: "on" }));
    expect(r.ok).toBe(true);
    expect(updates[0]).toMatchObject({ table: "charities", s18a_reference: "930/123/45/6", is_s18a: true, mandate_signed_at: "2026-10-01T00:00:00+02:00", mandate_document_path: "c/m.pdf" });
    expect(mails[0].subject).toMatch(/s18A receipts are set up/);
  });
  it("one half alone saves but doesn't promise receipts", async () => {
    documents = [{ document_type: "s18a_approval", storage_path: "c/s.pdf" }];
    const r = await setUpReceipts(CH, { ok: false }, form({ s18a_reference: "930/123/45/6", confirm_s18a: "on" }));
    expect(r.message).toMatch(/start once both/);
    expect(mails).toHaveLength(0);
  });
});
