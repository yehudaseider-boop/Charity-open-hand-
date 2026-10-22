"use server";

import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { newCardLinkValid, ownsMonthly, startNewCardPayment } from "@/lib/donations/new-card";
import { hitRateLimit } from "@/lib/rate-limit";

/**
 * Open the payment provider's page to pay this month's monthly donation with a new card. Allowed for the
 * signed-in donor it belongs to, or with the signed link from our email. Nothing is charged or changed here.
 */
export async function payWithNewCard(formData: FormData) {
  const m = String(formData.get("m") ?? "");
  const e = String(formData.get("e") ?? "");
  const s = String(formData.get("s") ?? "");
  const back = (x: string) => `/monthly/new-card?${new URLSearchParams({ m, ...(e && s ? { e, s } : {}), x })}`;
  const now = new Date();
  const viewer = await getViewer();
  const allowed = newCardLinkValid(m, e, s, now) || (viewer ? await ownsMonthly(viewer.userId, m) : false);
  if (!allowed) redirect(back("link"));
  // A few tries per monthly donation in ten minutes: each one opens a payment page.
  if (await hitRateLimit("monthly-new-card", [`m:${m}`], 5, 10).catch(() => false)) redirect(back("limit"));
  let target: string;
  try {
    const r = await startNewCardPayment(m, now);
    if (!r.ok) redirect(back(r.reason));
    target = r.redirectUrl;
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    if (typeof err === "object" && err !== null && "digest" in err) throw err;
    console.error(err);
    redirect(back("error"));
  }
  redirect(target);
}
