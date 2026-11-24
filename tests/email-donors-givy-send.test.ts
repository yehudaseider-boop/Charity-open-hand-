/**
 * Sending from Email donors (review 24/11/2026): "Also show it in the Givezy app" counts only for a thank-you Givy
 * prepared, proved by a draft id that is this person's, on this charity, and not expired; an ordinary email is never
 * put in the app by adding in_app=yes to the form. A Givy draft is removed once it has been sent. Everything outside
 * the action is a stand-in.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const s = vi.hoisted(() => ({
  created: [] as { inApp?: boolean }[],
  loaded: [] as string[],
  deleted: [] as string[],
  drafts: {} as Record<string, unknown>,
  sendFails: false,
}));
const DRAFT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));
vi.mock("@/lib/auth", () => ({ requireViewer: async () => ({ userId: "u1", email: "admin@x.co" }) }));
vi.mock("@/lib/charity/queries", () => ({ loadCharityForManager: async () => ({ charity: { id: "c1", name_en: "Meals Fund", status: "approved" }, priv: null }) }));
vi.mock("@/lib/charity/team", () => ({ refusal: async () => null }));
vi.mock("@/lib/charity/charity-actions", () => ({ recordAction: async () => "a1" }));
vi.mock("@/lib/charity/carry-on-sends", () => ({ carryOnLine: () => "", carryOnStateOf: async () => null }));
vi.mock("@/lib/email", () => ({ getEmailTransport: () => ({ name: "resend", send: async () => "sent" }) }));
vi.mock("@/lib/rate-limit", () => ({ hitRateLimit: async () => false }));
vi.mock("@/lib/charity/appeals", () => ({
  pickAudience: async () => ({ donors: [{ display_name: "Thandi" }], stopped: 0, thisWeek: 0, recordedOnly: 0, label: "All your donors" }),
  recentSameAppeal: async () => false,
  createAppeal: async (a: { inApp?: boolean }) => (s.created.push({ inApp: a.inApp }), "ap1"),
  sendAppeal: async () => {
    if (s.sendFails) throw new Error("email service down");
    return { sent: 1, waiting: 0, failed: 0, skipped: 0 };
  },
}));
vi.mock("@/lib/assistant/drafts", () => ({
  // Only this person's draft on this charity is found; anything else is "gone".
  loadDraft: async (id: string, charityId: string, userId: string) => (s.loaded.push(`${id}|${charityId}|${userId}`), s.drafts[`${id}|${charityId}|${userId}`] ?? "gone"),
  deleteDraft: async (id: string, charityId: string, userId: string) => void s.deleted.push(`${id}|${charityId}|${userId}`),
}));

const { checkAppealAudience, sendAppealNow } = await import("@/app/charity-admin/[id]/email-donors/actions");

const fields = { subject: "Thank you for giving", body: "Thank you for standing with us this month.", audience: "all" };
async function send(extra: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  const checked = await checkAppealAudience("c1", { state: "idle" }, f);
  if (checked.state !== "checked") throw new Error("not checked");
  f.set("fingerprint", checked.fingerprint);
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  return sendAppealNow("c1", { ok: false }, f).catch((e: Error) => e.message);
}

beforeEach(() => {
  Object.assign(s, { created: [], loaded: [], deleted: [], drafts: {}, sendFails: false });
});

describe("in the app, only for a thank-you from Givy", () => {
  it("an ordinary email with in_app=yes added is not put in the app", async () => {
    expect(await send({ in_app: "yes" })).toMatch(/^redirect:/);
    expect(s.created).toEqual([{ inApp: false }]);
    expect(s.deleted).toEqual([]);
  });

  it("someone else's, another charity's or an expired draft id doesn't count either", async () => {
    s.drafts[`${DRAFT}|c1|someone-else`] = { audience: "all", subject: "x", body: "y" };
    expect(await send({ in_app: "yes", draft: DRAFT })).toMatch(/^redirect:/);
    expect(s.loaded).toEqual([`${DRAFT}|c1|u1`]);
    expect(s.created).toEqual([{ inApp: false }]);
    expect(s.deleted).toEqual([]);
  });

  it("this person's own live draft on this charity: shown in the app, and the draft removed once sent", async () => {
    s.drafts[`${DRAFT}|c1|u1`] = { audience: "all", subject: "x", body: "y" };
    expect(await send({ in_app: "yes", draft: DRAFT })).toMatch(/^redirect:/);
    expect(s.created).toEqual([{ inApp: true }]);
    expect(s.deleted).toEqual([`${DRAFT}|c1|u1`]);
  });

  it("unticked: not in the app, and the sent draft is still removed", async () => {
    s.drafts[`${DRAFT}|c1|u1`] = { audience: "all", subject: "x", body: "y" };
    await send({ draft: DRAFT });
    expect(s.created).toEqual([{ inApp: false }]);
    expect(s.deleted).toEqual([`${DRAFT}|c1|u1`]);
  });

  it("a send that fails keeps the draft", async () => {
    s.drafts[`${DRAFT}|c1|u1`] = { audience: "all", subject: "x", body: "y" };
    s.sendFails = true;
    expect(await send({ in_app: "yes", draft: DRAFT })).toBe("email service down");
    expect(s.deleted).toEqual([]);
  });
});
