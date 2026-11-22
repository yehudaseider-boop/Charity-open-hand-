import { useEffect, useState } from "react";
import { CHARITY_REQUEST_MESSAGES } from "@shared/charity-requests";
import { fetchPost, fetchWithTimeout } from "./pay-api";
import { SITE_URL } from "./website";

/**
 * "Request a charity" in the app (15/11/2026). The app asks our server whether requests are open (they stay off
 * until the database change is approved), and sends them there. Without a site address (preview and design review)
 * it is shown as open and nothing is sent.
 */

export type RequestReply =
  | { ok: true; message: string; existing: { name: string; slug: string } | null; preview?: boolean }
  | { ok: false; message: string; fieldErrors: Record<string, string> | null };

const endpoint = (site: string) => `${site.replace(/\/+$/, "")}/api/app/charity-request`;
const live = () => Boolean(SITE_URL && SITE_URL.startsWith("https://"));

let known: boolean | null = null;

/** Whether to show "Ask us to add it". Asked once per app open; hidden while unknown or if the server can't say. */
export function useRequestsOpen(): boolean {
  const [open, setOpen] = useState<boolean>(live() ? (known ?? false) : true);
  useEffect(() => {
    if (!live() || known !== null) return;
    let gone = false;
    fetchWithTimeout(endpoint(SITE_URL!), { method: "GET" }, 10_000)
      .then(({ json }) => {
        known = Boolean(json && typeof json === "object" && (json as { open?: unknown }).open === true);
        if (!gone) setOpen(known);
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, []);
  return open;
}

export type RequestBody = { name: string; town: string; link: string; note: string; emailMe: boolean; email: string };

export async function sendCharityRequest(body: RequestBody, token: string | null): Promise<RequestReply> {
  if (!live()) {
    await new Promise((r) => setTimeout(r, 600));
    return { ok: true, preview: true, existing: null, message: `Preview only: nothing was sent. In the app, we'd ask ${body.name.trim() || "them"} to join.` };
  }
  try {
    const { json } = await fetchPost(endpoint(SITE_URL!), body, token);
    if (json && typeof json === "object" && typeof (json as { ok?: unknown }).ok === "boolean") {
      const j = json as { ok: boolean; message?: string; existing?: { name: string; slug: string } | null; fieldErrors?: Record<string, string> | null };
      return j.ok
        ? { ok: true, message: j.message ?? "Thank you. We'll ask them to join Givezy.", existing: j.existing ?? null }
        : { ok: false, message: j.message ?? CHARITY_REQUEST_MESSAGES.failed, fieldErrors: j.fieldErrors ?? null };
    }
  } catch {
    // fall through
  }
  return { ok: false, message: CHARITY_REQUEST_MESSAGES.unreachable, fieldErrors: null };
}

/**
 * The shared check is worded for the website's tick box ("untick the box"); in the app the same choice is a switch,
 * so the words say "switch off" (22/11/2026). Only that phrase changes; every other message is the shared one.
 */
export function forTheSwitch(text: string): string {
  return text.replace(/untick the box/g, 'switch off "Email me when it joins"');
}

/** The same, for each field's message. */
export function fieldErrorsForTheSwitch(errors: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, forTheSwitch(v)]));
}
