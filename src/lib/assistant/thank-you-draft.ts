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
 * Written-out numbers that would state an amount or a count (review 24/11/2026). Kept simple on purpose: the number
 * words from "two" up, the tens, and "dozen", "hundred", "thousand", "million", "billion" (so "a hundred", "fifty
 * families" and "thousands of meals" are refused). "One" is left out: "one of", "the one" and "no one" are everyday
 * words, not counts.
 */
const NUMBER_WORDS =
  /\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|dozens?|hundreds?|thousands?|millions?|billions?)\b/i;

/** Greetings at the start: each donor's email already starts with "Dear" and their first name. */
const GREETING = /^\s*(?:dear|hi|hello|hey|greetings|warm greetings|good (?:morning|afternoon|evening|day))\b/i;

/** Sign-offs on the last line: each email is already signed with the charity's name. */
const SIGN_OFF =
  /^(?:(?:(?:kind|warm|warmest|best|with (?:kind|warm|best)) )?regards\b|sincerely\b|yours\b|best(?: wishes)?,?$|cheers\b|with (?:love|gratitude|thanks|appreciation)\b|(?:many )?thanks,?$|thank you,?$|from (?:all of us|the team|us)\b)/i;

/** Small words a signature line may have that aren't capitalised ("The Meals Fund team"). */
const NAME_LINK_WORDS = new Set(["of", "the", "and", "team", "at", "for", "from", "&"]);

/** A last line that is only a name ("Sarah", "The Meals Fund team", "- Sarah"): short, no full stop, every word a name. */
function isBareName(line: string): boolean {
  if (/[.?:;]$/.test(line)) return false;
  const words = line.replace(/^[-–—~\s]+/, "").split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 5) return false;
  return words.every((w) => NAME_LINK_WORDS.has(w.toLowerCase()) || /^\p{Lu}[\p{L}'’-]*,?$/u.test(w));
}

/**
 * Checks what Givy wrote. A refusal goes back to the model as the tool's error, so it can write it again: it says
 * exactly what to change. `charityName`: the charity's own name may appear exactly as it is spelt, even with a figure
 * or "!" in it ("Kitchen 54", "Yes! Trust"): it is taken out before the checks for figures, "!", "@" and links.
 */
export function checkDraft(input: { audience?: unknown; subject?: unknown; message?: unknown }, charityName?: string | null): DraftCheck {
  if (!isGivyAudience(input.audience)) return { ok: false, error: `audience must be one of ${GIVY_AUDIENCE_KEYS.join(", ")}.` };
  const subject = clean(String(input.subject ?? "")).replace(/\s+/g, " ");
  const body = clean(String(input.message ?? ""));
  if (subject.length < 3 || subject.length > DRAFT_SUBJECT_MAX) return { ok: false, error: `subject must be 3 to ${DRAFT_SUBJECT_MAX} characters.` };
  if (body.length < 10 || body.length > DRAFT_BODY_MAX) return { ok: false, error: `message must be 10 to ${DRAFT_BODY_MAX} characters: a few short sentences.` };
  const name = (charityName ?? "").trim();
  const both = `${subject}\n${body}`;
  const scan = name.length >= 2 ? both.split(name).join(" ") : both;
  // Never a figure Givy made up: amounts, counts, dates and impact numbers are the charity's to add. Digits of any script.
  if (/\p{Nd}/u.test(scan)) return { ok: false, error: "Leave out every number (amounts, counts, dates, impact). The person adds real figures themselves if they want to." };
  if (NUMBER_WORDS.test(scan)) return { ok: false, error: "Leave out numbers written as words too (like \"fifty\", \"a hundred\" or \"thousands\"): no amounts or counts. The person adds real figures themselves if they want to." };
  if (/[!！‼]/.test(scan)) return { ok: false, error: "No exclamation marks." };
  if (/@/.test(scan)) return { ok: false, error: "Leave out email addresses and the @ sign." };
  if (/https?:|www\.|\.[a-z]{2,}\b/i.test(scan)) return { ok: false, error: "Leave out web addresses and links (anything like \"example.org\"). If a full stop runs straight into the next word, add a space after it." };
  if (/[<>]/.test(both)) return { ok: false, error: "Plain words only, no markup." };
  // The page greets each donor by name ("Dear Thandi,") and signs it with the charity's name.
  if (GREETING.test(body)) return { ok: false, error: "Don't start with a greeting (like \"Dear\", \"Hi all\" or \"Good morning\"): each donor's email already starts with \"Dear\" and their first name." };
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1] ?? "";
  if (SIGN_OFF.test(last) || (name.length >= 2 && last.replace(/[,.]$/, "") === name) || (lines.length > 1 && isBareName(last))) {
    return { ok: false, error: "Don't end with a sign-off or a name (like \"Kind regards\", \"Thanks,\" or a name on its own line): each email is already signed with the charity's name. End on a sentence." };
  }
  return { ok: true, audience: input.audience, subject, body };
}

/**
 * The marker the server adds at the end of every answer, just before [[next:...]]: a kept draft's id, only the
 * audience, or empty when nothing was prepared (review 24/11/2026: the slot is always there, and always ours).
 */
export function thanksMark(prepared: { draftId: string | null; audience: DraftAudience } | null): string {
  if (!prepared) return "\n[[thanks:]]";
  return prepared.draftId && UUID.test(prepared.draftId) ? `\n[[thanks:d=${prepared.draftId.toLowerCase()}]]` : `\n[[thanks:to=${prepared.audience}]]`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where the panel's "Check and send" button goes for a marker's value ("d=<id>" or "to=<audience>"), or null.
 * Only this dashboard's Email donors page, with a draft id, one of our fixed audiences or one donor's id (which the
 * page looks up again in this charity's own list, so it can never reach another charity's donor); never the demo.
 */
/**
 * The panel's "Check and send" button: only when the server says this person may prepare drafts (`drafts`, from
 * their role, decided on the server when the page was made) and the marker is one of ours. Otherwise no button.
 */
export function thanksButtonHref(drafts: boolean, value: string | undefined, base: string): string | null {
  return drafts && value ? thanksHref(value, base) : null;
}

export function thanksHref(value: string, base: string): string | null {
  if (!/^\/charity-admin\/[0-9a-f-]{36}$/i.test(base)) return null;
  if (value.startsWith("d=") && UUID.test(value.slice(2))) return `${base}/email-donors?draft=${value.slice(2).toLowerCase()}`;
  if (value.startsWith("to=") && isDraftAudience(value.slice(3))) return `${base}/email-donors?to=${encodeURIComponent(value.slice(3))}`;
  return null;
}
