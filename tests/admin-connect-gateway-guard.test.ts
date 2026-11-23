/**
 * Connecting a charity to the payment provider saves the provider's reference only if the bank account is still the one
 * that was sent (review 23/11/2026). The database, gateway and email are stand-ins.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
const { encrypt } = await import("@/lib/crypto");

const CHARITY = "11111111-1111-1111-1111-111111111111";
const CIPHER = encrypt("1234567890");
let rpcAnswer: boolean | null;
let rpcArgs: Record<string, unknown> | null;
let directCharityWrites = 0;
let rpcMissing = false;
let reads = 0;
let laterCipher: string | null = null;
const audits: Record<string, unknown>[] = [];
const emails: string[] = [];

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({ requirePlatformAdmin: async () => ({ userId: "admin1" }) }));
vi.mock("@/lib/audit", () => ({ logAudit: async (e: Record<string, unknown>) => void audits.push(e) }));
vi.mock("@/lib/charity/emails", async (orig) => ({ ...(await orig<object>()), notifyCharity: async (m: { to: string }) => (emails.push(m.to), true) }));
vi.mock("@/lib/charity/queries", () => ({
  loadCharityForManager: async () => ({ charity: { id: CHARITY, slug: "meals", name_en: "Meals Fund", legal_name_en: "Meals Fund NPC", status: "approved" }, priv: { contact_email: "office@meals.test" } }),
}));
vi.mock("@/lib/gateway", () => ({
  getGateway: () => ({ name: "test", createCharityAccount: async () => ({ accountRef: "ACCT_new" }) }),
  GatewayError: class extends Error {},
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name !== "set_charity_gateway_ref") throw new Error(`unexpected ${name}`);
      rpcArgs = args;
      if (rpcMissing) return { data: null, error: { code: "PGRST202", message: "Could not find the function public.set_charity_gateway_ref" } };
      return { data: rpcAnswer, error: null };
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { bank_name: "FNB", bank_account_holder: "Meals Fund NPC", bank_account_number_encrypted: reads++ > 0 && laterCipher ? laterCipher : CIPHER, bank_branch_code: "250655", bank_verified_at: "2026-11-20T08:00:00Z" }, error: null }),
        }),
      }),
      update: () => {
        if (table === "charities") directCharityWrites++;
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));

const { connectToGateway } = await import("@/app/admin/charities/[id]/actions");

beforeEach(() => {
  rpcAnswer = true;
  rpcArgs = null;
  directCharityWrites = 0;
  rpcMissing = false;
  reads = 0;
  laterCipher = null;
  audits.length = 0;
  emails.length = 0;
});

describe("connecting a charity to the payment provider", () => {
  it("saves the reference through the guarded step, naming the bank account that was sent", async () => {
    const r = await connectToGateway(CHARITY, { ok: false });
    expect(r.ok).toBe(true);
    expect(rpcArgs).toMatchObject({ p_charity_id: CHARITY, p_account_ref: "ACCT_new", p_account_number_encrypted: CIPHER, p_bank_verified_at: "2026-11-20T08:00:00Z" });
    expect(directCharityWrites).toBe(0);
    expect(audits).toHaveLength(1);
  });

  it("the bank details changed while connecting: nothing is connected, said plainly, no audit entry, no email", async () => {
    rpcAnswer = false;
    const r = await connectToGateway(CHARITY, { ok: false });
    expect(r).toEqual({ ok: false, message: "The bank details changed while connecting. Nothing was connected. Connect again." });
    expect(audits).toHaveLength(0);
    expect(emails).toHaveLength(0);
  });

  it("before database change 000009 is in, it checks the account again and saves the reference directly", async () => {
    rpcMissing = true;
    const r = await connectToGateway(CHARITY, { ok: false });
    expect(r.ok).toBe(true);
    expect(directCharityWrites).toBe(1);
    expect(audits).toHaveLength(1);
  });

  it("before database change 000009 is in, a bank account changed meanwhile is still refused, and nothing is saved", async () => {
    rpcMissing = true;
    laterCipher = encrypt("9999999999");
    const r = await connectToGateway(CHARITY, { ok: false });
    expect(r).toEqual({ ok: false, message: "The bank details changed while connecting. Nothing was connected. Connect again." });
    expect(directCharityWrites).toBe(0);
    expect(audits).toHaveLength(0);
  });
});
