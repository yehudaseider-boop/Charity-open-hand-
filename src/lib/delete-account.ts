/**
 * Deleting your own account inside the phone app (25/11/2026; Apple guideline 5.1.1(v), Google Play's account deletion
 * rules). Pure and dependency-free: the server (src/lib/privacy/self-delete.ts, /api/app/delete-account), the phone app
 * and the tests share these rules and words.
 *
 * ALL WORDING HERE IS DRAFT until Yosef (the lawyer) approves it: what we say we delete, what we say we keep and why,
 * and how long it takes. It describes what src/lib/privacy/erase.ts does. Change both together.
 */

/** A sign-in newer than this counts as "recent" (decided 25/11/2026: ten minutes; the person gets a fresh emailed code otherwise). */
export const RECENT_SIGN_IN_MS = 10 * 60_000;

/** A monthly donation's charge that started in the last half hour may still be on its way: wait for it, so nobody is charged after deleting. */
export const CHARGE_IN_FLIGHT_MS = 30 * 60_000;

/** The word the person types to confirm (their email address works too). */
export const CONFIRM_WORD = "DELETE";

/** Why a deletion is refused or stopped, as the server says it (`code`) and the app reads it. */
export type DeleteCode =
  | "manager"
  | "platform_admin"
  | "request_open"
  | "reviewer"
  | "payment_in_progress"
  | "sign_in_again"
  | "confirm"
  | "busy"
  | "unavailable"
  | "cancel_failed"
  | "incomplete"
  | "not_available";

/** Plain words for each, always saying what was and was not deleted. The app adds how to reach a person. DRAFT for Yosef. */
export const DELETE_MESSAGES: Record<DeleteCode, string> = {
  manager: "You manage a charity on Givezy, so we can't delete your account yet. A charity needs an owner: hand it over to someone else first. Nothing was deleted.",
  platform_admin: "This account runs Givezy itself, so it can't be deleted here. Nothing was deleted.",
  request_open: "You already asked us to delete your information and we're working on it. We'll email you when it's done, so there is nothing more to do. Nothing was deleted yet.",
  reviewer: "This is the app reviewer's sign-in. It stays so the app can be checked. Nothing was deleted.",
  payment_in_progress: "A monthly donation is being processed right now. Please try again in about 30 minutes, so you are never charged after deleting. Nothing was deleted.",
  sign_in_again: "For your safety, please sign in again with a new code first. Nothing was deleted.",
  confirm: "Type DELETE, or your email address, to confirm. Nothing was deleted.",
  busy: "You've tried this a few times. Please wait an hour and try again. Nothing was deleted.",
  unavailable: "We couldn't check your account just now. Nothing was deleted. Please try again in a minute.",
  cancel_failed: "We couldn't stop your monthly donations and saved card just now, so we deleted nothing. You are not charged any differently. Please try again in a few minutes.",
  incomplete: "Part of the deletion didn't finish. Your monthly donations and saved card are already stopped, and nothing was undone. Please try again: it carries on where it stopped.",
  not_available: "Deleting your account in the app isn't switched on yet. Nothing was deleted.",
};

/** What is deleted, as the app and the public page list it (DRAFT for Yosef). */
export const DELETED_LIST: readonly string[] = [
  "Your sign-in and email address",
  "Your name, phone number and address",
  "Your saved card, and any ID or income tax number we hold, unless one is on an s18A receipt (see below)",
  "Your monthly donations: they are cancelled and never charged again",
  "Messages and private labels you added to gifts, your saved charities and the giving you logged yourself",
  "Any copy of your details a charity imported into its own contact list on Givezy",
];

/**
 * What is kept and why, in one sentence (also the line in the confirmation email and in the staff-processed reply).
 * The one source: src/lib/privacy/erase.ts re-exports it. DRAFT for Yosef.
 */
export const ERASE_KEPT_TEXT =
  "We keep each donation's amount, date, charity and tax year, and any s18A receipt already issued. For a donation on an issued s18A receipt we also keep the name, ID or income tax number, registration number and address the charity must report to SARS, because tax law requires us to keep those records. Your email address, phone number and everything else are erased, including any copy of your details a charity imported into its own contact list on Givezy.";

