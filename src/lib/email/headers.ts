/**
 * One-click stop (RFC 8058), which Gmail and Yahoo ask of bulk mail: the mail app shows its own
 * "Unsubscribe" and POSTs to this address, with no page and no second step. Only on charities' emails
 * to donors (news and appeals, thank-yous), never on sign-in codes or receipts. The address carries
 * the same token as the stop link in the email; see /api/stop/news and /api/stop/thanks.
 */

/** The address a mail app POSTs to, for the stop link's token. */
export function oneClickStopUrl(site: string, kind: "news" | "thanks", token: string): string {
  return `${site.replace(/\/+$/, "")}/api/stop/${kind}?t=${encodeURIComponent(token)}`;
}

/** The two headers, for a one-click address (one line, no angle brackets of its own). */
export function oneClickStopHeaders(url: string): Record<string, string> {
  const clean = url.replace(/[\r\n<>\s]+/g, "");
  return { "List-Unsubscribe": `<${clean}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}
