/** Admin reasons need at least 5 characters, and the message says so (review 18/11/2026). */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("@/lib/auth", () => ({ requirePlatformAdmin: async () => ({ userId: "11111111-1111-4111-8111-111111111111" }) }));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
const writes: string[] = [];
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (t: string) => (writes.push(t), {}) }) }));
const cancelled: unknown[] = [];
vi.mock("@/lib/receipts/runs", () => ({
  cancelRun: async (a: unknown) => (cancelled.push(a), true),
  finishRun: async () => ({ ok: true }),
  markRunStopped: async () => true,
  signOffRun: async () => ({ ok: true }),
}));

const { voidReceipt, sendBackReceipts } = await import("@/app/admin/receipts/actions");
const ID = "22222222-2222-4222-8222-222222222222";
const form = (reason: string) => {
  const f = new FormData();
  f.set("reason", reason);
  return f;
};

beforeEach(() => {
  writes.length = cancelled.length = 0;
});

describe("admin reasons", () => {
  it("withdrawing a receipt says a reason needs at least 5 characters", async () => {
    const r = await voidReceipt(ID, { ok: false }, form("typo"));
    expect(r.fieldErrors?.reason).toBe("Give a reason for the record, at least 5 characters");
    expect(writes).toHaveLength(0);
  });
  it("sending a list back says so too, and takes 5 characters", async () => {
    expect((await sendBackReceipts(ID, 10_000, { ok: false }, form("no"))).fieldErrors?.reason).toBe("Tell the charity why, in at least 5 characters");
    expect(cancelled).toHaveLength(0);
    expect((await sendBackReceipts(ID, 10_000, { ok: false }, form("Wrong"))).ok).toBe(true);
  });
});
