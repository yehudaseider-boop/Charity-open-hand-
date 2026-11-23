/**
 * The application page's actions (code review, 23/11/2026):
 * - the bank account is saved by the server, never with the person's own session, and clears Givezy's "checked"
 *   stamp (an owner whose charity was sent back after Givezy changed its bank details could never save before);
 * - the declarations' consent record is written before the application is marked submitted;
 * - "Remove" on a document never does nothing without saying why;
 * - only the owner and finance may add the bank confirmation letter.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Call = { client: "admin" | "user"; table: string; op: string; values?: unknown };
const calls: Call[] = [];
let role: "owner" | "admin" | "finance" = "owner";
let status = "rejected";
let documents: { id: string; file_name: string; document_type: string }[] = [];
let deleted: unknown[] = [{ id: "d1" }];
let consentError: { message: string } | null = null;
let statusRows: unknown[] = [{ id: "c1" }];

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));
vi.mock("@/lib/auth", () => ({ requireViewer: async () => ({ userId: "u1", email: "owner@x.co" }) }));
vi.mock("@/lib/charity/queries", () => ({
  loadCharityForManager: async () => ({ charity: { id: "c1", name_en: "Meals Fund", status }, priv: { contact_email: "owner@x.co" }, documents, documentTypes: [] }),
}));
vi.mock("@/lib/charity/team", async () => {
  const p = await import("@/lib/charity/permissions");
  return {
    isOwner: async () => role === "owner",
    refusal: async (_c: string, perm: Parameters<typeof p.can>[1]) => (p.can(role, perm) ? null : p.refusedFor(perm)),
  };
});
vi.mock("@/lib/charity/checklist", () => ({ applicationChecklist: () => [], isComplete: () => true }));
vi.mock("@/lib/charity/charity-actions", () => ({ recordAction: async () => "a1" }));
vi.mock("@/lib/charity/bank-check", () => ({ checkCharityBank: async () => {}, savedAccountKey: () => null }));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/charity/file-check", () => ({ isRealDocument: async () => true }));
vi.mock("@/lib/charity/emails", async (orig) => ({ ...(await orig<object>()), notifyCharity: async () => {} }));

/** A stand-in for both database clients: every call is noted with which client made it. */
function client(kind: "admin" | "user") {
  const chain = (table: string, op: string, values?: unknown) => {
    calls.push({ client: kind, table, op, values });
    const result = () => {
      if (table === "consents") return { data: null, error: consentError };
      if (table === "charities" && op === "update") return { data: statusRows, error: null };
      if (table === "charity_documents" && op === "delete") return { data: deleted, error: null };
      if (table === "charity_documents" && op === "select") return { data: { id: "d1", charity_id: "c1" }, error: null };
      if (table === "charity_documents" && op === "insert") return { data: { id: "d2" }, error: null };
      return { data: op === "select" ? { bank_name: "FNB", bank_account_number_encrypted: null } : [{ charity_id: "c1" }], error: null };
    };
    const q: Record<string, unknown> = {};
    for (const m of ["eq", "in", "is", "select", "order", "limit"]) q[m] = () => q;
    q.maybeSingle = async () => result();
    q.single = async () => result();
    q.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, bad);
    return q;
  };
  return {
    from: (table: string) => ({
      select: () => chain(table, "select"),
      update: (v: unknown) => chain(table, "update", v),
      insert: (v: unknown) => chain(table, "insert", v),
      delete: () => chain(table, "delete"),
    }),
    storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }) }) },
  };
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => client("admin") }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client("user") }));

const { removeDocument, saveBank, submitApplication, uploadDocument } = await import("@/app/charity-admin/[id]/application/actions");

const form = (o: Record<string, string | File>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const bank = () => form({ bank_name: "FNB", bank_account_holder: "Meals Fund NPC", bank_account_number: "62123456789", bank_branch_code: "250655" });

beforeEach(() => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64");
  calls.length = 0;
  role = "owner";
  status = "rejected";
  documents = [{ id: "d1", file_name: "letter.pdf", document_type: "pbo_approval" }];
  deleted = [{ id: "d1" }];
  consentError = null;
  statusRows = [{ id: "c1" }];
});

