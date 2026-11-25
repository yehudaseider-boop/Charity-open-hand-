import { confirmationOk, outcomeFor, refusalIsDeadEnd, type DeleteCode, type DeleteOutcome } from "@shared/delete-account";
import { fetchWithTimeout, noReplyMessage } from "./pay-api";

/**
 * Delete my account, inside the app (25/11/2026; Apple 5.1.1(v)). The screen is apps/mobile/src/app/delete-account.tsx;
 * the rules and the (DRAFT) words are shared with the server in src/lib/delete-account.ts. Calls our own server only,
 * with the donor's token; the server does the deleting (service role), never the phone.
 */

type Send = (method: "GET" | "POST", url: string, token: string, body?: unknown) => Promise<{ status: number; json: unknown }>;

const fetchSend: Send = (method, url, token, body) =>
  fetchWithTimeout(url, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const endpoint = (site: string) => `${site.replace(/\/+$/, "")}/api/app/delete-account`;

/** What the check before the screen's confirm step found. */
export type DeleteCheck =
  | { kind: "ok"; signInAgain: boolean }
  | { kind: "refused"; code: DeleteCode; message: string }
  /** The check got no usable answer: nothing was deleted, and the person can try again. */
  | { kind: "no_answer"; message: string };

/** Can this account be deleted here, and must the person sign in again first? Changes nothing. */
export async function checkDeletion(site: string, token: string, send: Send = fetchSend): Promise<DeleteCheck> {
  let status: number | null = null;
  let json: unknown = null;
  try {
    ({ status, json } = await send("GET", endpoint(site), token));
  } catch {
    // no answer: handled below
  }
  const body = (json && typeof json === "object" ? json : null) as { ok?: unknown; signInAgain?: unknown } | null;
  if (status === 200 && body?.ok === true) return { kind: "ok", signInAgain: body.signInAgain === true };
  const o = outcomeFor(status, json, false);
  if (o.kind === "refused") return { kind: "refused", code: o.code, message: o.message };
  // An expired sign-in is not a reason to refuse: the person signs in again and then deletes.
  if (o.kind === "sign_in_again") return { kind: "ok", signInAgain: true };
  // Nothing can have been deleted by a check: say only that we couldn't look (the phone's connection, or our side).
  return { kind: "no_answer", message: `${noReplyMessage(status)} Nothing was deleted.` };
}

/** Delete the account now. `confirm` is exactly what was typed. `attemptedBefore`: an earlier try got no answer. */
export async function requestDeletion(site: string, token: string, confirm: string, attemptedBefore = false, send: Send = fetchSend): Promise<DeleteOutcome> {
  try {
    const { status, json } = await send("POST", endpoint(site), token, { confirm });
    return outcomeFor(status, json, attemptedBefore);
  } catch {
    return outcomeFor(null, null, attemptedBefore);
  }
}

/** The delete button is ready only when the right words are typed and nothing is already running. */
export function deleteReady(typed: string, email: string | null, busy: boolean): boolean {
  return !busy && confirmationOk(typed, email ?? "");
}

/**
 * Keys this phone kept for one person, forgotten once their account is deleted (their goals, income log, saved
 * charities, pending gifts and the like are under their own user id). The copy for "whoever uses this phone" is left:
 * it was never theirs alone. Pure; the screen removes them.
 */
export function phoneKeysFor(userId: string): string[] {
  // Stored names are unchanged on purpose (renaming them would lose people's saved data), also the older giving-target one.
  const bases = [
    "nediv-lev.giving-goals",
    "nediv-lev.income-log",
    "nediv-lev.pending-gifts",
    "nediv-lev.s18a-details-later",
    "nediv-lev.donor-details",
    "nediv-lev.maaser-target",
    "nediv-lev.maaser-target.set-aside",
  ];
  return bases.map((b) => `${b}.u.${userId}`);
}

/**
 * Where the screen goes after the server refuses a delete press. Only refusals that retrying cannot fix get the dead-end
 * card ("intro" with the refusal); every temporary one (unfinished, busy, a charge on its way, cancel failed, no check
 * possible, wrong confirmation) returns to the confirm step with the problem shown and what was typed kept.
 */
export function stageAfterRefusal(code: DeleteCode): "dead_end" | "confirm" {
  return refusalIsDeadEnd(code) ? "dead_end" : "confirm";
}
