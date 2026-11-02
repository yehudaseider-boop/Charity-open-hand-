/** The payment provider's check of a charity's bank account, with the gateway faked: kept, shown, never blocking. */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/crypto", () => ({ decrypt: (s: string) => s.replace("enc:", ""), last4: (s: string) => s.slice(-4) }));

let priv: Record<string, string> | null = null;
let saved: Record<string, unknown> | null = null;
let stored: Record<string, unknown> | null = null;
let check: ((req: unknown) => Promise<unknown>) | undefined;
vi.mock("@/lib/gateway", () => ({
  getGateway: () => ({ name: "fake", checkBankAccount: check }),
  isGatewayRefusal: (e: unknown) => Boolean((e as { refused?: boolean })?.refused),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: table === "charity_private" ? priv : stored, error: null }),
        upsert: async (row: Record<string, unknown>) => ((saved = row), { error: null }),
      };
      return q;
    },
  }),
}));

const { bankCheckLines, checkCharityBank, loadBankCheck } = await import("@/lib/charity/bank-check");

beforeEach(() => {
  priv = { bank_name: "FNB", bank_account_holder: "Meals Fund NPC", bank_account_number_encrypted: "enc:62000001234" };
  saved = null;
  stored = null;
  check = undefined;
});

describe("checking a charity's bank account", () => {
  it("keeps the provider's answer, for the account it was about", async () => {
    let asked: unknown = null;
    check = async (req) => ((asked = req), { verified: true, accountOpen: true, acceptsCredits: true, holderMatches: true, openMoreThanThreeMonths: false, message: "OK" });
    const r = await checkCharityBank("c1", "u1");
    expect(asked).toEqual({ bankName: "FNB", accountNumber: "62000001234", accountHolder: "Meals Fund NPC" });
    expect(r).toMatchObject({ outcome: "checked", verified: true, open_three_months: false, account_last4: "1234" });
    expect(saved).toMatchObject({ charity_id: "c1", outcome: "checked", verified: true });
  });

  it("can't reach the provider: kept as 'not checked', and nothing is thrown", async () => {
    check = async () => {
      throw new Error("could not be reached");
    };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await checkCharityBank("c1", "u1");
    expect(r).toMatchObject({ outcome: "not_checked", verified: null });
    err.mockRestore();
  });

  it("the provider turned the account down: that is 'checked, not verified', not 'not checked'", async () => {
    check = async () => {
      throw Object.assign(new Error("Account not found"), { refused: true });
    };
    expect(await checkCharityBank("c1", "u1")).toMatchObject({ outcome: "checked", verified: false });
  });

  it("couldn't ask this time: an earlier answer about the same account is kept, not wiped", async () => {
    stored = { account_last4: "1234", outcome: "checked" };
    check = async () => {
      throw new Error("could not be reached");
    };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await checkCharityBank("c1", "u1");
    expect(saved).toBeNull();
    stored = { account_last4: "9999", outcome: "checked" };
    await checkCharityBank("c1", "u1");
    expect(saved).toMatchObject({ outcome: "not_checked", account_last4: "1234" });
    err.mockRestore();
  });

  it("the provider is slow: the page gets 'not checked yet', and the answer is still kept when it arrives", async () => {
    vi.useFakeTimers();
    let answer: (a: unknown) => void = () => {};
    check = () => new Promise((r) => (answer = r));
    try {
      const pending = checkCharityBank("c1", "u1");
      await vi.advanceTimersByTimeAsync(8_000);
      expect(await pending).toMatchObject({ outcome: "not_checked" });
      expect(saved).toMatchObject({ outcome: "not_checked", account_last4: "1234" });
      answer({ verified: true, accountOpen: true, acceptsCredits: true, holderMatches: true, openMoreThanThreeMonths: true, message: null });
      await vi.advanceTimersByTimeAsync(0);
      expect(saved).toMatchObject({ outcome: "checked", verified: true, account_last4: "1234" });
    } finally {
      vi.useRealTimers();
    }
  });

  describe("the charity saving its own details (each check costs money)", () => {
    const recent = () => ({ account_last4: "1234", checked_at: new Date(Date.now() - 60_000).toISOString(), outcome: "checked", verified: true });
    const sameAccount = { charitySave: { previousBankName: "FNB", previousLast4: "1234" } };
    const newAccount = { charitySave: { previousBankName: "FNB", previousLast4: "9999" } };
    let asked = 0;
    beforeEach(() => {
      asked = 0;
      check = async () => (asked++, { verified: true, accountOpen: true, acceptsCredits: true, holderMatches: true, openMoreThanThreeMonths: true, message: null });
    });

    it("the same bank and account, already checked: the provider isn't asked and the earlier answer is returned", async () => {
      stored = { ...recent(), checked_at: "2026-01-01T00:00:00Z" };
      expect(await checkCharityBank("c1", "u1", sameAccount)).toMatchObject({ outcome: "checked", verified: true });
      expect(asked).toBe(0);
      expect(saved).toBeNull();
    });

    it("a new account within a day of the last check: not asked yet", async () => {
      stored = recent();
      await checkCharityBank("c1", "u1", newAccount);
      expect(asked).toBe(0);
      expect(saved).toBeNull();
    });

    it("a new account, last checked more than a day ago: asked", async () => {
      stored = { ...recent(), checked_at: new Date(Date.now() - 25 * 60 * 60_000).toISOString() };
      expect(await checkCharityBank("c1", "u1", newAccount)).toMatchObject({ outcome: "checked" });
      expect(asked).toBe(1);
      expect(saved).toMatchObject({ outcome: "checked", account_last4: "1234" });
    });

    it("never checked before: asked", async () => {
      stored = null;
      await checkCharityBank("c1", "u1", sameAccount);
      expect(asked).toBe(1);
    });

    it("the admin's Check again always asks", async () => {
      stored = recent();
      await checkCharityBank("c1", "u1");
      expect(asked).toBe(1);
    });
  });

  it("a gateway with no check: 'not checked'", async () => {
    expect(await checkCharityBank("c1", null)).toMatchObject({ outcome: "not_checked" });
  });

  it("no bank details saved: nothing to check", async () => {
    priv = null;
    expect(await checkCharityBank("c1", null)).toBeNull();
    expect(saved).toBeNull();
  });
});

describe("showing it to the Givezy admin", () => {
  const row = { account_last4: "1234", checked_at: "2026-10-26T10:00:00Z", outcome: "checked", verified: false, account_open: true, accepts_credits: true, holder_matches: false, open_three_months: true, message: null };

  it("an answer about an earlier account is not shown", async () => {
    stored = row;
    expect(await loadBankCheck("c1", "1234")).toMatchObject({ verified: false });
    expect(await loadBankCheck("c1", "9999")).toBeNull();
    expect(await loadBankCheck("c1", null)).toBeNull();
  });

  it("says plainly what the bank did and didn't confirm, and never more", () => {
    const lines = bankCheckLines(row as never);
    expect(lines.headline).toBe("Checked with the bank: not verified");
    expect(lines.tone).toBe("warning");
    expect(lines.points).toContain("The bank didn't confirm the account holder's name.");
    expect(bankCheckLines(null)).toMatchObject({ headline: "Not checked yet", tone: "neutral" });
  });
});
