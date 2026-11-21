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
/** The charity's own record: SARS needs its reference number and address on every receipt. */
const fullRecord = { s18a_reference: "18A/2026/1", pbo_number: "930012345", address_line1: "1 Test Road", address_line2: null, suburb: "Northcliff", city: "Johannesburg", postal_code: "2195" };
let charityRecord: Record<string, string | null> = fullRecord;
let approveAnswer: { ok: false; why: string } | null = null;
const shownSent: string[] = [];

vi.mock("@/lib/charity/team", async () => {
  const p = await import("@/lib/charity/permissions");
  const role = () => "admin" as const;
  return {
    viewerCan: async (_c: string, perm: Parameters<typeof p.can>[1]) => p.can(role(), perm),
    refusal: async (_c: string, perm: Parameters<typeof p.can>[1]) => (p.can(role(), perm) ? null : p.refusedFor(perm)),
  };
});
let refreshed = 0;
vi.mock("next/cache", () => ({ revalidatePath: () => {}, refresh: () => void (refreshed += 1) }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));
vi.mock("@/lib/auth", () => ({ requireViewer: async () => ({ userId: "admin-of-c1" }) }));
// As the real one: the signed-in person manages c1 only; any other charity is "not found".
vi.mock("@/lib/charity/queries", () => ({
  loadCharityForManager: async (id: string) => {
    if (id !== "c1") throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    return { charity: { id: "c1", status: "approved", ...charityRecord }, priv: { contact_phone: "011 555 0101", contact_email: "office@meals.org.za" } };
  },
}));
vi.mock("@/lib/charities", () => ({ canIssue18a: () => canIssue }));
vi.mock("@/lib/charity/charity-actions", () => ({ recordAction: async (_c: string, _u: string, kind: string, details: Record<string, unknown>, undo: unknown) => (recorded.push({ kind, details, undo }), "act1") }));
const cert = { donorName: "Thandi Mokoena", receipt: { totalCents: 50_000 }, next: { key: "k2", donorName: "Sipho Ndlovu" } };
vi.mock("@/lib/receipts/review-store", () => ({
  approveCertificate: async (x: { shown: string }) => (calls.push("approve"), shownSent.push(x.shown), approveAnswer ?? { ok: true, decisionId: "d1", decidedAt: "t", previous: null, cert }),
  declineCertificate: async (a: { contact: unknown }) => (calls.push(`decline:${JSON.stringify(a.contact)}`), { ok: true, decisionId: "d1", emailed: "sent", cert }),
  reopenCertificate: async () => (calls.push("reopen"), { ok: true, removed: { id: "d1", decision: "declined" }, cert }),
  editCertificate: async () => (calls.push("edit"), { ok: true, decisionId: "d1", decidedAt: "t", changed: ["address"], restore: [], previous: null, cert, name: "Thandi Mokoena" }),
  reviewFailureText: (why: string) => (why === "stale" ? "This receipt changed since you opened the page: check it again." : "x"),
}));
vi.mock("@/lib/receipts/runs", () => ({ approveRun: async () => ({ ok: false, why: "nothing" }), cancelRun: async () => true, closedTaxYears: () => [2027, 2026] }));

const a = await import("@/app/charity-admin/[id]/receipts/actions");
const f = new FormData();

