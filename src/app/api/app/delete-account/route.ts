import { NextResponse, type NextRequest } from "next/server";
import { appAccount } from "@/lib/app-auth";
import { clientIp } from "@/lib/client-ip";
import { DELETE_MESSAGES, confirmationOk } from "@/lib/delete-account";
import { deleteOwnAccount, deletePreflight } from "@/lib/privacy/self-delete";
import { hitRateLimit, ipKeys } from "@/lib/rate-limit";

/**
 * Delete my account, from inside the phone app (25/11/2026; Apple 5.1.1(v)). See src/lib/privacy/self-delete.ts for the
 * order of the work and src/lib/delete-account.ts for the (DRAFT) wording.
 *
 *   GET   can this account be deleted here, and must the person sign in again first? Changes nothing.
 *   POST  { confirm: "DELETE" | their email }. Deletes at once.
 *
 * Only for the signed-in donor (their token, a code sign-in, still live), and rate limited per person and per
 * internet address. If the limits cannot be checked, nothing is deleted.
 */
export const dynamic = "force-dynamic";
/** Erasing is many small database steps: the longest this may run. */
export const maxDuration = 60;

const NO_STORE = { "cache-control": "no-store" };
const answer = (status: number, body: unknown) => NextResponse.json(body, { status, headers: NO_STORE });
const plain = (status: number, code: keyof typeof DELETE_MESSAGES) => answer(status, { ok: false, code, message: DELETE_MESSAGES[code] });

/**
 * Per internet address: generous, since many phones share one address on a mobile network. Per person: a few tries an
 * hour, counted only for calls that carry the typed confirmation (25/11/2026), so typos, refused retries and the
 * "try again" of a half-finished deletion never lock someone out. All calls still count toward the looser address limit.
 */
const PER_ADDRESS = { limit: 60, minutes: 10 };
const PER_PERSON = { limit: 8, minutes: 60 };

async function limited(request: NextRequest, userId: string | null, countsAsTry: boolean): Promise<"ok" | "busy" | "unavailable"> {
  try {
    const ip = ipKeys(clientIp(request.headers));
    if (ip.length && (await hitRateLimit("app-delete-account-ip", ip, PER_ADDRESS.limit, PER_ADDRESS.minutes))) return "busy";
    // Only a call that really tries to delete counts against the person, so opening the screen or a typo never uses up their tries.
    if (countsAsTry && userId && (await hitRateLimit("app-delete-account", [`user:${userId}`], PER_PERSON.limit, PER_PERSON.minutes))) return "busy";
    return "ok";
  } catch (e) {
    console.error("[delete-account] limit check failed", e instanceof Error ? e.message : e);
    return "unavailable";
  }
}

export async function GET(request: NextRequest) {
  const gate = await limited(request, null, false);
  if (gate !== "ok") return plain(gate === "busy" ? 429 : 503, gate);
  const account = await appAccount(request, { forMoney: true, withSignInTime: true });
  if (!account) return answer(401, { ok: false, message: "Please sign in again." });
  const reply = await deletePreflight(account);
  return answer(reply.status, reply.body);
}

export async function POST(request: NextRequest) {
  const account = await appAccount(request, { forMoney: true, withSignInTime: true });
  if (!account) return answer(401, { ok: false, message: "Please sign in again." });
  const body = (await request.json().catch(() => null)) as { confirm?: unknown } | null;
  // Per person and per address, before any check or work. Over a limit, or limits that can't be checked: nothing is deleted.
  // The person's hourly tries are used only by a call with the right confirmation typed.
  const gate = await limited(request, account.userId, confirmationOk(body?.confirm, account.email));
  if (gate !== "ok") return plain(gate === "busy" ? 429 : 503, gate);
  const reply = await deleteOwnAccount(account, body?.confirm);
  return answer(reply.status, reply.body);
}
