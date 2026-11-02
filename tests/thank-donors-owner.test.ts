/** The monthly thank-you is the owner's to send (Yehuda, 02/11/2026), as Email donors is: another admin sends nothing. */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
let owner = false;
const sends: string[] = [];
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));
vi.mock("@/lib/auth", () => ({ requireViewer: async () => ({ userId: "u1", email: "admin@x.co" }) }));
vi.mock("@/lib/charity/queries", () => ({ loadCharityForManager: async () => ({ charity: { id: "c1", name_en: "Meals Fund", status: "approved" }, priv: null }) }));
vi.mock("@/lib/charity/team", () => ({ isOwner: async () => owner }));
vi.mock("@/lib/charity/charity-actions", () => ({ recordAction: async () => "a1" }));
vi.mock("@/lib/charity/thank-you-send", () => ({
  sendThankYou: async (a: { month: string }) => (sends.push(`send:${a.month}`), { ok: true, sent: 1, failed: 0, remaining: 0 }),
  continueThankYou: async (a: { month: string }) => (sends.push(`rest:${a.month}`), { ok: true, sent: 1, failed: 0, remaining: 0 }),
}));

const { sendRestOfThankYou, sendThankDonors } = await import("@/app/charity-admin/[id]/thank-donors/actions");
const { recentMonths } = await import("@/lib/charity/thank-you");
const month = recentMonths(new Date())[0];
const form = () => {
  const f = new FormData();
  f.set("body", "Thank you for every gift this month.");
  return f;
};

beforeEach(() => {
  sends.length = 0;
});

describe("thank donors: owner only", () => {
  it("an admin who isn't the owner can't send or finish a thank-you, and nothing goes", async () => {
    owner = false;
    const message = "Only your charity's owner can send thank-yous. Nothing was sent.";
    expect(await sendThankDonors("c1", month, { ok: false }, form())).toEqual({ ok: false, message });
    expect(await sendRestOfThankYou("c1", month, { ok: false }, form())).toEqual({ ok: false, message });
    expect(sends).toEqual([]);
  });

  it("the owner can", async () => {
    owner = true;
    await expect(sendThankDonors("c1", month, { ok: false }, form())).rejects.toThrow(/redirect:.*done=a1/);
    await expect(sendRestOfThankYou("c1", month, { ok: false }, form())).rejects.toThrow(/redirect:.*done=a1/);
    expect(sends).toEqual([`send:${month}`, `rest:${month}`]);
  });
});
