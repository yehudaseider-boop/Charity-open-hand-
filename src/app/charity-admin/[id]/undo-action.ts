"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { undoAction } from "@/lib/charity/charity-actions";
import { loadCharityForManager } from "@/lib/charity/queries";
import { safeNextPath } from "@/lib/safe-path";

/** "Undo" on the panel after an action. Comes back to the same page, which says what happened. */
export async function undoCharityAction(charityId: string, actionId: string, returnTo: string): Promise<void> {
  const viewer = await requireViewer();
  const { charity } = await loadCharityForManager(charityId);
  const base = `/charity-admin/${charityId}`;
  // Only ever back to a page of this charity's dashboard.
  const safe = safeNextPath(returnTo, base);
  const page = safe.startsWith(base) && !safe.includes("//") ? safe.split("?")[0] : base;
  const step = /[?&]step=([a-z]+)/.exec(returnTo)?.[1];
  // Which donor journey the page was showing (general, win-back or a campaign's), so Undo comes back to it.
  const journey = /[?&]j=(winback|campaign%3A[0-9a-fA-F-]{36}|campaign:[0-9a-fA-F-]{36})(?:&|$)/.exec(returnTo)?.[1];
  const r = await undoAction(charityId, actionId, viewer.userId, charity.status);
  revalidatePath(base, "layout");
  revalidatePath(`/c/${charity.slug}`);
  const q = new URLSearchParams({ ...(step ? { step } : {}), ...(journey ? { j: decodeURIComponent(journey) } : {}), ...(r.ok ? { undone: actionId } : { done: actionId, undo_failed: r.why }) });
  redirect(`${page}?${q}`);
}
