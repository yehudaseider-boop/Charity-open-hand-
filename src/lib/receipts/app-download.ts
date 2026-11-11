/**
 * The phone app's s18A receipt download (11/11/2026). The app used to open the website's receipt link in the
 * browser, which isn't signed in, so donors were asked to sign in again. Now the app asks our server with its own
 * sign-in token; the server checks the receipt is this donor's own, issued and has a PDF, and hands back a
 * 60-second download link for that one file (from storage, the same kind of link the website uses).
 * Only the donor's own receipts: the app is for donors, so charity and Givezy admins use the website.
 * The rules are pure (the loader is passed in), so they are tested without a database.
 */

export type ReceiptForDownload = { id: string; status: string; pdfPath: string | null; charityId: string; donorUserId: string | null };

export type DownloadDecision = { ok: true; pdfPath: string; charityId: string } | { ok: false; reason: "bad-id" | "not-found" | "not-yours" | "unavailable" };

export const RECEIPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function decideReceiptDownload(id: unknown, userId: string, load: (id: string) => Promise<ReceiptForDownload | null>): Promise<DownloadDecision> {
  if (typeof id !== "string" || !RECEIPT_ID.test(id)) return { ok: false, reason: "bad-id" };
  const r = await load(id);
  if (!r) return { ok: false, reason: "not-found" };
  // Someone else's receipt reads the same as one that isn't there, to the app.
  if (!r.donorUserId || r.donorUserId !== userId) return { ok: false, reason: "not-yours" };
  // Withdrawn (void) receipts, and ones still being made, are not handed out (the same as the website).
  if (r.status !== "issued" || !r.pdfPath) return { ok: false, reason: "unavailable" };
  return { ok: true, pdfPath: r.pdfPath, charityId: r.charityId };
}

/** What the app is told when there is no link: never which of the reasons it was. */
export const RECEIPT_UNAVAILABLE = "That s18A receipt isn't available. It may have been withdrawn or not be ready yet.";
