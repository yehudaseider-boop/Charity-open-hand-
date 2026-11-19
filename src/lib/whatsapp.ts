/**
 * WhatsApp links (19/11/2026). Pure and dependency-free.
 * - whatsAppChat: opens a chat with a South African number ("078 616 0489" becomes wa.me/27786160489).
 * - whatsAppShare: opens WhatsApp with a message ready to send to anyone the person picks.
 */

/** A South African number in any common spelling, as WhatsApp wants it (country code, digits only), or null. */
export function waNumber(sa: string | null | undefined): string | null {
  const digits = (sa ?? "").replace(/\D/g, "");
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
