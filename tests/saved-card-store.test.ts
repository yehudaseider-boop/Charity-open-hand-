/**
 * Keeping the card once the payment is confirmed: only when the donor asked, only a card the provider
 * lets us charge again, stored encrypted, and safe to run twice.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let request: { user_id: string } | null = null;
const upserts: { table: string; row: Record<string, unknown> }[] = [];
const deletes: string[] = [];
let failSave = false;

function builder(table: string) {
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.eq = () => b;
  b.maybeSingle = async () => ({ data: table === "card_save_requests" ? request : null, error: null });
  b.upsert = async (row: Record<string, unknown>) => (upserts.push({ table, row }), { error: failSave && table === "saved_cards" ? { message: "no" } : null });
  b.delete = () => ({ eq: async () => (deletes.push(table), request = null, { error: null }) });
  return b;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: builder }) }));

const { finishCardSave, requestCardSave, cardSaveWaitingFor } = await import("@/lib/donations/saved-card");
const { decrypt } = await import("@/lib/crypto");

const tx = (reusable: boolean) => ({
  reference: "r", status: "success" as const, amountCents: 100, currency: "ZAR", gatewayTransactionId: "t",
  authorization: { code: "AUTH_CODE_1", reusable, last4: "4242", brand: "visa", expires: "12/2030" },
});

beforeEach(() => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  request = { user_id: "u1" };
  upserts.length = 0;
  deletes.length = 0;
  failSave = false;
});

describe("finishCardSave", () => {
  it("keeps a reusable card encrypted, with only its brand, ending and expiry in the clear", async () => {
    expect(await finishCardSave("d1", tx(true), "test")).toBe("saved");
    const row = upserts.find((u) => u.table === "saved_cards")!.row;
    expect(row).toMatchObject({ user_id: "u1", card_brand: "visa", card_last4: "4242", card_exp: "12/2030", gateway: "test" });
    expect(String(row.authorization_encrypted)).not.toContain("AUTH_CODE_1");
    expect(decrypt(String(row.authorization_encrypted))).toBe("AUTH_CODE_1");
    expect(deletes).toEqual(["card_save_requests"]);
  });

  it("keeps nothing when the provider will not let us charge the card again, and closes the request", async () => {
    expect(await finishCardSave("d1", tx(false), "test")).toBe("not_reusable");
    expect(upserts.some((u) => u.table === "saved_cards")).toBe(false);
    expect(deletes).toEqual(["card_save_requests"]);
  });

  it("does nothing when the donor never asked, and the second run changes nothing", async () => {
    request = null;
    expect(await finishCardSave("d1", tx(true), "test")).toBe("none");
    expect(upserts).toHaveLength(0);
    request = { user_id: "u1" };
    await finishCardSave("d1", tx(true), "test");
    upserts.length = 0;
    expect(await finishCardSave("d1", tx(true), "test")).toBe("none");
    expect(upserts).toHaveLength(0);
  });

  it("keeps the request open when the card could not be written, so a later look tries again", async () => {
    failSave = true;
    await expect(finishCardSave("d1", tx(true), "test")).rejects.toThrow(/keep the card/);
    expect(deletes).toHaveLength(0);
    expect(await cardSaveWaitingFor("d1")).toBe(true);
  });

  it("records a request against the donation and the account", async () => {
    await requestCardSave("d9", "u9");
    expect(upserts).toEqual([{ table: "card_save_requests", row: { donation_id: "d9", user_id: "u9" } }]);
  });
});