/** The same, split for the screen: what stays, and the reason. DRAFT for Yosef. */
export const KEPT_LIST: readonly string[] = [
  "The amount, date, charity and tax year of each donation you made, with no name or email on it",
  "Any s18A receipt already issued to you",
  "For a donation on an issued s18A receipt: the name, ID or income tax number, registration number and address the charity must report to SARS",
];
export const KEPT_WHY = "Tax law requires us to keep these records for as long as that law says, and no longer. We use them for nothing else.";
export const TAKES_HOW_LONG = "It happens straight away. We email you a confirmation when it's done.";
export const CANT_UNDO = "This can't be undone. You can always start a new account later, but it will be empty.";

/** When did the person last sign in? Supabase lists each way a session was started with a time (seconds). Newest wins; null when none is given. */
export function lastSignInSeconds(amr: unknown): number | null {
  if (!Array.isArray(amr)) return null;
  let newest: number | null = null;
  for (const entry of amr) {
    const t = (entry as { timestamp?: unknown } | null)?.timestamp;
    if (typeof t === "number" && Number.isFinite(t) && t > 0 && (newest === null || t > newest)) newest = t;
  }
  return newest;
}

/** A sign-in within the last ten minutes. No time on record counts as not recent: the person signs in again. */
export function signInIsRecent(signedInAtSeconds: number | null, nowMs: number, windowMs = RECENT_SIGN_IN_MS): boolean {
  if (signedInAtSeconds === null) return false;
  const age = nowMs - signedInAtSeconds * 1000;
  // A time in the future (a clock out by a little) is fine; one far ahead is not believed.
  return age <= windowMs && age >= -windowMs;
}

/** Did they type DELETE (any case, spaces round it ignored) or their own email address? */
export function confirmationOk(typed: unknown, email: string): boolean {
  if (typeof typed !== "string") return false;
  const t = typed.trim().toLowerCase();
  return t === CONFIRM_WORD.toLowerCase() || (t.length > 0 && t === email.trim().toLowerCase());
}

/** The email after the deletion (DRAFT for Yosef): plain, no exclamation marks. `support` is how to reach a person. */
export function deletionEmail(support: string | null): { subject: string; text: string } {
  return {
    subject: "Your Givezy account has been deleted",
    text: [
      "Hello,",
      "As you asked in the Givezy app, we have deleted your account and the information that identifies you.",
      "What we deleted: your sign-in, your name, phone number and address, your saved card, and the messages and labels you added to gifts. Any monthly donations were cancelled, so you will not be charged again.",
      `What we kept, and why: ${ERASE_KEPT_TEXT}`,
      support ? `If this wasn't you, or you have a question, reply to this email or contact ${support}.` : "If this wasn't you, or you have a question, reply to this email and a person will help.",
      "Givezy",
    ].join("\n\n"),
  };
}

/** What the app does with the server's answer, in plain words. `attemptedBefore`: an earlier try got no answer, so it may have gone through. */
export type DeleteOutcome =
  | { kind: "done" }
  | { kind: "sign_in_again"; message: string }
  | { kind: "refused"; code: DeleteCode; message: string }
  | { kind: "no_answer"; message: string }
  /** The sign-in no longer works, and an earlier try got no answer: the account may be gone already. */
  | { kind: "maybe_done"; message: string };

const CODES = new Set<string>(Object.keys(DELETE_MESSAGES));

export function outcomeFor(status: number | null, json: unknown, attemptedBefore: boolean): DeleteOutcome {
  const body = (json && typeof json === "object" ? json : null) as { ok?: unknown; code?: unknown } | null;
  if (status !== null && body?.ok === true) return { kind: "done" };
  const code = typeof body?.code === "string" && CODES.has(body.code) ? (body.code as DeleteCode) : null;
  if (status === 401 && !code) {
    return attemptedBefore
      ? { kind: "maybe_done", message: "Your sign-in has ended. We didn't get an answer to your last try, so your account may already be deleted. If you got our confirmation email, it is. If not, sign in again and try once more." }
      : { kind: "sign_in_again", message: DELETE_MESSAGES.sign_in_again };
  }
  if (code === "sign_in_again") return { kind: "sign_in_again", message: DELETE_MESSAGES.sign_in_again };
  if (code) return { kind: "refused", code, message: DELETE_MESSAGES[code] };
  if (status !== null && (status === 429 || status >= 500)) {
    return { kind: "no_answer", message: "Givezy isn't answering properly just now. Nothing was deleted that we know of. Please try again in a few minutes." };
  }
  return { kind: "no_answer", message: "We couldn't reach Givezy. Check your connection and try again. Nothing was deleted that we know of, and what you typed is still here." };
}
