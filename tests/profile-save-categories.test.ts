/**
 * Saving the public profile with its categories (code review, 23/11/2026): an unknown category is refused before
 * anything is saved, and when the categories fail after the profile saved, the page says what saved, and the audit
 * (with what changed on the page), the reviewer's email and Undo still cover it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const CAT_A = "11111111-1111-4111-8111-111111111111";
const CAT_B = "22222222-2222-4222-8222-222222222222";
let known = [CAT_A, CAT_B];
let categoryError: { message: string } | null = null;
const writes: { table: string; op: string }[] = [];
const audits: { action: string; details?: Record<string, unknown> }[] = [];
const recorded: { kind: string; details: Record<string, unknown>; undo: Record<string, unknown> }[] = [];
const told: string[] = [];

vi.mock("@/lib/charity/team", () => ({ refusal: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));
vi.mock("@/lib/auth", () => ({ requireViewer: async () => ({ userId: "u1", email: "admin@x.co" }) }));
vi.mock("@/lib/audit", () => ({ logAudit: async (a: { action: string; details?: Record<string, unknown> }) => void audits.push(a) }));
vi.mock("@/lib/charity/queries", () => ({
  loadCharityForManager: async () => ({ charity: { id: "c1", slug: "meals", name_en: "Meals Fund", status: "approved", website: null }, priv: null, categoryIds: [CAT_A] }),
}));
vi.mock("@/lib/charity/charity-actions", () => ({
  recordAction: async (_c: string, _u: string, kind: string, details: Record<string, unknown>, undo: Record<string, unknown>) => (recorded.push({ kind, details, undo }), "a1"),
}));
vi.mock("@/lib/charity/emails", () => ({ notifyCharity: async (m: string) => void told.push(m), publicChangeEmail: (_to: string, _n: string, _id: string, what: string) => what }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ in: async (_c: string, ids: string[]) => ({ data: ids.filter((i) => known.includes(i)).map((id) => ({ id })), error: null }) }) }),
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const done = (op: string) => {
        writes.push({ table, op });
        return table === "charity_categories" ? { data: null, error: categoryError } : { data: [{ id: "c1" }], error: null };
      };
      const del = { eq: () => del, not: () => del, then: (ok: (v: unknown) => unknown) => Promise.resolve(done("delete")).then(ok) };
      return {
        update: () => ({ eq: () => ({ select: async () => done("update") }) }),
        upsert: async () => done("upsert"),
        delete: () => del,
      };
    },
  }),
}));

const { saveProfile } = await import("@/app/charity-admin/[id]/profile/actions");
const { describeDone } = await import("@/lib/charity/done");

const form = (cats: string[], name = "Meals Fund") => {
  const f = new FormData();
  f.set("name_en", name);
  for (const c of cats) f.append("category_ids", c);
  return f;
};

beforeEach(() => {
  process.env.ADMIN_NOTIFY_EMAIL = "review@givezy.test";
  known = [CAT_A, CAT_B];
  categoryError = null;
  writes.length = audits.length = recorded.length = told.length = 0;
});

describe("saving the profile's categories", () => {
  it("a category that doesn't exist is refused before anything is saved", async () => {
    known = [CAT_A];
    const r = await saveProfile("c1", { ok: false }, form([CAT_A, CAT_B]));
    expect(r).toMatchObject({ ok: false, message: "Please fix the highlighted fields. Nothing was saved.", fieldErrors: { category_ids: expect.stringContaining("no longer exists") } });
    expect(writes).toEqual([]);
    expect(audits).toEqual([]);
  });

  it("all saved: Undo covers the profile and its categories", async () => {
    await expect(saveProfile("c1", { ok: false }, form([CAT_B]))).rejects.toThrow("redirect:/charity-admin/c1/profile?done=a1");
    expect(recorded[0]).toMatchObject({ kind: "profile_saved", details: {}, undo: { categories: [CAT_A], categoriesAfter: [CAT_B] } });
  });

  it("the categories fail after the profile saved: it says what saved, and the audit, reviewer email and Undo still happen", async () => {
    categoryError = { message: "boom" };
    await expect(saveProfile("c1", { ok: false }, form([CAT_B], "Meals Fund SA"))).rejects.toThrow("redirect:/charity-admin/c1/profile?done=a1");
    expect(audits).toEqual([expect.objectContaining({ action: "charity.profile_updated", details: expect.objectContaining({ name_from: "Meals Fund", name_to: "Meals Fund SA", site_changes: expect.anything() }) })]);
    expect(told).toEqual(['its name, from "Meals Fund" to "Meals Fund SA"']);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].details).toEqual({ categoriesNotSaved: true });
    // Undo takes back the profile only: the categories didn't change as asked, so they aren't "put back".
    expect(recorded[0].undo).not.toHaveProperty("categories");
    expect(recorded[0].undo).toMatchObject({ type: "restore", table: "charities", after: expect.objectContaining({ name_en: "Meals Fund SA" }) });
    const done = describeDone("profile_saved", recorded[0].details as never, { base: "/charity-admin/c1", publicUrl: null, approved: true });
    expect(done.what).toBe("Your public profile is saved, but your categories didn't all save. Check them below and save again.");
  });
});
