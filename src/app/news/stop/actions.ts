"use server";

import { redirect } from "next/navigation";
import { stopAppeals } from "@/lib/charity/appeals";

export async function confirmStopNews(formData: FormData) {
  const token = String(formData.get("t") ?? "");
  const r = await stopAppeals(token).catch((e) => {
    console.error(e);
    return null;
  });
  // "Done" keeps the link's token, and the page checks it really is stopped before saying so (22/11/2026).
  redirect(r ? `/news/stop?t=${encodeURIComponent(token)}&done=1` : `/news/stop?t=${encodeURIComponent(token)}&error=1`);
}
