/**
 * A platform admin changing a charity's bank details: the safeguards around it.
 * The database, email and audit log are stand-ins.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");

const CHARITY = "11111111-1111-1111-1111-111111111111";
let charity: { id: string; slug: string; name_en: string; gateway: string | null; gateway_subaccount_ref: string | null } | null;
let priv: { bank_name: string; bank_account_last4: string; contact_email: string | null };
let privUpdate: Record<string, unknown> | null;
let charityUpdate: Record<string, unknown> | null;
const audits: Record<string, unknown>[] = [];
const emails: { to: string; subject: string; text: string }[] = [];
let mailFails = false;

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({ requirePlatformAdmin: async () => ({ userId: "admin1" }) }));
vi.mock("@/lib/audit", () => ({ logAudit: async (e: Record<string, unknown>) => void audits.push(e) }));
vi.mock("@/lib/email", () => ({ getEmailTransport: () => ({ send: async (m: { to: string; subject: string; text: string }) => (mailFails ? Promise.reject(new Error("mail down")) : void emails.push(m)) }) }));
vi.mock("@/lib/charity/queries", () => ({ loadCharityForManager: async () => ({}) }));
vi.mock("@/lib/gateway", () => ({ getGateway: () => ({ name: "test" }), GatewayError: class extends Error {} }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: table === "charities" ? charity : priv, error: null }),
        update: (patch: Record<string, unknown>) => {
          if (table === "charity_private") privUpdate = patch;
          else charityUpdate = patch;
          return { eq: async () => ({ error: null }) };
        },
      };
      return q;
    },
  }),
}));

const { changeBankDetails } = await import("@/app/admin/charities/[id]/actions");
const form = (o: Record<string, string> = {}) => {
  const fd = new FormData();
  const all = { bank_name: "Nedbank", bank_account_holder: "Meals Fund NPC", bank_account_number: "1234567890", bank_branch_code: "198765", checked_letter: "on", ...o };
  for (const [k, v] of Object.entries(all)) if (v !== "") fd.set(k, v);
  return fd;
};

beforeEach(() => {
  charity = { id: CHARITY, slug: "meals", name_en: "Meals Fund", gateway: "test", gateway_subaccount_ref: "ACCT_old" };
  priv = { bank_name: "FNB", bank_account_last4: "4321", contact_email: "office@meals.example.co.za" };
  privUpdate = charityUpdate = null;
  audits.length = 0;
  emails.length = 0;
  mailFails = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("changing a charity's bank details", () => {
  it("saves the new account (account number encrypted), marks it verified, and takes the charity off the gateway", async () => {
    const r = await changeBankDetails(CHARITY, { ok: false }, form());
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/off the payment gateway/);
    expect(privUpdate).toMatchObject({ bank_name: "Nedbank", bank_account_holder: "Meals Fund NPC", bank_account_last4: "7890", bank_branch_code: "198765" });
    expect(String(privUpdate!.bank_account_number_encrypted)).toMatch(/^v1\./);
    expect(JSON.stringify(privUpdate)).not.toContain("1234567890");
    expect(privUpdate!.bank_verified_at).toEqual(expect.any(String));
    expect(charityUpdate).toEqual({ gateway: null, gateway_subaccount_ref: null });
  });

  it("logs the change with the last four digits only, never the full number", async () => {
    await changeBankDetails(CHARITY, { ok: false }, form());
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: "charity.bank_details_changed", entityId: CHARITY, actorUserId: "admin1" });
    expect(audits[0].details).toMatchObject({ from: { last4: "4321" }, to: { last4: "7890" }, gateway_disconnected: true });
    expect(JSON.stringify(audits)).not.toContain("1234567890");
  });

  it("tells the charity's contact, with the last four digits only", async () => {
    await changeBankDetails(CHARITY, { ok: false }, form());
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe("office@meals.example.co.za");
    expect(emails[0].text).toContain("ends in 7890");
    expect(emails[0].text).not.toContain("1234567890");
    expect(emails[0].text).not.toMatch(/[!—]/);
  });

  it("a charity that was not yet on the gateway is left as it is", async () => {
    charity!.gateway = null;
    charity!.gateway_subaccount_ref = null;
    const r = await changeBankDetails(CHARITY, { ok: false }, form());
    expect(r.ok).toBe(true);
    expect(charityUpdate).toBeNull();
  });

  it("needs the bank letter to be checked", async () => {
    const r = await changeBankDetails(CHARITY, { ok: false }, form({ checked_letter: "" }));
    expect(r.ok).toBe(false);
    expect(r.fieldErrors?.checked_letter).toBeTruthy();
    expect(privUpdate).toBeNull();
  });

  it("refuses an account number or branch code that is not valid, and an unknown bank", async () => {
    const bads: Record<string, string>[] = [{ bank_account_number: "12 34" }, { bank_account_number: "123" }, { bank_branch_code: "1234" }, { bank_name: "Fake Bank" }, { bank_account_holder: "" }];
    for (const bad of bads) {
      const r = await changeBankDetails(CHARITY, { ok: false }, form(bad));
      expect(r.ok).toBe(false);
    }
    expect(privUpdate).toBeNull();
    expect(emails).toHaveLength(0);
  });

  it("refuses an id that is not a charity", async () => {
    const r = await changeBankDetails("not-an-id", { ok: false }, form());
    expect(r).toMatchObject({ ok: false, message: "Unknown charity." });
    expect(privUpdate).toBeNull();
  });

  it("a failed email never undoes the change", async () => {
    mailFails = true;
    const r = await changeBankDetails(CHARITY, { ok: false }, form());
    expect(r.ok).toBe(true);
    expect(privUpdate).not.toBeNull();
  });
});
