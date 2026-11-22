/**
 * Approving a charity that shares its NPO or PBO number with another charity here needs a written reason, kept in
 * the audit trail (22/11/2026: it was only a warning). The database, checklist and emails are stand-ins.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAME_NUMBER_FIELD, SPOKE_TO_FIELD, vettingChecks, vettingField } from "@/lib/charity/vetting";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const audits: { action: string; details?: Record<string, unknown> }[] = [];
let updates = 0;
let same: { id: string; name: string; status: string }[] = [];
vi.mock("@/lib/auth", () => ({ requirePlatformAdmin: async () => ({ userId: "admin1" }) }));
vi.mock("@/lib/audit", () => ({ logAudit: async (a: { action: string; details?: Record<string, unknown> }) => void audits.push(a) }));
vi.mock("@/lib/charity/emails", async (orig) => ({ ...(await orig<object>()), notifyCharity: async () => {} }));
vi.mock("@/lib/charity/checklist", () => ({ applicationChecklist: () => [], isComplete: () => true }));
vi.mock("@/lib/charity/same-number", () => ({ charitiesWithSameNumber: async () => same }));
vi.mock("@/lib/charity/queries", () => ({
  loadCharityForManager: async () => ({
    charity: { id: "c1", slug: "meals", status: "pending_review", npo_number: "930-012", pbo_number: null, s18a_reference: null },
    priv: { contact_email: "office@meals.test" },
    documents: [],
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ["eq", "is"]) q[m] = () => q;
      q.update = () => ((updates++), q);
      q.select = async () => ({ data: [{ id: "c1" }], error: null });
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(ok);
      return q;
    },
  }),
}));

const { approveCharity } = await import("@/app/admin/charities/[id]/actions");
const form = (extra: Record<string, string> = {}) => {
  const f = new FormData();
  for (const c of vettingChecks) f.set(vettingField(c.key), "on");
  f.set(SPOKE_TO_FIELD, "Jo Smith, treasurer, by phone on 22/11/2026");
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  return f;
};

beforeEach(() => {
  audits.length = 0;
  updates = 0;
  same = [];
});

describe("approving a charity whose number another charity here also has", () => {
  it("no other charity has it: approved as before, with no reason asked", async () => {
    const r = await approveCharity("c1", { ok: false }, form());
    expect(r.ok).toBe(true);
    expect(audits[0].details).not.toHaveProperty("same_number_note");
  });

  it("another charity has it: refused without a reason, naming it, and nothing is changed", async () => {
    same = [{ id: "c2", name: "Hope Meals NPC", status: "approved" }];
    const r = await approveCharity("c1", { ok: false }, form());
    expect(r.ok).toBe(false);
    expect(r.message).toContain("Hope Meals NPC");
    expect(updates).toBe(0);
    expect(audits).toHaveLength(0);
  });

  it("with a reason: approved, and the reason and the other charity are kept in the audit trail", async () => {
    same = [{ id: "c2", name: "Hope Meals NPC", status: "rejected" }];
    const r = await approveCharity("c1", { ok: false }, form({ [SAME_NUMBER_FIELD]: "The other listing was their first try, sent back and closed." }));
    expect(r.ok).toBe(true);
    expect(audits[0]).toMatchObject({ action: "charity.approved", details: { same_number_as: ["c2"], same_number_note: "The other listing was their first try, sent back and closed." } });
  });
});
