/**
 * What a gift pays for, in the charity's own figure: "R12 pays for one school breakfast". The charity sets the
 * cost of one thing and what it is called (one and many); every line here is worked out from that and the
 * gift, never made up. Whole cents only. Kept free of other packages: the phone app uses it too.
 */
import { formatRand, parseRandToCents, usesCommaThousands } from "../money";

export type ImpactUnit = { cents: number; one: string; many: string };

export const IMPACT_UNIT_MIN_CENTS = 100; // R1
export const IMPACT_UNIT_MAX_CENTS = 10_000_000; // R100 000
export const IMPACT_LABEL_MAX = 60;

/** The charity's figure from its row, or null when it hasn't set one (or the row is incomplete). */
export function impactUnitFrom(row: { impact_unit_cents?: number | string | null; impact_unit_one?: string | null; impact_unit_many?: string | null } | null | undefined): ImpactUnit | null {
  if (!row || row.impact_unit_cents == null) return null;
  const cents = Number(row.impact_unit_cents);
  const one = row.impact_unit_one?.trim();
  const many = row.impact_unit_many?.trim();
  if (!Number.isSafeInteger(cents) || cents < IMPACT_UNIT_MIN_CENTS || !one || !many) return null;
  return { cents, one, many };
}

/** How many whole things the amount pays for (rounded down: never more than the gift covers). */
export function impactCount(amountCents: number, unit: ImpactUnit): number {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return 0;
  return Math.floor(amountCents / unit.cents);
}

const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** "one school breakfast", "30 school breakfasts", "4 523 school breakfasts". */
export function impactQuantity(count: number, unit: ImpactUnit): string {
  return count === 1 ? `one ${unit.one}` : `${grouped(count)} ${unit.many}`;
}

/**
 * "R360 pays for 30 school breakfasts" ("Your R360 ..." with `you`; "R360 a month pays for 30 school breakfasts
 * a month" for a monthly gift). Null below the cost of one thing: a smaller gift still helps, but we don't
 * invent a fraction of a breakfast.
 */
export function impactLine(amountCents: number, unit: ImpactUnit, opts: { you?: boolean; monthly?: boolean } = {}): string | null {
  const n = impactCount(amountCents, unit);
  if (n < 1) return null;
  const a = opts.monthly ? " a month" : "";
  return `${opts.you ? "Your " : ""}${formatRand(amountCents)}${a} pays for ${impactQuantity(n, unit)}${a}`;
}

/** Where the figure comes from, said every time it is shown: "Figure from PSFA: R12 pays for one school breakfast." */
export function impactSource(charityName: string, unit: ImpactUnit): string {
  return `Figure from ${charityName}: ${formatRand(unit.cents)} pays for one ${unit.one}.`;
}

/** For the charity's own reports: "about 4 523 school breakfasts" (null when the total covers none). */
export function impactTotal(totalCents: number, unit: ImpactUnit): string | null {
  const n = impactCount(totalCents, unit);
  return n < 1 ? null : `about ${impactQuantity(n, unit)}`;
}

/**
 * Check what the charity typed. All three empty clears the figure; otherwise all three are needed. The names
 * must not start with a number (we add the number), and are kept as typed apart from spaces and a final full stop.
 */
export function checkImpactUnit(raw: { amount?: string | null; one?: string | null; many?: string | null }):
  | { ok: true; unit: ImpactUnit | null }
  | { ok: false; fieldErrors: Record<string, string> } {
  const amount = (raw.amount ?? "").trim();
  const clean = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ").replace(/\.$/, "");
  const one = clean(raw.one), many = clean(raw.many);
  if (!amount && !one && !many) return { ok: true, unit: null };
  const errors: Record<string, string> = {};
  if (!amount) errors.impact_unit_amount = "Enter what one costs, for example 12";
  else if (usesCommaThousands(amount)) errors.impact_unit_amount = "Use a space or nothing for thousands, for example 1250 or 1 250";
  else {
    const cents = parseRandToCents(amount);
    if (cents == null) errors.impact_unit_amount = "Use numbers only, for example 12 or 12.50";
    else if (cents < IMPACT_UNIT_MIN_CENTS) errors.impact_unit_amount = `The smallest is ${formatRand(IMPACT_UNIT_MIN_CENTS)}`;
    else if (cents > IMPACT_UNIT_MAX_CENTS) errors.impact_unit_amount = `The largest is ${formatRand(IMPACT_UNIT_MAX_CENTS)}`;
  }
  for (const [key, v, eg] of [["impact_unit_one", one, "school breakfast"], ["impact_unit_many", many, "school breakfasts"]] as const) {
    if (!v) errors[key] = `Say what it pays for, for example ${eg}`;
    else if (v.length > IMPACT_LABEL_MAX) errors[key] = `Please keep it to ${IMPACT_LABEL_MAX} characters or fewer`;
    else if (/^\d/.test(v)) errors[key] = "Leave the number out: we add it, for example school breakfast";
  }
  if (Object.keys(errors).length) return { ok: false, fieldErrors: errors };
  return { ok: true, unit: { cents: parseRandToCents(amount) as number, one, many } };
}
