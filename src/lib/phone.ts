/**
 * One way to read a South African phone number, used everywhere a phone is checked (the donate form, the app, the
 * charity's contact details, the donor import and the gift import). Dependency-free.
 *
 * People type the same number many ways: 082 123 4567, 082.123.4567, (082) 123-4567, +27 82 123 4567,
 * +27 (0)82 123 4567, and spreadsheets give 27821234567 or 0027 82 123 4567. All of them are kept in one of the two
 * forms the database accepts: 0821234567, or +27821234567 for a number written with the country code.
 */

/** The two forms we keep (the same rule as the database checks). */
export const SA_PHONE = /^(\+27|0)\d{9}$/;

/**
 * The number without spaces, brackets, dots or dashes, with the country code written as +27. Returns what it
 * could read, which may still not be a phone number: check it with SA_PHONE.
 */
export function normaliseSaPhone(raw: string): string {
  let p = raw.trim();
  // "+27 (0)82 ...": the (0) is the trunk 0, dropped after the country code.
  p = p.replace(/^(\+?(?:00)?27)[\s.-]*\(0\)/, "$1");
  p = p.replace(/[\s().-]/g, "");
  if (/^27\d{9}$/.test(p)) p = `+${p}`;
  else if (/^0027\d{9}$/.test(p)) p = `+${p.slice(2)}`;
  // "+27 082 ..." (the 0 kept after the country code): the same number.
  else if (/^\+270\d{9}$/.test(p)) p = `+27${p.slice(4)}`;
  return p;
}
