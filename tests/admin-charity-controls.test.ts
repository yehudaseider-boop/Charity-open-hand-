/** Platform admin controls after approval: remove an admin, reset a lost authenticator, set up s18A later. */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const audits: { action: string; details?: Record<string, unknown> }[] = [];
const mails: { to: string; subject: string }[] = [];
const deleted: string[] = [];
const updates: Record<string, unknown>[] = [];
let memberRow: unknown = { user_id: "u2" };
/** What the database's own owner rule answers (remove_charity_member, make_charity_owner, 22/11/2026). */
let removeOutcome: string | null = null;
let ownerOutcome = "done";
const rpcs: { name: string; args: Record<string, unknown> }[] = [];
let targetRole = "donor";
let factors = [{ id: "f1" }];
let charity: Record<string, unknown> = {};
let documents: { document_type: string; signed_on?: string; storage_path: string }[] = [];
const ADMIN = "11111111-1111-4111-8111-111111111111";
const CH = "22222222-2222-4222-8222-222222222222";
const U2 = "33333333-3333-4333-8333-333333333333";
const OLD_OWNER = "44444444-4444-4444-8444-444444444444";

vi.mock("@/lib/auth", () => ({ requirePlatformAdmin: async () => ({ userId: ADMIN }) }));
vi.mock("@/lib/audit", () => ({ logAudit: async (a: { action: string; details?: Record<string, unknown> }) => void audits.push(a) }));
vi.mock("@/lib/charity/emails", async (orig) => ({ ...(await orig<object>()), notifyCharity: async (m: { to: string; subject: string }) => void mails.push(m) }));
vi.mock("@/lib/charity/queries", () => ({
  loadCharityForManager: async () => ({ charity, priv: { contact_email: "charity@x.co" }, documents }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcs.push({ name, args });
      if (name === "remove_charity_member") {
        const outcome = removeOutcome ?? (memberRow ? "done" : "gone");
        if (outcome === "done") deleted.push("charity_admins");
        return { data: outcome, error: null };
      }
      if (name === "make_charity_owner") return { data: ownerOutcome, error: null };
      throw new Error(`unexpected ${name}`);
    },
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
      // A list read (the team, the people's emails) when awaited without .maybeSingle().
      b.then = (ok: (v: unknown) => unknown) =>
        Promise.resolve({
          data: table === "profiles" ? [{ id: U2, email: "p@x.co" }, { id: OLD_OWNER, email: "old@x.co" }] : table === "charity_admins" ? [{ user_id: U2, role: "admin" }, { user_id: OLD_OWNER, role: "owner" }] : [],
          error: null,
        }).then(ok);
      b.maybeSingle = async () => ({ data: table === "profiles" ? { email: "p@x.co", role: targetRole } : table === "charity_admins" ? memberRow : { name_en: "Meals Fund" }, error: null });
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

const { makeCharityOwner, removeCharityAdmin, resetSecondStep, setUpReceipts } = await import("@/app/admin/charities/[id]/actions");
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeEach(() => {
  audits.length = mails.length = deleted.length = updates.length = rpcs.length = 0;
  removeOutcome = null;
  ownerOutcome = "done";
  memberRow = { user_id: U2 };
  targetRole = "donor";
  factors = [{ id: "f1" }];
  charity = { status: "approved", name_en: "Meals Fund", slug: "meals", is_s18a: false, mandate_signed_at: null, s18a_reference: null };
  documents = [];
});

describe("remove a charity admin", () => {
  it("removes the access, records it and tells the person", async () => {
    const r = await removeCharityAdmin(CH, U2, { ok: false });
    expect(r.ok).toBe(true);
    expect(deleted).toEqual(["charity_admins"]);
    // The user id, not the address: the audit log keeps no more personal data than it needs.
    expect(audits[0]).toEqual(expect.objectContaining({ action: "charity.admin_removed", details: { user_id: U2, by: "platform" } }));
    expect(JSON.stringify(audits)).not.toContain("p@x.co");
    expect(mails[0]).toMatchObject({ to: "p@x.co" });
  });
  it("says so when they had already gone", async () => {
    memberRow = null;
    expect((await removeCharityAdmin(CH, U2, { ok: false })).ok).toBe(false);
    expect(audits).toHaveLength(0);
  });
  it("never removes the charity's only owner, and says what to do instead (22/11/2026)", async () => {
    removeOutcome = "last_owner";
    const r = await removeCharityAdmin(CH, U2, { ok: false });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/only owner/);
    expect(r.message).toMatch(/Make someone else on the team the owner first/);
    expect(deleted).toHaveLength(0);
    expect(audits).toHaveLength(0);
    expect(mails).toHaveLength(0);
  });
});

describe("hand a charity's ownership to someone on its team (22/11/2026)", () => {
  it("hands it over in the database, records who from and to, and emails the new owner", async () => {
    const r = await makeCharityOwner(CH, U2, { ok: false });
    expect(r.ok).toBe(true);
    expect(rpcs).toEqual([{ name: "make_charity_owner", args: { p_charity_id: CH, p_user_id: U2 } }]);
    expect(audits[0]).toEqual(expect.objectContaining({ action: "charity.owner_changed", details: expect.objectContaining({ to: U2 }) }));
    expect(JSON.stringify(audits)).not.toContain("@");
    expect(audits[0].details).toEqual({ to: U2, from: [OLD_OWNER] });
    expect(mails.map((m) => m.to).sort()).toEqual(["old@x.co", "p@x.co"]);
    expect(mails.find((m) => m.to === "p@x.co")?.subject).toMatch(/now the owner/);
    expect(mails.find((m) => m.to === "old@x.co")?.subject).toMatch(/has a new owner/);
  });
  it("someone no longer on the team: nothing changes, and it says so", async () => {
    ownerOutcome = "gone";
    const r = await makeCharityOwner(CH, U2, { ok: false });
    expect(r).toMatchObject({ ok: false });
    expect(r.message).toMatch(/Nothing was changed/);
    expect(audits).toHaveLength(0);
    expect(mails).toHaveLength(0);
  });
  it("refuses an id that isn't one", async () => {
    expect((await makeCharityOwner(CH, "nope", { ok: false })).ok).toBe(false);
    expect(rpcs).toHaveLength(0);
  });
});

describe("reset a lost authenticator", () => {
  it("needs a note of how the admin checked who it was, and says how long", async () => {
    const r = await resetSecondStep(CH, U2, { ok: false }, form({ reason: "" }));
    expect(r.fieldErrors?.reason).toMatch(/at least 5 characters/);
    expect((await resetSecondStep(CH, U2, { ok: false }, form({ reason: "Call" }))).fieldErrors?.reason).toMatch(/at least 5 characters/);
    expect(deleted).toHaveLength(0);
  });
  it("removes their factors, records the check and emails them", async () => {
    const r = await resetSecondStep(CH, U2, { ok: false }, form({ reason: "Called them on the number from the application" }));
    expect(r.ok).toBe(true);
    expect(deleted).toEqual(["factor:f1"]);
    expect(audits[0]).toEqual(expect.objectContaining({ action: "charity.admin_second_step_reset", details: { user_id: U2, checked: "Called them on the number from the application" } }));
    expect(JSON.stringify(audits)).not.toContain("p@x.co");
    expect(mails[0].subject).toMatch(/second step was reset/);
  });
  it("never for someone outside this charity, or for the admin themselves", async () => {
    memberRow = null;
    expect((await resetSecondStep(CH, U2, { ok: false }, form({ reason: "Called them" }))).ok).toBe(false);
    memberRow = { user_id: ADMIN };
    expect((await resetSecondStep(CH, ADMIN, { ok: false }, form({ reason: "Called them" }))).ok).toBe(false);
    expect(deleted).toHaveLength(0);
  });
  it("never for another Givezy admin, even one who is on this charity's team (security review 18/11/2026)", async () => {
    targetRole = "platform_admin";
    const r = await resetSecondStep(CH, U2, { ok: false }, form({ reason: "Called them on the number we have" }));
    expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/Givezy admin/) });
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
  it("refuses a reference over 40 characters (the database's limit) instead of cutting it", async () => {
    documents = [{ document_type: "s18a_approval", storage_path: "c/s.pdf" }];
    const r = await setUpReceipts(CH, { ok: false }, form({ s18a_reference: "9".repeat(41), confirm_s18a: "on" }));
    expect(r.fieldErrors?.s18a_reference).toMatch(/at most 40 characters/);
    expect(updates).toHaveLength(0);
    await setUpReceipts(CH, { ok: false }, form({ s18a_reference: "9".repeat(40), confirm_s18a: "on" }));
    expect(updates[0]).toMatchObject({ s18a_reference: "9".repeat(40) });
  });
  it("already set up but the reference number is missing: saves the number alone, with nothing to tick, and emails nobody (review 21/11/2026)", async () => {
    charity = { ...charity, is_s18a: true, mandate_signed_at: "2026-10-01T00:00:00+02:00" };
    const r = await setUpReceipts(CH, { ok: false }, form({ s18a_reference: "930/123/45/6" }));
    expect(r).toEqual({ ok: true, message: "Saved the s18A reference number. Receipts were already set up, so the charity wasn't emailed." });
    expect(updates).toEqual([{ table: "charities", s18a_reference: "930/123/45/6" }]);
    expect(mails).toHaveLength(0);
    expect(audits.at(-1)).toMatchObject({ action: "charity.receipts_set_up", details: { reference_only: true } });
    expect((await setUpReceipts(CH, { ok: false }, form({ s18a_reference: "" }))).fieldErrors?.s18a_reference).toBeTruthy();
  });
  it("one half alone saves but doesn't promise receipts", async () => {
    documents = [{ document_type: "s18a_approval", storage_path: "c/s.pdf" }];
    const r = await setUpReceipts(CH, { ok: false }, form({ s18a_reference: "930/123/45/6", confirm_s18a: "on" }));
    expect(r.message).toMatch(/start once both/);
    expect(mails).toHaveLength(0);
  });
});
