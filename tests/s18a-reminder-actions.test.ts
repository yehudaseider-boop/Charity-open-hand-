/** "Remind to add their details" (CRM step 2, 10/11/2026): only the owner of a live charity, for their own charity, within the day's limit. */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const OTHER = "2f9a2c71-0b1d-4e5f-9a8b-123456789abc";
const MINE = "1f9a2c71-0b1d-4e5f-9a8b-123456789abc";
const D1 = "0f9a2c71-0b1d-4e5f-9a8b-123456789abc";
let owner = true;
let status = "approved";
let limited = false;
let counted = 0;
let result = { sent: 1, failed: 0, remaining: 0, interrupted: false, done: "a1" as string | null };
const sends: unknown[] = [];
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));
vi.mock("@/lib/auth", () => ({ requireViewer: async () => ({ userId: "u1", email: "owner@x.co" }) }));
vi.mock("@/lib/charity/queries", () => ({
  loadCharityForManager: async (id: string) => {
    if (id !== MINE) throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    return { charity: { id, name_en: "Meals Fund", status }, priv: { contact_email: "office@meals.org" } };
  },
}));
vi.mock("@/lib/charity/team", () => ({ isOwner: async () => owner }));
vi.mock("@/lib/rate-limit", () => ({ rateLimitReached: async () => limited, hitRateLimit: async () => (counted++, limited) }));
const NONE = { not_found: 0, erased: 0, complete: 0, recorded_only: 0, opted_out: 0, this_week: 0 };
vi.mock("@/lib/charity/s18a-reminder-send", () => ({
  sendS18aReminders: async (a: unknown) => (sends.push(a), { ...result, skipped: { ...NONE, ...("skipped" in result ? (result.skipped as object) : {}) } }),
}));
const { remindS18aDetails } = await import("@/app/charity-admin/[id]/donors/reminder-actions");
const chosen = (...ids: string[]) => {
  const f = new FormData();
  for (const id of ids) f.append("donor", id);
  return f;
};

describe("who may send reminders", () => {
  beforeEach(() => {
    owner = true;
    status = "approved";
    limited = false;
    counted = 0;
    result = { sent: 1, failed: 0, remaining: 0, interrupted: false, done: "a1" };
    sends.length = 0;
  });
  it("another charity's dashboard is refused before anything is read or sent", async () => {
    await expect(remindS18aDetails(OTHER, "/x", { ok: false }, chosen(D1))).rejects.toThrow(/404/);
    expect(sends).toEqual([]);
  });
  it("an admin who isn't the owner is refused, as for Email donors", async () => {
    owner = false;
    expect(await remindS18aDetails(MINE, "/x", { ok: false }, chosen(D1))).toEqual({ ok: false, message: "Only your charity's owner can send reminders. Nothing was sent." });
    expect(sends).toEqual([]);
  });
  it("needs a live page, a choice, and stays within the day's limit", async () => {
    status = "pending_review";
    expect((await remindS18aDetails(MINE, "/x", { ok: false }, chosen(D1))).message).toMatch(/once your page is live/);
    status = "approved";
    expect((await remindS18aDetails(MINE, "/x", { ok: false }, chosen("not-an-id"))).message).toBe("Choose at least one donor first. Nothing was sent.");
    limited = true;
    expect((await remindS18aDetails(MINE, "/x", { ok: false }, chosen(D1))).message).toMatch(/the most for one day. Nothing was sent/);
    expect(sends).toEqual([]);
  });
  it("the owner of a live charity sends, and lands back on the list with the record", async () => {
    await expect(remindS18aDetails(MINE, `/charity-admin/${MINE}/donors?s18a=details_missing`, { ok: false }, chosen(D1, D1))).rejects.toThrow(
      `redirect:/charity-admin/${MINE}/donors?s18a=details_missing&done=a1`,
    );
    expect(sends).toEqual([{ charityId: MINE, charityName: "Meals Fund", donorIds: [D1], userId: "u1", replyTo: "office@meals.org" }]);
    expect(counted).toBe(1);
  });
  it("a press where everyone is skipped doesn't count towards the day's limit", async () => {
    result = { sent: 0, failed: 0, remaining: 0, interrupted: false, done: null, skipped: { ...NONE, this_week: 1 } } as typeof result;
    const r = await remindS18aDetails(MINE, "/x", { ok: false }, chosen(D1));
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/already had a message from you this week/);
    expect(counted).toBe(0);
  });
  it("over the limit of donors at once, says how to narrow the list", async () => {
    const many = Array.from({ length: 2001 }, (_, i) => `${String(i).padStart(8, "0")}-0b1d-4e5f-9a8b-123456789abc`);
    expect((await remindS18aDetails(MINE, "/x", { ok: false }, chosen(...many))).message).toMatch(/You can remind up to 2.000 donors at a time\. Nothing was sent\. Narrow the list with a group, tag or search\./);
    expect(sends).toEqual([]);
  });
  it("stopped part way: lands on the record of what was sent, written by the sender", async () => {
    result = { sent: 2, failed: 0, remaining: 3, interrupted: true, done: "a2" };
    await expect(remindS18aDetails(MINE, `/charity-admin/${MINE}/donors`, { ok: false }, chosen(D1))).rejects.toThrow(`redirect:/charity-admin/${MINE}/donors?done=a2`);
    expect(counted).toBe(1);
  });
});
