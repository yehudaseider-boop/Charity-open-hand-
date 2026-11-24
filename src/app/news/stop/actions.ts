"use server";

import { redirect } from "next/navigation";
import { stopAppeals } from "@/lib/charity/appeals";

export async function confirmStopNews(formData: FormData) {
  const token = String(formData.get("t") ?? "");
  // A link that wasn't ours says so; a failure on our side (24/11/2026) says nothing was changed and to try again.
  let r: Awaited<ReturnType<typeof stopAppeals>> | "failed";
  try {
    r = await stopAppeals(token);
  } catch (e) {
    console.error(e);
    r = "failed";
  }
  if (r === "failed") redirect(`/news/stop?t=${encodeURIComponent(token)}&error=2`);
  // "Done" keeps the link's token, and the page checks it really is stopped before saying so (22/11/2026).
  redirect(r ? `/news/stop?t=${encodeURIComponent(token)}&done=1` : `/news/stop?t=${encodeURIComponent(token)}&error=1`);
}
