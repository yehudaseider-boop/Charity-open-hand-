import "server-only";
import { WINBACK_SCREEN_CAP } from "./journey";
import { keepingDetails, keepingListRows, keepingWindow, keepingYearKey } from "./keeping-donors";
import { loadKeepingDonors } from "./keeping-donors-queries";
import { lapsedDetails, lapsedPeriod, lapsedPeriodKey } from "./lapsed-monthly";
import { loadLapsedMonthly } from "./lapsed-monthly-queries";

/**
 * The lists donors can be added to the win-back journey from (CRM step 7): monthly donors who stopped in a period, and
 * the keeping-donors lists of donors who haven't given since. The page and the action both work the list out again
 * here, so only donors really on the named list can be added, whatever ids a form sends.
 */
export type WinbackSource = { list: "stopped"; period: string } | { list: "lybunt" | "sybunt"; year: string };

/** The list a link or form names, or null when it names none of them. */
export function winbackSource(sp: { list?: unknown; period?: unknown; year?: unknown }): WinbackSource | null {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  if (sp.list === "stopped") return { list: "stopped", period: lapsedPeriodKey(s(sp.period)) };
  if (sp.list === "lybunt" || sp.list === "sybunt") return { list: sp.list, year: keepingYearKey(s(sp.year)) };
  return null;
}

/** Everyone on the list with a page of their own (erased donors have none), in the list's order, up to the screening cap. */
export async function winbackListDonors(charityId: string, source: WinbackSource, now = new Date()): Promise<string[]> {
  const ids =
    source.list === "stopped"
      ? (await loadLapsedMonthly(charityId, lapsedPeriod(lapsedPeriodKey(source.period), now))).map((r) => lapsedDetails(r).donorId)
      : keepingListRows(await loadKeepingDonors(charityId, keepingWindow(keepingYearKey(source.year), now)), source.list).map((r) => keepingDetails(r).donorId);
  return [...new Set(ids.filter((x): x is string => Boolean(x)))].slice(0, WINBACK_SCREEN_CAP);
}
