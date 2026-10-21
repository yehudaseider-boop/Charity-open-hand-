/**
 * A deposit from the payment provider, as a bookkeeper needs it (21/10/2026, Juan of the Angel Network):
 * which gifts it is made of, each gift's fee, what reached the bank, and a total that equals the bank
 * deposit. Pure: no database. The provider's figures are used as it gives them; the gift amount is ours
 * (the s18A receipt is always for the full gift). Anything that doesn't add up is said plainly, never hidden.
 */
import { formatRand } from "@/lib/money";

export type DepositLineIn = { kind: "payment" | "refund" | "chargeback" | "other"; donationId: string | null; grossCents: number; feeCents: number; netCents: number };
export type GiftIn = { id: string; amountCents: number; donorName: string; paidAt: string | null };

export type DepositRow = {
  kind: DepositLineIn["kind"];
  donationId: string | null;
  donorName: string;
  /** Our gift amount (what the s18A receipt is for), negative when money is taken back. Null when we can't match the line. */
  giftCents: number | null;
  feeCents: number;
  /** What this line added to the deposit, as the provider says. */
  netCents: number;
  /** Plain words when this line doesn't add up. */
  problem: string | null;
};

export type Deposit = {
  rows: DepositRow[];
  giftsCents: number;
  feesCents: number;
  netCents: number;
  /** The deposit amount, as the provider says. */
  depositCents: number;
  /** Every line adds up and the lines add up to the deposit. */
  balances: boolean;
  problems: string[];
};

const KIND_WORD = { payment: "Gift", refund: "Refund", chargeback: "Chargeback", other: "Other" } as const;
export const kindWord = (k: DepositLineIn["kind"]) => KIND_WORD[k];

export function buildDeposit(depositCents: number, lines: DepositLineIn[], gifts: Map<string, GiftIn>): Deposit {
  const rows: DepositRow[] = lines.map((l) => {
    const gift = l.donationId ? gifts.get(l.donationId) : undefined;
    if (!gift) {
      return { kind: l.kind, donationId: null, donorName: "Not one of your Givezy gifts", giftCents: null, feeCents: l.feeCents, netCents: l.netCents, problem: "The payment provider lists this, but it doesn't match a gift on Givezy. Tell us and we'll look into it." };
    }
    const giftCents = l.kind === "payment" ? gift.amountCents : -gift.amountCents;
    const expected = giftCents - l.feeCents;
    const problem =
      l.kind === "other"
        ? "The payment provider lists this line without saying what it is. Tell us and we'll look into it."
        : expected !== l.netCents
          ? `${formatRand(Math.abs(giftCents))} ${l.kind === "payment" ? "gift" : kindWord(l.kind).toLowerCase()}${l.feeCents ? ` less a ${formatRand(l.feeCents)} fee` : ""} should be ${formatRand(expected)}, but the payment provider shows ${formatRand(l.netCents)}. Tell us and we'll look into it.`
          : null;
    return { kind: l.kind, donationId: gift.id, donorName: gift.donorName, giftCents, feeCents: l.feeCents, netCents: l.netCents, problem };
  });
  const giftsCents = rows.reduce((t, r) => t + (r.giftCents ?? 0), 0);
  const feesCents = rows.reduce((t, r) => t + r.feeCents, 0);
  const netCents = rows.reduce((t, r) => t + r.netCents, 0);
  const problems = rows.filter((r) => r.problem).map((r) => r.problem!);
  if (netCents !== depositCents) {
    problems.push(`The lines add up to ${formatRand(netCents)}, but the deposit is ${formatRand(depositCents)}. Tell us and we'll look into it.`);
  }
  return { rows, giftsCents, feesCents, netCents, depositCents, balances: problems.length === 0, problems };
}
