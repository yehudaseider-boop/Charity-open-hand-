/**
 * Admin messages say what really happened (review 23/11/2026): an invitation whose email didn't go says so and shows
 * the link; closing charity requests another admin already closed changes nothing and says so.
 * The database and email are stand-ins.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({ requirePlatformAdmin: async () => ({ userId: "admin1" }) }));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/rate-limit", () => ({ hitRateLimit: async () => false }));
vi.mock("@/lib/charity/invites", () => ({ createInvite: async () => "tok123" }));
let mailOk = true;
vi.mock("@/lib/charity/emails", async (orig) => ({ ...(await orig<object>()), notifyCharity: async () => mailOk }));
let matched: { id: string }[] = [];
let notified = 0;
vi.mock("@/lib/charity-requests-notify", () => ({ notifyJoined: async () => (notified++, { sent: 1, failed: 0, skipped: 0 }) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["eq", "in", "update"]) q[m] = () => q;
      q.select = async () => ({ data: matched, error: null });
      q.maybeSingle = async () => ({ data: table === "charities" ? { id: "11111111-1111-1111-1111-111111111111", status: "approved" } : null, error: null });
      return Object.assign(q, { select: (cols?: string) => (cols === "id, status" ? q : Promise.resolve({ data: matched, error: null })) });
    },
  }),
}));

process.env.SITE_URL = "https://givezy.test";
const { inviteCharity } = await import("@/app/admin/charities/invite/actions");
const { decline, markJoined, setInvited } = await import("@/app/admin/charity-requests/actions");

beforeEach(() => {
  mailOk = true;
  matched = [{ id: "r1" }];
  notified = 0;
});

describe("inviting a charity", () => {
  const form = () => {
    const f = new FormData();
    f.set("charity_name", "Meals Fund");
    f.set("contact_email", "office@meals.test");
    return f;
  };

  it("says the invitation was sent when the email went", async () => {
    expect((await inviteCharity({ ok: false }, form())).message).toBe("Invitation sent to office@meals.test.");
  });

  it("when the email did not go: says so, does not say sent, and shows the link to copy", async () => {
    mailOk = false;
    const r = await inviteCharity({ ok: false }, form());
    expect(r.ok).toBe(false);
    expect(r.message).not.toMatch(/Invitation sent/);
    expect(r.message).toContain("We couldn't email office@meals.test");
    expect(r.message).toContain("https://givezy.test/apply?invite=tok123");
  });
});

describe("closing charity requests another admin already closed", () => {
  it("setInvited, decline and markJoined each say nothing was changed, and markJoined emails nobody", async () => {
    matched = [];
    const said = "Someone else already closed these requests. Nothing was changed.";
    expect(await setInvited("meals-fund", true)).toEqual({ ok: false, message: said });
    expect(await decline("meals-fund")).toEqual({ ok: false, message: said });
    const f = new FormData();
    f.set("charity_id", "11111111-1111-1111-1111-111111111111");
    expect(await markJoined("meals-fund", { ok: false }, f)).toEqual({ ok: false, message: said });
    expect(notified).toBe(0);
  });

  it("with rows matched, they still succeed", async () => {
    expect((await setInvited("meals-fund", true)).ok).toBe(true);
    expect((await decline("meals-fund")).ok).toBe(true);
  });
});
