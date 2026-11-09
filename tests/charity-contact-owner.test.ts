/**
 * The charity's contact email and phone are what Givezy staff use to check who is asking before a second-step
 * reset or a bank change, so only the owner may change them, and the old address hears when either moves.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
let owner = true;
let priv: Record<string, string | null> | null = null;
const audits: { action: string; details?: unknown }[] = [];
const mails: { to: string; subject: string; text: string }[] = [];
const updates: Record<string, unknown>[] = [];

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));
vi.mock("@/lib/auth", () => ({ requireViewer: async () => ({ userId: "u1", email: "admin@x.co" }) }));
vi.mock("@/lib/charity/queries", () => ({ loadCharityForManager: async () => ({ charity: { id: "c1", name_en: "Meals Fund", status: "approved" }, priv, documents: [] }) }));
vi.mock("@/lib/charity/team", () => ({ isOwner: async () => owner }));
vi.mock("@/lib/charity/charity-actions", () => ({ recordAction: async () => "a1" }));
vi.mock("@/lib/charity/bank-check", () => ({ checkCharityBank: async () => {} }));
vi.mock("@/lib/audit", () => ({ logAudit: async (a: { action: string; details?: unknown }) => void audits.push(a) }));
vi.mock("@/lib/charity/emails", async (orig) => ({ ...(await orig<object>()), notifyCharity: async (m: { to: string; subject: string; text: string }) => void mails.push(m) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      update: (row: Record<string, unknown>) => {
        updates.push(row);
        return { eq: () => ({ select: async () => ({ data: [{ charity_id: "c1" }], error: null }) }) };
      },
    }),
  }),
}));

const { saveContact } = await import("@/app/charity-admin/[id]/application/actions");

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const same = { contact_name: "Thandi Mokoena", contact_email: "old@charity.co.za", contact_phone: "0821234567" };

beforeEach(() => {
  owner = true;
  priv = { ...same };
  audits.length = mails.length = updates.length = 0;
});

describe("changing the charity's contact details", () => {
  it("an admin who isn't the owner is refused, and nothing is saved, logged or sent", async () => {
    owner = false;
    expect(await saveContact("c1", { ok: false }, form({ ...same, contact_phone: "0839998877" }))).toEqual({
      ok: false,
      message: "Only your charity's owner can change the contact details. Nothing was changed.",
    });
    expect(updates).toEqual([]);
    expect(audits).toEqual([]);
    expect(mails).toEqual([]);
  });

  it("a new phone number is recorded and the old contact address is told, with only its last digits", async () => {
    await expect(saveContact("c1", { ok: false }, form({ ...same, contact_phone: "083 999 8877" }))).rejects.toThrow(/redirect:.*step=contact&done=a1/);
    expect(updates[0]).toMatchObject({ contact_phone: "0839998877" });
    expect(audits).toEqual([expect.objectContaining({ action: "charity.contact_phone_changed", entityId: "c1" })]);
    expect(JSON.stringify(audits)).not.toContain("0839998877");
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to: "old@charity.co.za", subject: "The contact phone number for Meals Fund on Givezy was changed" });
    expect(mails[0].text).toContain("ending in 877");
    expect(mails[0].text).not.toContain("0839998877");
  });

  it("a new email and phone together: both recorded, and the old address hears about both", async () => {
    await expect(saveContact("c1", { ok: false }, form({ ...same, contact_email: "new@charity.co.za", contact_phone: "0839998877" }))).rejects.toThrow(/redirect:/);
    expect(audits.map((a) => a.action)).toEqual(["charity.contact_email_changed", "charity.contact_phone_changed"]);
    expect(mails.map((m) => m.to)).toEqual(["old@charity.co.za", "old@charity.co.za"]);
  });

  it("the same number written differently, or only the name changed, sends nothing", async () => {
    await expect(saveContact("c1", { ok: false }, form({ ...same, contact_name: "Thandi M", contact_phone: "082 123 4567" }))).rejects.toThrow(/redirect:/);
    expect(audits).toEqual([]);
    expect(mails).toEqual([]);
  });

  it("removing the number counts as a change", async () => {
    await expect(saveContact("c1", { ok: false }, form({ ...same, contact_phone: "" }))).rejects.toThrow(/redirect:/);
    expect(audits.map((a) => a.action)).toEqual(["charity.contact_phone_changed"]);
    expect(mails[0].text).toContain("was removed");
  });
});
