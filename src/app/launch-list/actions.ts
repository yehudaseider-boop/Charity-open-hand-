"use server";

import { headers } from "next/headers";
import { appLinks } from "@/config/app-links";
import { clientIp } from "@/lib/client-ip";
import type { FormState } from "@/lib/form";
import { LAUNCH_LIST_CONSENT, LAUNCH_LIST_LIMIT, LAUNCH_LIST_MESSAGES, checkLaunchListEmail, isBot, isStopToken } from "@/lib/launch-list";
import { hitRateLimit, ipKeys } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/** The table isn't on this database yet (the migration waits for Yehuda's yes). */
const notSetUp = (code: string | undefined) => code === "PGRST205" || code === "42P01";

/**
 * "Notify me at launch" (landing page, 10/11/2026). Off until appLinks.launchListOpen is switched on. A bot that
 * fills the hidden field is told "done" and nothing is saved. An email already on the list is told "done" too, so
 * the form never reveals who signed up. Nothing is emailed now.
 */
export async function joinLaunchList(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!appLinks.launchListOpen) return { ok: false, message: LAUNCH_LIST_MESSAGES.closed };
  const typed = formData.get("email");
  if (isBot(formData.get("website"))) return { ok: true, message: LAUNCH_LIST_MESSAGES.done };
  const checked = checkLaunchListEmail(typed);
  if (!checked.ok) return { ok: false, message: checked.message, fieldErrors: { email: checked.message } };
  try {
    if (await hitRateLimit("launch-list", ipKeys(clientIp(await headers())), LAUNCH_LIST_LIMIT.tries, LAUNCH_LIST_LIMIT.minutes)) {
      return { ok: false, message: LAUNCH_LIST_MESSAGES.tooMany };
    }
    const { error } = await createAdminClient()
      .from("launch_list")
      .upsert({ email: checked.email, consent_version: LAUNCH_LIST_CONSENT.version, source: "landing" }, { onConflict: "email", ignoreDuplicates: true });
    if (error) {
      if (notSetUp(error.code)) return { ok: false, message: LAUNCH_LIST_MESSAGES.closed };
      throw error;
    }
  } catch (e) {
    console.error("[launch-list] not saved", e);
    return { ok: false, message: LAUNCH_LIST_MESSAGES.failed };
  }
  return { ok: true, message: LAUNCH_LIST_MESSAGES.done };
}

/** The one-tap unsubscribe from the launch email's link: removes the address by its token. */
export async function leaveLaunchList(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = formData.get("token");
  if (!isStopToken(token)) return { ok: false, message: "That link isn't complete. Nothing was changed." };
  const { error } = await createAdminClient().from("launch_list").delete().eq("stop_token", token);
  if (error && !notSetUp(error.code)) {
    console.error("[launch-list] not removed", error);
    return { ok: false, message: "We couldn't remove you just now. Nothing was changed. Please try again." };
  }
  // Removed, or it was never there: the answer is the same, so a link can't be used to test who is on the list.
  return { ok: true, message: "You're off the list. We won't email you about the launch." };
}
