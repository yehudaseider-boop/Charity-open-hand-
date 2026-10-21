"use server";

import { redirect } from "next/navigation";
import { stopAppeals } from "@/lib/charity/appeals";

export async function confirmStopNews(formData: FormData) {
  const token = String(formData.get("t") ?? "");
  const r = await stopAppeals(token).catch((e) => {
    console.error(e);
    return null;
  });
  redirect(r ? "/news/stop?done=1" : `/news/stop?t=${encodeURIComponent(token)}&error=1`);
}
