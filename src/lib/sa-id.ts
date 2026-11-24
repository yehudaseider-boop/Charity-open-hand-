/**
 * South African ID number check: 13 digits, a real date of birth in the
 * first six, a citizenship digit of 0 or 1, and a valid Luhn check digit. It
 * catches typing mistakes; it does not prove the number belongs to the person.
 * Spaces and dashes are allowed ("850101 5009 08 7", "850101-5009-087"): keep saIdDigits(raw).
 */
export function isValidSaIdNumber(raw: string): boolean {
  const id = saIdDigits(raw);
  if (!/^\d{13}$/.test(id)) return false;

  const yy = Number(id.slice(0, 2));
  const mm = Number(id.slice(2, 4));
  const dd = Number(id.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
  // Either century is possible; the date must exist in at least one.
  const exists = [1900, 2000].some((c) => {
    const d = new Date(Date.UTC(c + yy, mm - 1, dd));
    return d.getUTCMonth() === mm - 1 && d.getUTCDate() === dd;
  });
  if (!exists) return false;
  // Digit 11: 0 for a citizen, 1 for a permanent resident. Nothing else is issued.
  if (id[10] !== "0" && id[10] !== "1") return false;

  let sum = 0;
  for (let i = 0; i < 13; i++) {
    let digit = Number(id[12 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/**
 * The ID number as kept: spaces and dashes taken out. Use it wherever an ID number checked above is stored.
 * Also the invisible marks a number copied from a message or a notes app can carry, and full-width digits from some
 * phone keyboards (24/11/2026: "8501015009087" pasted with a hidden mark was refused as "digits only", with nothing
 * to see on screen).
 */
export function saIdDigits(raw: string): string {
  return raw.normalize("NFKC").replace(/[\s\-‐-―−]|\p{Cf}/gu, "");
}

/** What to say when no SA ID number was typed (the website and the app say the same, 23/11/2026). */
export const SA_ID_EMPTY = "Enter your SA ID number. SARS needs it for an s18A receipt";

/**
 * What is wrong with a typed SA ID number, in plain words, or null when it passes isValidSaIdNumber (23/11/2026: a
 * tester typing one wrong digit was only told it "doesn't look valid"). Checked in the order a person would look:
 * the characters, the length, the date of birth, the citizenship digit, then the check digit. The website and the
 * app show the same words. An empty box is SA_ID_EMPTY.
 */
export function saIdProblem(raw: string): string | null {
  const id = saIdDigits(raw);
  if (!id) return SA_ID_EMPTY;
  if (!/^\d+$/.test(id)) return "An SA ID number has digits only. Check for a letter or another character";
  if (id.length !== 13) return `An SA ID number has 13 digits. This one has ${id.length}`;
  const yy = Number(id.slice(0, 2));
  const mm = Number(id.slice(2, 4));
  const dd = Number(id.slice(4, 6));
  const realDate =
    mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 &&
    [1900, 2000].some((c) => {
      const d = new Date(Date.UTC(c + yy, mm - 1, dd));
      return d.getUTCMonth() === mm - 1 && d.getUTCDate() === dd;
    });
  if (!realDate) return "The first 6 digits are your date of birth (yymmdd), and these aren't a real date. Check them";
  if (id[10] !== "0" && id[10] !== "1") return "The 11th digit is 0 or 1 on every SA ID number. Check for a typo";
  if (!isValidSaIdNumber(id)) return "The last digit doesn't match: check for a typo";
  return null;
}
