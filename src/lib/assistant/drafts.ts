import "server-only";
import { assistantConfig } from "@/config/assistant";
import { pickAudience } from "@/lib/charity/appeals";
import { parseAudience } from "@/lib/charity/appeals-rules";
import { can, refusedFor, type Role } from "@/lib/charity/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { isGivyAudience, type GivyAudience } from "./thank-you-draft";
import type { ThankYouPreparer } from "./tools";

/**
 * Where a thank-you Givy prepared waits for the person to check and send it (24/11/2026). The draft is kept on our
 * server for a few hours (assistant_drafts, server-only), and the panel's button carries only its id, so the words
 * never travel in a web address (which ends up in logs and the browser's history). It is read back only for the same
 * person on the same charity's dashboard, and only before it expires. Before the table's migration has run, nothing is
 * kept: the button then opens Email donors with only the audience chosen.
 */

const isMissingTable = (e: { code?: string } | null | undefined) => e?.code === "PGRST205" || e?.code === "42P01";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Draft = { audience: GivyAudience; subject: string; body: string };

/** Keeps a draft for this person and charity. The new id, or null when it can't be kept (no table yet, a failed write). */
export async function saveDraft(args: { charityId: string; userId: string } & Draft, now = new Date()): Promise<string | null> {
  const db = createAdminClient();
  const expires = new Date(now.getTime() + assistantConfig.draftHours * 3_600_000).toISOString();
  const { data, error } = await db
    .from("assistant_drafts")
    .insert({ charity_id: args.charityId, user_id: args.userId, audience: args.audience, subject: args.subject, body: args.body, expires_at: expires })
    .select("id")
    .single();
  if (error) {
    if (!isMissingTable(error)) console.error("[assistant] draft not kept", error.message);
    return null;
  }
  // Tidy as we go: this person's expired drafts for this charity.
  await db.from("assistant_drafts").delete().eq("charity_id", args.charityId).eq("user_id", args.userId).lt("expires_at", now.toISOString());
  return (data?.id as string | undefined) ?? null;
}

/**
 * A draft for the Email donors page: only this person's, on this charity, not expired. "gone" when the id is
 * unknown, someone else's, for another charity or expired (the page says so plainly); null when there's no table yet.
 */
export async function loadDraft(id: string, charityId: string, userId: string, now = new Date()): Promise<Draft | "gone" | null> {
  if (!UUID.test(id)) return "gone";
  const { data, error } = await createAdminClient()
    .from("assistant_drafts")
    .select("audience, subject, body, expires_at")
    .eq("id", id)
    .eq("charity_id", charityId)
    .eq("user_id", userId)
    .gt("expires_at", now.toISOString())
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  if (!data || !isGivyAudience(data.audience)) return "gone";
  return { audience: data.audience, subject: data.subject as string, body: data.body as string };
}

/**
 * Givy's "prepare a thank-you" for a real charity: checks the person may email donors and the page is live, works out
 * on the server how many donors the audience reaches now (a count only, never names, so it works with the
 * donor-names switch off), and keeps the draft. Sends nothing.
 */
export function livePreparer(args: { charityId: string; userId: string; role: Role; status: () => Promise<string | null> }): ThankYouPreparer {
  return {
    async prepare(d) {
      if (!can(args.role, "message")) return { refused: refusedFor("message") };
      if ((await args.status()) !== "approved") return { refused: "The charity can email donors once its page is live, so nothing was prepared." };
      const audience = parseAudience(d.audience);
      if (!audience) return { refused: "That audience isn't one the Email donors page knows." };
      const pick = await pickAudience(args.charityId, audience).catch((e: unknown) => {
        console.error("[assistant] audience count failed", e instanceof Error ? e.message : e);
        return null;
      });
      const draftId = await saveDraft({ charityId: args.charityId, userId: args.userId, ...d }).catch(() => null);
      return { label: pick?.label ?? null, count: pick ? pick.donors.length : null, draftId };
    },
  };
}