beforeEach(() => {
  calls.length = recorded.length = shownSent.length = 0;
  canIssue = true;
  charityRecord = fullRecord;
  approveAnswer = null;
  refreshed = 0;
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

  it("refuses approving one receipt, as Approve all does, while the charity's record lacks what SARS needs; declining and reopening still work", async () => {
    charityRecord = { ...fullRecord, address_line1: null, suburb: null, city: null, postal_code: null };
    for (const act of [a.approveCertificateAction, a.editCertificateAction]) {
      expect(await act("c1", 2027, "k1", { ok: false }, f)).toEqual({
        ok: false,
        message: "Your charity's address isn't on your Givezy record yet, and SARS needs it on every s18A receipt, so none can be approved or issued. Nothing was approved or sent. Send it to us and we'll add it, then approve again.",
      });
    }
    expect(calls).toEqual([]);
    await expect(a.declineCertificateAction("c1", 2027, "k1", { ok: false }, f)).rejects.toThrow(/redirect:/);
    await expect(a.reopenCertificateAction("c1", 2027, "k1", { ok: false }, f)).rejects.toThrow(/redirect:/);
    expect(calls).toHaveLength(2);
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

describe("approving one receipt carries what the page showed (review 21/11/2026)", () => {
  it("sends the page's fingerprint to the server's check", async () => {
    const form = new FormData();
    form.set("shown", "abc123");
    await expect(a.approveCertificateAction("c1", 2027, "k1", { ok: false }, form)).rejects.toThrow(/redirect:/);
    expect(shownSent).toEqual(["abc123"]);
  });

  it("when the receipt changed since, says so plainly, records nothing, and refreshes the page to show the latest", async () => {
    approveAnswer = { ok: false, why: "stale" };
    const r = await a.approveCertificateAction("c1", 2027, "k1", { ok: false }, f);
    expect(r).toEqual({ ok: false, message: "This receipt changed since you opened the page: check it again." });
    expect(recorded).toEqual([]);
    expect(refreshed).toBe(1);
  });
});

describe("the year's card while the charity's record lacks what SARS needs (review 21/11/2026)", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { createElement } = await import("react");
  const { YearRun } = await import("@/app/charity-admin/[id]/receipts/year-run");
  const plan = {
    taxYear: 2027,
    lines: [
      { key: "k1", donorName: "Thandi Mokoena", gifts: 2, totalCents: 75_000, status: "to_check" as const, changedSince: false },
      { key: "k2", donorName: "Sipho Ndlovu", gifts: 1, totalCents: 20_000, status: "declined" as const, changedSince: false },
    ],
    totalCents: 75_000,
    toIssue: 1,
    counts: { to_check: 1, approved: 0, edited: 0, declined: 1 },
    fingerprint: "fp",
    detailsMissing: [],
    leftOut: [],
    charityMissing: ["the charity's address"],
  };
  const sentBack = { id: "r1", charity_id: "c1", tax_year: 2027, status: "cancelled" as const, plan_fingerprint: "fp", receipts_planned: 1, total_cents: 75_000, charity_approved_at: "2027-03-02T08:00:00Z", signed_off_at: null, finished_at: null, summary: null, cancelled_at: "2027-03-03T08:00:00Z", cancelled_reason: "Please check Thandi's address." };
  const html = renderToStaticMarkup(createElement(YearRun, { charityId: "c1", taxYear: 2027, open: null, latest: sentBack, plan, pending: 0, canCheck: true }));

  it("keeps the list, each receipt still opens (to decline or reopen), and keeps the sent-back notice", () => {
    expect(html).toContain("can&#x27;t be approved yet");
    expect(html).toContain("Your charity&#x27;s address isn&#x27;t on your Givezy record yet");
    expect(html).toContain("Your earlier approval came back from Givezy. Please check Thandi&#x27;s address.");
    expect(html).toContain("/charity-admin/c1/receipts/certificate?year=2027&amp;c=k1");
    expect(html).toContain("/charity-admin/c1/receipts/certificate?year=2027&amp;c=k2");
  });

  it("has no Approve all, and says why", () => {
    const ready = renderToStaticMarkup(createElement(YearRun, { charityId: "c1", taxYear: 2027, open: null, latest: null, plan: { ...plan, charityMissing: [] }, pending: 0, canCheck: true }));
    expect(ready).toMatch(/>Approve all</);
    expect(html).not.toMatch(/>Approve all</);
    expect(html).toContain("Approve all is off until your charity&#x27;s address is on your record");
    expect(html).not.toMatch(/[!—]/);
  });
});
