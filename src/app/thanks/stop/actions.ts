"use server";

import { redirect } from "next/navigation";
import { stopThankYous } from "@/lib/charity/thank-you-send";

export async function confirmStop(formData: FormData) {
  const token = String(formData.get("t") ?? "");
  const ok = await stopThankYous(token).catch((e) => {
    console.error(e);
    return false;
  });
  // "Done" keeps the link's token, and the page checks it really is stopped before saying so (22/11/2026).
  redirect(ok ? `/thanks/stop?t=${encodeURIComponent(token)}&done=1` : `/thanks/stop?t=${encodeURIComponent(token)}&error=1`);
}
