/**
 * "End campaign", "Remove" on an update or a photo: never a button that silently does nothing (code review,
 * 23/11/2026). When there is nothing to change (already ended or removed, perhaps by someone else on the team), the
 * person is sent back to the page with the plain reason, as a refused role already was.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const ID = "11111111-1111-4111-8111-111111111111";
let row: Record<string, unknown> | null = { id: ID };
let changed: unknown[] = [{ id: ID, title: "Roof" }];
const revalidated: string[] = [];

vi.mock("@/lib/charity/team", () => ({ refusal: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => void revalidated.push(p) }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));
vi.mock("@/lib/auth", () => ({ requireViewer: async () => ({ userId: "u1", email: "admin@x.co" }) }));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/rate-limit", () => ({ hitRateLimit: async () => false }));
vi.mock("@/lib/charity/queries", () => ({ loadCharityForManager: async () => ({ charity: { id: "c1", slug: "meals", name_en: "Meals Fund", status: "approved" } }) }));
vi.mock("@/lib/charity/charity-actions", () => ({ recordAction: async () => "a1" }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }) }) }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const q: Record<string, unknown> = {};
    q.eq = () => q;
    q.select = async () => ({ data: changed, error: null });
    return { from: () => ({ update: () => q, delete: () => q }) };
  },
}));

const { endCampaign } = await import("@/app/charity-admin/[id]/campaigns/actions");
const { removePhoto, removeUpdate } = await import("@/app/charity-admin/[id]/updates/actions");

beforeEach(() => {
  row = { id: ID };
  changed = [{ id: ID, title: "Roof" }];
  revalidated.length = 0;
});

describe("End campaign", () => {
  it("a campaign that had already ended sends the person back with the reason", async () => {
    changed = [];
    await expect(endCampaign("c1", ID)).rejects.toThrow("redirect:/charity-admin/c1/campaigns?refused=gone");
    expect(revalidated).toContain("/charity-admin/c1/campaigns");
  });

  it("an id that isn't one says the same", async () => {
    await expect(endCampaign("c1", "not-an-id")).rejects.toThrow("redirect:/charity-admin/c1/campaigns?refused=gone");
  });

  it("ends a running one, with Undo", async () => {
    await expect(endCampaign("c1", ID)).rejects.toThrow("redirect:/charity-admin/c1/campaigns?done=a1");
  });
});

describe("Remove on an update or a photo", () => {
  for (const [name, remove] of [["an update", removeUpdate], ["a photo", removePhoto]] as const) {
    it(`${name} that is already gone sends the person back with the reason`, async () => {
      row = null;
      await expect(remove("c1", ID)).rejects.toThrow("redirect:/charity-admin/c1/updates?refused=gone");
      expect(revalidated).toContain("/charity-admin/c1/updates");
    });

    it(`${name} removed by someone else in between says so too`, async () => {
      changed = [];
      await expect(remove("c1", ID)).rejects.toThrow("redirect:/charity-admin/c1/updates?refused=gone");
    });

    it(`removes ${name}, with Undo`, async () => {
      await expect(remove("c1", ID)).rejects.toThrow("redirect:/charity-admin/c1/updates?done=a1");
    });
  }
});
