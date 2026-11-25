/**
 * Anyone in a charity's team can remove themselves; only the owner removes someone else (fresh security review,
 * 25/11/2026: someone added to a team couldn't leave, which also blocked deleting their own Givezy account).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const SELF = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { url }); } }));
vi.mock("@/lib/auth", () => ({ requireViewer: async () => ({ userId: "00000000-0000-4000-8000-000000000001", email: "viewer@x.test" }) }));
vi.mock("@/lib/charity/queries", () => ({ loadCharityForManager: async () => ({ charity: { id: "c1", name_en: "Meals" } }) }));
vi.mock("@/lib/charity/emails", () => ({ notifyCharity: async () => true, adminRemovedEmail: () => ({}), memberAddedEmail: () => ({}) }));
vi.mock("@/lib/charity/charity-actions", () => ({ recordAction: async () => "d1" }));

const removed: { charity: string; actor: string; user: string }[] = [];
let owner = false;
vi.mock("@/lib/charity/team", async (orig) => ({
  ...(await orig<object>()),
  isOwner: async () => owner,
  removeMember: async (charity: string, actor: string, user: string) => {
    removed.push({ charity, actor, user });
    return { ok: true, email: "x@x.test" };
  },
}));

const { removeTeamMember } = await import("@/app/charity-admin/[id]/team/actions");
const fd = new FormData();

beforeEach(() => {
  removed.length = 0;
  owner = false;
});

describe("leaving a charity's team", () => {
  it("someone who isn't the owner can remove themselves, and is taken to their account", async () => {
    await expect(removeTeamMember("c1", SELF, { ok: true }, fd)).rejects.toMatchObject({ url: "/account" });
    expect(removed).toEqual([{ charity: "c1", actor: SELF, user: SELF }]);
  });

  it("someone who isn't the owner can't remove another person, and nothing is removed", async () => {
    const r = await removeTeamMember("c1", OTHER, { ok: true }, fd);
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining("Only your charity's owner") });
    expect(removed).toEqual([]);
  });

  it("the owner can remove another person", async () => {
    owner = true;
    await expect(removeTeamMember("c1", OTHER, { ok: true }, fd)).rejects.toMatchObject({ url: expect.stringContaining("/team?done=") });
    expect(removed).toEqual([{ charity: "c1", actor: SELF, user: OTHER }]);
  });
});
