/**
 * s18A details after paying (decided 04/11/2026: take the gift first, the s18A details after). A donor who asks
 * for an s18A receipt may choose "Add my details after paying": the gift is paid without the SA ID number (or a
 * company's or trust's registration number) and the address, and the donor adds them on the thank-you page or
 * later from their account. Until they do, the gift is not receiptable: the receipt run lists it as
 * "details missing" and never issues a receipt without the required particulars.
 *
 * The rules (what is missing, what may be completed, what a completion must contain) live here, with no
 * database, so they can be tested.
 */
import { platformConfig } from "@/config/platform";
import { taxYearFor, zonedParts } from "@/lib/dates";
import { isValidCompanyRegistration } from "@/lib/sars-numbers";
import { cleanDedicationName } from "./dedication";
import { cleanSaIdNumber } from "./monthly-id-nudge";

/** A gift's checkout details, as far as the s18A particulars go. */
export type S18aDetailsRow = {
  donor_type: string;
  id_number_encrypted: string | null;
  tax_reference_encrypted?: string | null;
  registration_number: string | null;
  address_line1: string | null;
  erased_at?: string | null;
};

export type MissingDetail = "id_number" | "registration_number" | "address";

/**
 * What an s18A gift still lacks for its receipt. A person needs an SA ID number (an older gift with only an income
 * tax number still counts: those donors are asked on the account page, decided 03/11/2026), a company or trust its
 * registration number, and everyone an address. Empty when nothing is missing.
 */
export function s18aDetailsMissing(d: S18aDetailsRow): MissingDetail[] {
  const out: MissingDetail[] = [];
  if (d.donor_type === "individual") {
    if (!d.id_number_encrypted && !d.tax_reference_encrypted) out.push("id_number");
  } else if (!d.registration_number?.trim()) {
    out.push("registration_number");
  }
  if (!d.address_line1?.trim()) out.push("address");
  return out;
}

/** "your SA ID number and address", for a sentence. */
export function missingWords(missing: MissingDetail[], who: "your" | "their" = "your"): string {
  const words = missing.map((m) => (m === "id_number" ? "SA ID number" : m === "registration_number" ? "registration number" : "address"));
  if (!words.length) return "";
  return `${who} ${words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words.at(-1)}` : words[0]}`;
}

export type CompletableGift = {
  id: string;
  status: string;
  wants_18a: boolean | null;
  tax_year: number | null;
  donor_id: string;
  recurring_id?: string | null;
};

/**
 * Which tax years' gifts may still have their s18A details added (decided 04/11/2026): the current tax year, and the
 * tax year just closed only until 31 May of the year it closed (platformConfig.taxYear.lateDetailsUntil, the annual
 * IT3(d) date; from secondary sources, on the go-live list), all in Johannesburg time.
 */
export type CompletionWindow = { taxYear: number; closedYearOpen: boolean };

export function completionWindow(now: Date): CompletionWindow {
  const taxYear = taxYearFor(now);
  const { year, month, day } = zonedParts(now);
  const until = platformConfig.taxYear.lateDetailsUntil;
  // The closed year (taxYear - 1) ended in February of `taxYear - 1`; its late window ends on `until` of that year.
  const closedYearOpen = year === taxYear - 1 && (month < until.month || (month === until.month && day <= until.day));
  return { taxYear, closedYearOpen };
}

/** Is a gift of this tax year inside the window. */
export function inCompletionWindow(giftTaxYear: number | null | undefined, w: CompletionWindow): boolean {
  if (giftTaxYear === w.taxYear) return true;
  return giftTaxYear === w.taxYear - 1 && w.closedYearOpen;
}

/** The last day the details can be added for a gift of this tax year, as dd/mm/yyyy (the closed year's IT3(d) date). */
export function lateDetailsDeadline(closedTaxYear: number): string {
  const { month, day } = platformConfig.taxYear.lateDetailsUntil;
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${closedTaxYear}`;
}

/**
 * May this gift's s18A details be completed now: a paid gift that asked for an s18A receipt, inside the completion
 * window (see `completionWindow`), not on an issued s18A receipt, with details that are not erased and still lack
 * something. With `donorIds`, only the signed-in person's own gifts.
 */
export function canCompleteS18a(
  gift: CompletableGift,
  details: S18aDetailsRow | null | undefined,
  scope: { window: CompletionWindow; onIssuedReceipt: ReadonlySet<string>; donorIds?: ReadonlySet<string> },
): boolean {
  if (gift.status !== "paid" || !gift.wants_18a) return false;
  if (!inCompletionWindow(gift.tax_year, scope.window)) return false;
  if (scope.onIssuedReceipt.has(gift.id)) return false;
  if (scope.donorIds && !scope.donorIds.has(gift.donor_id)) return false;
  if (!details || details.erased_at) return false;
  return s18aDetailsMissing(details).length > 0;
}

