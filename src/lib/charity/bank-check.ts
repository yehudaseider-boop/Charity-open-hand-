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
/** From the charity's side, the provider is asked at most this often (each check costs money in live mode). */
const CHARITY_CHECK_GAP_MS = 24 * 60 * 60_000;

const CHECK_COLUMNS = "account_last4, checked_at, outcome, verified, account_open, accepts_credits, holder_matches, open_three_months, message";

/**
 * The charity saving its own bank details: `previous` is what was saved before. The provider is not asked again when
 * the bank and the account's last four digits are unchanged and a check for that account already exists, nor more
 * than once a day for the charity. The admin's "Check again" passes nothing and always asks.
 */
export type BankCheckOptions = { charitySave?: { previousBankName: string | null; previousLast4: string | null } };

type Answer = { verified: boolean; accountOpen: boolean; acceptsCredits: boolean; holderMatches: boolean; openMoreThanThreeMonths: boolean; message: string | null };

/** Ask the payment provider about this charity's bank account and keep the answer. Never throws. */
export async function checkCharityBank(charityId: string, actorUserId: string | null, options: BankCheckOptions = {}): Promise<BankCheckRow | null> {
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
    const { data: earlierData } = await db.from("charity_bank_checks").select(CHECK_COLUMNS).eq("charity_id", charityId).maybeSingle();
    const earlier = (earlierData as BankCheckRow | null) ?? null;

    if (options.charitySave && earlier) {
      const { previousBankName, previousLast4 } = options.charitySave;
      const sameAccount = previousBankName === priv.bank_name && previousLast4 === row.account_last4;
      if (sameAccount && earlier.account_last4 === row.account_last4) return earlier;
      if (Date.now() - new Date(earlier.checked_at).getTime() < CHARITY_CHECK_GAP_MS) return earlier;
    }

    const save = async (r: BankCheckRow): Promise<boolean> => {
      const { error: saveError } = await db.from("charity_bank_checks").upsert({ charity_id: charityId, ...r }, { onConflict: "charity_id" });
      if (saveError) {
        console.error("[bank-check] not saved", saveError.message);
        return false;
      }
      await logAudit({ actorUserId, action: "charity.bank_checked", entityType: "charity", entityId: charityId, details: { outcome: r.outcome, verified: r.verified, last4: r.account_last4 } });
      return true;
    };
    const withAnswer = (a: Answer): BankCheckRow => ({ ...row, outcome: "checked", verified: a.verified, account_open: a.accountOpen, accepts_credits: a.acceptsCredits, holder_matches: a.holderMatches, open_three_months: a.openMoreThanThreeMonths, message: a.message });

    const gateway = getGateway();
    if (gateway.checkBankAccount) {
      const asked: Promise<Answer | null> = gateway.checkBankAccount({ bankName: priv.bank_name as string, accountNumber, accountHolder: priv.bank_account_holder as string }).catch((e) => {
        // The provider answered and turned the account down (for example, no such account): that is an answer,
        // "not verified", never "not checked". An outage or an unsupported bank stays "not checked".
        if (isGatewayRefusal(e)) {
          return { verified: false, accountOpen: false, acceptsCredits: false, holderMatches: false, openMoreThanThreeMonths: false, message: "The check was turned down: the bank details may be wrong." };
        }
        console.error("[bank-check] not checked", e instanceof Error ? e.message : e);
        return null;
      });
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = Symbol("timed out");
      const first = await Promise.race([asked, new Promise<typeof timedOut>((resolve) => (timer = setTimeout(() => resolve(timedOut), WAIT_MS)))]);
      clearTimeout(timer);
      if (first !== timedOut) {
        if (first) {
          const checked = withAnswer(first);
          return (await save(checked)) ? checked : null;
        }
      } else {
        // The page carries on as "not checked yet", but the provider's answer still costs money: keep it when it arrives.
        void asked
          .then(async (late) => {
            if (late) await save(withAnswer(late));
          })
          .catch((e) => console.error("[bank-check] late answer not kept", e instanceof Error ? e.message : e));
      }
    }
    // Couldn't ask this time: an earlier answer about this same account stays, rather than being wiped.
    if (earlier?.outcome === "checked" && earlier.account_last4 === row.account_last4) return row;
    return (await save(row)) ? row : null;
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
