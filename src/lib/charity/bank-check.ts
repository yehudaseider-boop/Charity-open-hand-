import "server-only";
import { logAudit } from "@/lib/audit";
import { decrypt, last4 } from "@/lib/crypto";
import { getGateway, isGatewayRefusal } from "@/lib/gateway";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The payment provider's check of a charity's bank account: is it open, does it take payments in, is it in the
 * charity's name. Run when the bank details are saved or changed, and again from the admin page. Information for the
 * Givezy admin only: it never approves anything, and nothing waits on it. If the provider can't be asked, the
 * answer is "not checked yet". Server only (service role): call after checking who is asking.
 */
export type BankCheckRow = {
  account_last4: string;
  checked_at: string;
  outcome: "checked" | "not_checked";
  verified: boolean | null;
  account_open: boolean | null;
  accepts_credits: boolean | null;
  holder_matches: boolean | null;
  open_three_months: boolean | null;
  message: string | null;
};

/** How long a save waits for the answer before it carries on (the check is then recorded as not checked). */
const WAIT_MS = 8_000;

/** Ask the payment provider about this charity's bank account and keep the answer. Never throws. */
export async function checkCharityBank(charityId: string, actorUserId: string | null): Promise<BankCheckRow | null> {
  try {
    const db = createAdminClient();
    const { data: priv, error } = await db
      .from("charity_private")
      .select("bank_name, bank_account_holder, bank_account_number_encrypted")
      .eq("charity_id", charityId)
      .maybeSingle();
    if (error || !priv?.bank_account_number_encrypted || !priv.bank_name || !priv.bank_account_holder) return null;
    const accountNumber = decrypt(priv.bank_account_number_encrypted as string);
    const row: BankCheckRow = { account_last4: last4(accountNumber), checked_at: new Date().toISOString(), outcome: "not_checked", verified: null, account_open: null, accepts_credits: null, holder_matches: null, open_three_months: null, message: null };
    const gateway = getGateway();
    if (gateway.checkBankAccount) {
      const answer = await Promise.race([
        gateway.checkBankAccount({ bankName: priv.bank_name as string, accountNumber, accountHolder: priv.bank_account_holder as string }).catch((e) => {
          // The provider answered and turned the account down (for example, no such account): that is an answer,
          // "not verified", never "not checked". An outage or an unsupported bank stays "not checked".
          if (isGatewayRefusal(e)) {
            return { verified: false, accountOpen: false, acceptsCredits: false, holderMatches: false, openMoreThanThreeMonths: false, message: "The check was turned down: the bank details may be wrong." };
          }
          console.error("[bank-check] not checked", e instanceof Error ? e.message : e);
          return null;
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), WAIT_MS)),
      ]);
      if (answer) {
        Object.assign(row, {
          outcome: "checked",
          verified: answer.verified,
          account_open: answer.accountOpen,
          accepts_credits: answer.acceptsCredits,
          holder_matches: answer.holderMatches,
          open_three_months: answer.openMoreThanThreeMonths,
          message: answer.message,
        });
      }
    }
    // Couldn't ask this time: an earlier answer about this same account stays, rather than being wiped.
    if (row.outcome === "not_checked") {
      const { data: earlier } = await db.from("charity_bank_checks").select("account_last4, outcome").eq("charity_id", charityId).maybeSingle();
      if (earlier?.outcome === "checked" && earlier.account_last4 === row.account_last4) return row;
    }
    const { error: saveError } = await db.from("charity_bank_checks").upsert({ charity_id: charityId, ...row }, { onConflict: "charity_id" });
    if (saveError) {
      console.error("[bank-check] not saved", saveError.message);
      return null;
    }
    await logAudit({ actorUserId, action: "charity.bank_checked", entityType: "charity", entityId: charityId, details: { outcome: row.outcome, verified: row.verified, last4: row.account_last4 } });
    return row;
  } catch (e) {
    console.error("[bank-check] failed", e instanceof Error ? e.message : e);
    return null;
  }
}

/** The latest check for this charity's current account, or null ("not checked yet"). Never throws. */
export async function loadBankCheck(charityId: string, currentLast4: string | null): Promise<BankCheckRow | null> {
  if (!currentLast4) return null;
  try {
    const { data, error } = await createAdminClient()
      .from("charity_bank_checks")
      .select("account_last4, checked_at, outcome, verified, account_open, accepts_credits, holder_matches, open_three_months, message")
      .eq("charity_id", charityId)
      .maybeSingle();
    if (error || !data) return null;
    // An answer about an earlier account (the details changed since) is not shown.
    return data.account_last4 === currentLast4 ? (data as BankCheckRow) : null;
  } catch {
    return null;
  }
}

/** The answer in plain words, for the admin page. */
export function bankCheckLines(c: BankCheckRow | null): { headline: string; tone: "neutral" | "success" | "warning"; points: string[] } {
  if (!c || c.outcome === "not_checked") {
    return { headline: "Not checked yet", tone: "neutral", points: ["The payment provider couldn't be asked about this account, or doesn't check accounts at this bank. Nothing is held up by it."] };
  }
  const yesNo = (v: boolean | null, yes: string, no: string) => (v ? yes : no);
  const points = [
    yesNo(c.account_open, "The account is open.", "The bank didn't confirm the account is open."),
    yesNo(c.accepts_credits, "It takes payments in.", "The bank didn't confirm it takes payments in."),
    yesNo(c.holder_matches, "It is in the account holder's name we hold.", "The bank didn't confirm the account holder's name."),
    yesNo(c.open_three_months, "It has been open for more than three months.", "It may be newer than three months."),
  ];
  if (c.message) points.push(`The bank said: ${c.message}`);
  return { headline: c.verified ? "Checked with the bank: verified" : "Checked with the bank: not verified", tone: c.verified ? "success" : "warning", points };
}
