/**
 * Givy prepares a thank-you; a person sends it (24/11/2026, Yehuda). Dependency-free, shared by the server, the panel
 * and the tests.
 *
 * - Givy picks who it is for from a fixed list of audiences the Email donors page already understands
 *   (parseAudience), and writes a short subject and message. It never sees or needs donors' names for this: the
 *   audience is worked out on the server when the page checks who it goes to.
 * - What Givy writes is checked here before it is kept: no figures (Givy must not invent amounts or impact), no web
 *   addresses, no exclamation marks, and the Email donors page's own length rules.
 * - The panel's button comes from our own marker at the end of the answer ([[thanks:...]]), never from what the model
 *   writes, and opens only the Email donors page of this dashboard.
 */

/** The audiences Givy may choose, with what each means (for the tool's description). */
export const GIVY_AUDIENCES = {
  "gave:this_month": "donors who gave this month",
  "gave:this_tax_year": "donors who gave this tax year (from 1 March)",
  monthly: "donors with a monthly donation running",
  "s18a:asked": "donors who asked for an s18A receipt",
  "group:new": "new donors (first gift recently)",
  "group:repeat": "donors who keep coming back",
  "group:once": "donors who gave once",
  "group:lapsed": "lapsed donors (nothing for a while)",
  "keeping:lybunt": "donors who gave last tax year but not since",
  "keeping:sybunt": "donors who gave in an earlier year but not since",
  all: "all the charity's donors",
} as const;

export type GivyAudience = keyof typeof GIVY_AUDIENCES;
export const GIVY_AUDIENCE_KEYS = Object.keys(GIVY_AUDIENCES) as GivyAudience[];

export function isGivyAudience(v: unknown): v is GivyAudience {
  return typeof v === "string" && Object.hasOwn(GIVY_AUDIENCES, v);
}

/**
 * Who a kept draft is for: one of the groups above, or one donor (24/11/2026, only with donors' names switched on).
 * A one-donor draft carries the donor's id, which the server found by name in this charity's own list; the model
 * never sees or writes it, and the Email donors page resolves it again against the charity's own list.
 */
export type DraftAudience = GivyAudience | `donor:${string}`;

export const isOneDonor = (v: unknown): v is `donor:${string}` => typeof v === "string" && /^donor:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);

export function isDraftAudience(v: unknown): v is DraftAudience {
  return isGivyAudience(v) || isOneDonor(v);
}

/** The Email donors page's limits (appeals-rules.ts), and shorter ones for what Givy writes. */
export const DRAFT_SUBJECT_MAX = 120;
export const DRAFT_BODY_MAX = 1500;

const clean = (s: string) =>
  s
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export type DraftCheck = { ok: true; audience: GivyAudience; subject: string; body: string } | { ok: false; error: string };

/**
 * Checks what Givy wrote. A refusal goes back to the model as the tool's error, so it can write it again: it says
 * exactly what to change.
 */
export function checkDraft(input: { audience?: unknown; subject?: unknown; message?: unknown }): DraftCheck {
  if (!isGivyAudience(input.audience)) return { ok: false, error: `audience must be one of ${GIVY_AUDIENCE_KEYS.join(", ")}.` };
  const subject = clean(String(input.subject ?? "")).replace(/\s+/g, " ");
  const body = clean(String(input.message ?? ""));
  if (subject.length < 3 || subject.length > DRAFT_SUBJECT_MAX) return { ok: false, error: `subject must be 3 to ${DRAFT_SUBJECT_MAX} characters.` };
  if (body.length < 10 || body.length > DRAFT_BODY_MAX) return { ok: false, error: `message must be 10 to ${DRAFT_BODY_MAX} characters: a few short sentences.` };
  const both = `${subject}\n${body}`;
  // Never a figure Givy made up: amounts, counts, dates and impact numbers are the charity's to add.
  if (/\d/.test(both)) return { ok: false, error: "Leave out every number (amounts, counts, dates, impact). The person adds real figures themselves if they want to." };
  if (/!/.test(both)) return { ok: false, error: "No exclamation marks." };
  if (/https?:|www\.|\.co\.za|\.com\b|\.org\b/i.test(both)) return { ok: false, error: "Leave out web addresses and links." };
  if (/[<>]/.test(both)) return { ok: false, error: "Plain words only, no markup." };
  // The page greets each donor by name ("Dear Thandi,") and signs it with the charity's name.
  if (/^\s*(dear|hi|hello)\b/i.test(body)) return { ok: false, error: "Don't start with a greeting: each donor's email already starts with \"Dear\" and their first name." };
  return { ok: true, audience: input.audience, subject, body };
}

/** The marker the server adds after an answer that prepared a thank-you: a kept draft's id, or only the audience. */
export function thanksMark(prepared: { draftId: string | null; audience: DraftAudience }): string {
  return prepared.draftId && UUID.test(prepared.draftId) ? `\n[[thanks:d=${prepared.draftId.toLowerCase()}]]` : `\n[[thanks:to=${prepared.audience}]]`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where the panel's "Check and send" button goes for a marker's value ("d=<id>" or "to=<audience>"), or null.
 * Only this dashboard's Email donors page, with a draft id, one of our fixed audiences or one donor's id (which the
 * page looks up again in this charity's own list, so it can never reach another charity's donor); never the demo.
 */
export function thanksHref(value: string, base: string): string | null {
  if (!/^\/charity-admin\/[0-9a-f-]{36}$/i.test(base)) return null;
  if (value.startsWith("d=") && UUID.test(value.slice(2))) return `${base}/email-donors?draft=${value.slice(2).toLowerCase()}`;
  if (value.startsWith("to=") && isDraftAudience(value.slice(3))) return `${base}/email-donors?to=${encodeURIComponent(value.slice(3))}`;
  return null;
}
