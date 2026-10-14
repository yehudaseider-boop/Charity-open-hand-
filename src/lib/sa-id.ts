/**
 * South African ID number check: 13 digits, a real date of birth in the
 * first six, and a valid Luhn check digit. It catches typing mistakes; it
 * does not prove the number belongs to the person.
 */
export function isValidSaIdNumber(raw: string): boolean {
  const id = raw.replace(/\s/g, "");
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