/**
 * The other gifts that take the same details, for a monthly donation: its first gift (every new monthly gift is
 * copied from it, so the details cover future gifts too) and its other s18A gifts still lacking details, all inside
 * the same window as the gift itself (no older years) and not on an issued receipt. Paid gifts, and gifts still
 * waiting for the payment provider (a pending gift was copied from the first gift before the details were added; a
 * pending gift has no tax year yet and takes the current one once paid). Never another failed or refunded gift (the
 * first gift is taken whatever its own status, as the source of future gifts), never another donor's.
 */
export function monthlyGiftsToComplete(
  gifts: (CompletableGift & { details: S18aDetailsRow | null })[],
  scope: { recurringId: string; donorId: string; firstDonationId?: string | null; window: CompletionWindow; onIssuedReceipt: ReadonlySet<string> },
): string[] {
  const out: string[] = [];
  for (const g of gifts) {
    if (g.recurring_id !== scope.recurringId || g.donor_id !== scope.donorId || !g.wants_18a) continue;
    // The first gift is the copy source whatever became of its own payment; the others only while they can still count.
    if (g.id !== scope.firstDonationId && g.status !== "paid" && g.status !== "pending") continue;
    if (!g.details || g.details.erased_at || s18aDetailsMissing(g.details).length === 0) continue;
    if (scope.onIssuedReceipt.has(g.id)) continue;
    const year = g.status === "pending" && g.tax_year == null ? scope.window.taxYear : g.tax_year;
    if (!inCompletionWindow(year, scope.window)) continue;
    out.push(g.id);
  }
  return out;
}

export type S18aCompletion = {
  /** A person's SA ID number, when it was missing (or typed again, to compare with the one on file). */
  idNumber?: string;
  /** A company's or trust's registration number, when it was missing (or typed again, to compare). */
  registrationNumber?: string;
  /** The address, only when it was missing. */
  address?: { address_line1: string; address_line2: string | null; suburb: string | null; city: string; postal_code: string };
};

const text = (v: unknown, max: number) => {
  const s = typeof v === "string" ? cleanDedicationName(v).trim() : "";
  return s.length > max ? null : s;
};

/** Registration numbers compared as SARS and the receipt identity compare them: no spaces, slashes or dashes, any case. */
export const sameRegistration = (a: string, b: string) => a.replace(/[\s/-]/g, "").toUpperCase() === b.replace(/[\s/-]/g, "").toUpperCase();

/**
 * The completion form, checked like checkout checks the same boxes: a person's SA ID number (13 digits, a real
 * date, the citizenship digit and the check digit, spaces ignored exactly as at checkout), a company's CIPC number
 * or a trust's number, and the address (street, city or town, and a 4-digit postal code; unit and suburb optional).
 * Only what is `missing` is asked for; an ID or registration number typed although one is on file is still checked
 * and returned, so the caller can compare it (it is never written over the one on file).
 */
export function checkS18aCompletion(
  raw: Record<string, unknown>,
  donorType: string,
  today: Date = new Date(),
  missing: MissingDetail[] = [donorType === "individual" ? "id_number" : "registration_number", "address"],
): { ok: true; value: S18aCompletion } | { ok: false; fieldErrors: Record<string, string> } {
  const e: Record<string, string> = {};
  const value: S18aCompletion = {};
  if (donorType === "individual") {
    const typed = typeof raw.id_number === "string" ? raw.id_number.replace(/\s/g, "") : "";
    if (missing.includes("id_number") || typed) {
      const id = cleanSaIdNumber(raw.id_number);
      if (!id.ok) e.id_number = id.message;
      else value.idNumber = id.id;
    }
  } else {
    const reg = text(raw.registration_number, 40);
    if (missing.includes("registration_number") || reg) {
      if (reg === null) e.registration_number = "Please keep the registration number to 40 characters or fewer";
      else if (!reg) e.registration_number = "Needed for an s18A receipt";
      else if (donorType === "company" && !isValidCompanyRegistration(reg, today)) e.registration_number = "Use the company's CIPC number, for example 2015/123456/07";
      else value.registrationNumber = reg;
    }
  }
  if (missing.includes("address")) {
    const street = text(raw.address_line1, 200);
    const line2 = text(raw.address_line2, 200);
    const suburb = text(raw.suburb, 80);
    const city = text(raw.city, 80);
    const postal = typeof raw.postal_code === "string" ? raw.postal_code.trim() : "";
    if (street === null) e.address_line1 = "Please keep the street address to 200 characters or fewer";
    else if (!street) e.address_line1 = "Enter your street address. SARS needs it on the receipt";
    if (line2 === null) e.address_line2 = "Please keep this line to 200 characters or fewer";
    if (suburb === null) e.suburb = "Please keep the suburb to 80 characters or fewer";
    if (city === null) e.city = "Please keep the city or town to 80 characters or fewer";
    else if (!city) e.city = "Enter your city or town";
    if (!postal) e.postal_code = "Enter your postal code";
    else if (!/^\d{4}$/.test(postal)) e.postal_code = "Postal codes are 4 digits";
    if (!Object.keys(e).length) value.address = { address_line1: street!, address_line2: line2 || null, suburb: suburb || null, city: city!, postal_code: postal };
  }
  if (Object.keys(e).length) return { ok: false, fieldErrors: e };
  return { ok: true, value };
}
