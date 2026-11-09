/**
 * Who may check a charity's s18A receipts (09/11/2026): the same people as "Approve all", anyone who manages
 * that charity (owner or admin, with their second step; roles come in CRM step 9). Another charity's admin gets
 * "not found" and nothing is read, changed or sent. Only closed tax years, and only a charity that can issue.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const calls: string[] = [];
const recorded: { kind: string; details: Record<string, unknown>; undo: unknown }[] = [];
let canIssue = true;

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));
vi.mock("@/lib/auth", () => ({ requireViewer: async () => ({ userId: "admin-of-c1" }) }));
// As the real one: the signed-in person manages c1 only; any other charity is "not found".
vi.mock("@/lib/charity/queries", () => ({
  loadCharityForManager: async (id: string) => {
    if (id !== "c1") throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    return { charity: { id: "c1", status: "approved" }, priv: { contact_phone: "011 555 0101", contact_email: "office@meals.org.za" } };
  },
}));
vi.mock("@/lib/charities", () => ({ canIssue18a: () => canIssue }));
vi.mock("@/lib/charity/charity-actions", () => ({ recordAction: async (_c: string, _u: string, kind: string, details: Record<string, unknown>, undo: unknown) => (recorded.push({ kind, details, undo }), "act1") }));
const cert = { donorName: "Thandi Mokoena", receipt: { totalCents: 50_000 }, next: { key: "k2", donorName: "Sipho Ndlovu" } };
vi.mock("@/lib/receipts/review-store", () => ({
  approveCertificate: async () => (calls.push("approve"), { ok: true, decisionId: "d1", decidedAt: "t", previous: null, cert }),
  declineCertificate: async (a: { contact: unknown }) => (calls.push(`decline:${JSON.stringify(a.contact)}`), { ok: true, decisionId: "d1", emailed: "sent", cert }),
  reopenCertificate: async () => (calls.push("reopen"), { ok: true, removed: { id: "d1", decision: "declined" }, cert }),
  editCertificate: async () => (calls.push("edit"), { ok: true, decisionId: "d1", decidedAt: "t", changed: ["address"], restore: [], previous: null, cert, name: "Thandi Mokoena" }),
  reviewFailureText: () => "x",
}));
vi.mock("@/lib/receipts/runs", () => ({ approveRun: async () => ({ ok: false, why: "nothing" }), cancelRun: async () => true, closedTaxYears: () => [2027, 2026] }));

const a = await import("@/app/charity-admin/[id]/receipts/actions");
const f = new FormData();

beforeEach(() => {
  calls.length = recorded.length = 0;
  canIssue = true;
});

describe("checking one s18A receipt", () => {
  const actions = [a.approveCertificateAction, a.declineCertificateAction, a.reopenCertificateAction, a.editCertificateAction];

  it("refuses another charity's admin before anything is read or changed", async () => {
    for (const act of actions) await expect(act("c2", 2027, "k1", { ok: false }, f)).rejects.toThrow(/404/);
    expect(calls).toEqual([]);
    expect(recorded).toEqual([]);
  });

  it("refuses a tax year that hasn't closed, or a charity that can't issue s18A receipts", async () => {
    for (const act of actions) expect(await act("c1", 2028, "k1", { ok: false }, f)).toMatchObject({ ok: false, message: expect.stringMatching(/Nothing was changed/) });
    canIssue = false;
    for (const act of actions) expect(await act("c1", 2027, "k1", { ok: false }, f)).toMatchObject({ ok: false, message: expect.stringMatching(/can't issue s18A receipts yet/) });
    expect(calls).toEqual([]);
  });

  it("lets the charity's own admin decide, records what happened with an Undo, and goes back to the list", async () => {
    await expect(a.approveCertificateAction("c1", 2027, "k1", { ok: false }, f)).rejects.toThrow("redirect:/charity-admin/c1/receipts?done=act1#year-2027");
    expect(recorded[0]).toMatchObject({ kind: "certificate_approved", details: { name: "Thandi Mokoena", total: "R500", nextKey: "k2" }, undo: { type: "receipt_decision", taxYear: 2027 } });
  });

  it("a decline uses the charity's own contact details and can't be undone (the page asked first)", async () => {
    await expect(a.declineCertificateAction("c1", 2027, "k1", { ok: false }, f)).rejects.toThrow(/redirect:/);
    expect(calls).toEqual([`decline:${JSON.stringify({ phone: "011 555 0101", email: "office@meals.org.za" })}`]);
    expect(recorded[0]).toMatchObject({ kind: "certificate_declined", undo: null });
  });
});