describe("saving the bank account", () => {
  it("is written by the server, with the account encrypted and the checked stamp cleared, never with the owner's session", async () => {
    await expect(saveBank("c1", { ok: false }, bank())).rejects.toThrow(/redirect:.*step=bank&done=a1/);
    const writes = calls.filter((c) => c.table === "charity_private" && c.op === "update");
    expect(writes).toHaveLength(1);
    expect(writes[0].client).toBe("admin");
    expect(writes[0].values).toMatchObject({ bank_name: "FNB", bank_account_last4: "6789", bank_branch_code: "250655", bank_verified_at: null });
    expect(JSON.stringify(writes[0].values)).not.toContain("62123456789");
    expect(calls.some((c) => c.client === "user" && c.table === "charity_private")).toBe(false);
  });

  it("is refused for someone who isn't the owner, before anything is written", async () => {
    role = "admin";
    expect(await saveBank("c1", { ok: false }, bank())).toEqual({ ok: false, message: "Only your charity's owner can change the bank account. Nothing was changed." });
    expect(calls.filter((c) => c.op === "update")).toEqual([]);
  });

  it("is refused once the application is submitted", async () => {
    status = "pending_review";
    expect(await saveBank("c1", { ok: false }, bank())).toMatchObject({ ok: false });
    expect(calls.filter((c) => c.op === "update")).toEqual([]);
  });
});

describe("submitting the application", () => {
  const declared = () => form({ declare_authority: "on", declare_true: "on", declare_terms: "on", declare_donor_data: "on" });

  it("writes the declarations' consent before marking it submitted", async () => {
    await expect(submitApplication("c1", { ok: false }, declared())).rejects.toThrow(/redirect:/);
    const order = calls.filter((c) => c.table === "consents" || (c.table === "charities" && c.op === "update")).map((c) => c.table);
    expect(order).toEqual(["consents", "charities"]);
  });

  it("if the consent can't be written, it isn't submitted, and says so in plain words", async () => {
    consentError = { message: "boom" };
    expect(await submitApplication("c1", { ok: false }, declared())).toEqual({
      ok: false,
      message: "That didn't go through, so your application wasn't submitted. Your details are all kept. Please try again.",
    });
    expect(calls.some((c) => c.table === "charities" && c.op === "update")).toBe(false);
  });
});

describe("removing a document", () => {
  it("one that is already gone sends the person back with the reason", async () => {
    documents = [];
    await expect(removeDocument("c1", "d1")).rejects.toThrow("redirect:/charity-admin/c1/application?step=documents&refused=gone");
  });

  it("one removed by someone else in between says so too", async () => {
    deleted = [];
    await expect(removeDocument("c1", "d1")).rejects.toThrow("redirect:/charity-admin/c1/application?step=documents&refused=gone");
  });

  it("a submitted application says its documents are locked", async () => {
    status = "pending_review";
    await expect(removeDocument("c1", "d1")).rejects.toThrow("redirect:/charity-admin/c1/application?step=documents&refused=locked");
  });

  it("a role without the application is told so", async () => {
    role = "finance";
    await expect(removeDocument("c1", "d1")).rejects.toThrow("redirect:/charity-admin/c1/application?step=documents&refused=application");
  });

  it("removes it and offers Undo", async () => {
    await expect(removeDocument("c1", "d1")).rejects.toThrow("redirect:/charity-admin/c1/application?step=documents&done=a1");
  });
});

describe("the bank confirmation letter", () => {
  const pdf = () => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "letter.pdf", { type: "application/pdf" });

  it("an admin without the bank account can't add it", async () => {
    role = "admin";
    expect(await uploadDocument("c1", { ok: false }, form({ document_type: "bank_confirmation", file: pdf() }))).toMatchObject({
      ok: false,
      fieldErrors: { document_type: "Your role can't add the bank confirmation letter. Ask your charity's owner to add it." },
    });
    expect(calls.filter((c) => c.op === "insert")).toEqual([]);
  });

  it("the same admin can still add the other documents, and the owner can add the letter", async () => {
    role = "admin";
    await expect(uploadDocument("c1", { ok: false }, form({ document_type: "pbo_approval", file: pdf() }))).rejects.toThrow(/redirect:.*done=a1/);
    role = "owner";
    await expect(uploadDocument("c1", { ok: false }, form({ document_type: "bank_confirmation", file: pdf() }))).rejects.toThrow(/redirect:.*done=a1/);
  });
});
