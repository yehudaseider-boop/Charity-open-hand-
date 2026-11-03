/**
 * SARS's own checks on the numbers in an IT3(d) file, copied from the BRS "IT3 Data Submission" v4.0.0D-10
 * (docs/sars/it3d-spec.md, section 4). Dependency-free and pure: the donate form, the phone app's shared rules
 * and the IT3(d) builder all use these, so a number accepted at checkout is one SARS's check accepts too.
 *
 * - Appendix I (p.264): Modulus 10 for income tax reference numbers (fields 216, 312, 414).
 * - Appendix J (p.266): the SA ID number check digit (fields 212, 412 when the ID type is 001).
 * - Appendix K (p.267): the company registration number format (fields 212, 412 when the ID type is 004).
 */

/**
 * Appendix I, Modulus 10 (p.264): digits 1, 3, 5, 7 and 9 are doubled (a result above 9 has its digits added),
 * digits 2, 4, 6 and 8 are added as they are. The 10th digit must be 10 minus (total mod 10), or 0 when the
 * total ends in 0. Example from SARS: 0001339050 is valid.
 */
export function passesModulus10(raw: string): boolean {
  const n = raw.trim();
  if (!/^\d{10}$/.test(n)) return false;
  let total = 0;
  for (let i = 0; i < 9; i++) {
    const d = Number(n[i]);
    if (i % 2 === 0) {
      const doubled = d * 2;
      total += doubled > 9 ? Math.floor(doubled / 10) + (doubled % 10) : doubled;
    } else {
      total += d;
    }
  }
  const check = total % 10 === 0 ? 0 : 10 - (total % 10);
  return Number(n[9]) === check;
}

/**
 * The first digit SARS allows for each tax reference field: a submitting or reporting entity's number "can only
 * start with 0, 1, 2, 3, 7 or 9" (fields 216 and 312, p.212 and p.218); a donor's "The first character can only
 * be 0, 1, 2, 3, or 9" (field 414, p.226).
 */
export const ENTITY_TAX_REFERENCE_FIRST_DIGITS = ["0", "1", "2", "3", "7", "9"] as const;
export const DONOR_TAX_REFERENCE_FIRST_DIGITS = ["0", "1", "2", "3", "9"] as const;

/** A 10-digit tax reference that passes Modulus 10 and starts with an allowed digit. */
export function isValidTaxReference(raw: string, firstDigits: readonly string[]): boolean {
  const n = raw.trim();
  return passesModulus10(n) && firstDigits.includes(n[0]);
}

/**
 * Appendix J (p.266), the SA ID number control digit, step by step as SARS writes it: add the digits in the odd
 * positions (excluding the last); put the digits in the even positions together as one number and double it; add
 * the digits of that result; add the two answers; 10 minus the last digit of the sum (its last digit when the
 * answer has two digits) must equal the 13th digit. Example from SARS: 800101 5009 087.
 *
 * This is only SARS's check. `isValidSaIdNumber` in sa-id.ts, used where people type the number, also checks the
 * date of birth exists and the citizenship digit is 0 or 1; every number it accepts passes this check too.
 */
export function passesSaIdCheck(raw: string): boolean {
  const id = raw.replace(/\s/g, "");
  if (!/^\d{13}$/.test(id)) return false;
  let odd = 0;
  let even = "";
  for (let pos = 1; pos <= 12; pos++) {
    if (pos % 2 === 1) odd += Number(id[pos - 1]);
    else even += id[pos - 1];
  }
  const doubled = (BigInt(even) * 2n).toString();
  const evenSum = [...doubled].reduce((s, c) => s + Number(c), 0);
  const sum = odd + evenSum;
  const check = (10 - (sum % 10)) % 10;
  return Number(id[12]) === check;
}

/**
 * The date of birth in an SA ID number (YYMMDD, Appendix J), as CCYY-MM-DD for field 415. The century: the 1900s
 * when YY is greater than this year's two digits, else the 2000s (our choice, docs/sars/it3d-decisions.md: the
 * BRS gives no rule). Null when the six digits are not a real date. This file stays dependency-free, so the caller
 * passes the current year in Johannesburg (`zonedParts(now).year` from dates.ts); without it the UTC year is used.
 */
export function dateOfBirthFromSaId(raw: string, today: Date, currentYear: number = today.getUTCFullYear()): string | null {
  const id = raw.replace(/\s/g, "");
  if (!/^\d{13}$/.test(id)) return null;
  const yy = Number(id.slice(0, 2)), mm = Number(id.slice(2, 4)), dd = Number(id.slice(4, 6));
  const nowYy = currentYear % 100;
  const year = (yy > nowYy ? 1900 : 2000) + yy;
  const d = new Date(Date.UTC(year, mm - 1, dd));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return null;
  return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/** Appendix K (p.267): "The last two digits of this number must be validated to be either of the following". */
export const COMPANY_REGISTRATION_SUFFIXES = ["06", "07", "08", "09", "10", "11", "20", "21", "22", "23", "24", "25", "26", "30", "31"] as const;

/**
 * A company registration number written the way Appendix K asks, CCYY/NNNNNN/NN. People type it with spaces,
 * dashes or no separators at all ("2015 123456 07", "201512345607"); those become "2015/123456/07". Anything
 * else is returned trimmed, unchanged, for the check below to refuse.
 */
export function normaliseCompanyRegistration(raw: string): string {
  const s = raw.trim();
  const m = /^(\d{4})[\s/\\-]*(\d{6})[\s/\\-]*(\d{2})$/.exec(s);
  return m ? `${m[1]}/${m[2]}/${m[3]}` : s;
}

/**
 * Appendix K (p.267): "CCYY/NNNNNN/NN, where the CCYY must be validated to be from 1800 and up and including the
 * current calendar year", and the last two digits one of the listed suffixes. Checked after normalising. The
 * current year is the Johannesburg one when the caller passes it (see dateOfBirthFromSaId), else the UTC year.
 */
export function isValidCompanyRegistration(raw: string, today: Date, currentYear: number = today.getUTCFullYear()): boolean {
  const m = /^(\d{4})\/(\d{6})\/(\d{2})$/.exec(normaliseCompanyRegistration(raw));
  if (!m) return false;
  const year = Number(m[1]);
  if (year < 1800 || year > currentYear) return false;
  return (COMPANY_REGISTRATION_SUFFIXES as readonly string[]).includes(m[3]);
}
