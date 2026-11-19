/**
 * WhatsApp links (19/11/2026). Pure and dependency-free.
 * - whatsAppChat: opens a chat with a South African number ("078 616 0489" becomes wa.me/27786160489).
 * - whatsAppShare: opens WhatsApp with a message ready to send to anyone the person picks.
 */

/** A South African number in any common spelling, as WhatsApp wants it (country code, digits only), or null. */
export function waNumber(sa: string | null | undefined): string | null {
  let digits = (sa ?? "").replace(/\D/g, "");
  // "0027 78 ..." (dialled from abroad) and "+27 (0)78 ..." (the 0 kept in brackets) are the same number.
  if (/^0027\d{9,10}$/.test(digits)) digits = digits.slice(2);
  if (/^270\d{9}$/.test(digits)) digits = `27${digits.slice(3)}`;
  if (/^0\d{9}$/.test(digits)) return `27${digits.slice(1)}`;
  if (/^27\d{9}$/.test(digits)) return digits;
  return null;
}

export function whatsAppChat(sa: string | null | undefined, text?: string): string | null {
  const n = waNumber(sa);
  if (!n) return null;
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function whatsAppShare(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
