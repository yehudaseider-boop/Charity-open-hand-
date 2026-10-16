"use server";

import { redirect } from "next/navigation";
import { stopThankYous } from "@/lib/charity/thank-you-send";

export async function confirmStop(formData: FormData) {
  const token = String(formData.get("t") ?? "");
  const ok = await stopThankYous(token).catch((e) => {
    console.error(e);
    return false;
  });
  redirect(ok ? "/thanks/stop?done=1" : `/thanks/stop?t=${encodeURIComponent(token)}&error=1`);
}
