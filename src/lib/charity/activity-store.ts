import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { AUDIT_SHOWN, activityLines, displayName, type ActivityLine } from "./activity";

/**
 * The latest activity for one charity (team roles, 10/11/2026). Service role: call only after loadCharityForManager.
 * Every query names this charity, so another charity's activity never comes back.
 */
export async function loadActivity(charityId: string, limit = 100): Promise<ActivityLine[]> {
  const db = createAdminClient();
  const [actions, audits] = await Promise.all([
    db.from("charity_actions").select("kind, details, user_id, created_at, undone_at").eq("charity_id", charityId).order("created_at", { ascending: false }).limit(limit),
    db.from("audit_log").select("action, details, actor_user_id, created_at").eq("entity_type", "charity").eq("entity_id", charityId).in("action", Object.keys(AUDIT_SHOWN)).order("created_at", { ascending: false }).limit(limit),
  ]);
  if (actions.error) throw actions.error;
  if (audits.error) throw audits.error;
  const ids = [...new Set([...(actions.data ?? []).map((a) => a.user_id), ...(audits.data ?? []).map((a) => a.actor_user_id)].filter((v): v is string => typeof v === "string"))];
  const { data: people, error } = ids.length ? await db.from("profiles").select("id, full_name, email").in("id", ids) : { data: [], error: null };
  if (error) throw error;
  const byId = new Map((people ?? []).map((p) => [p.id as string, p as { full_name: string | null; email: string | null }]));
  return activityLines(
    (actions.data ?? []).map((a) => ({ kind: a.kind as string, details: (a.details ?? {}) as Record<string, unknown>, userId: a.user_id as string | null, at: a.created_at as string, undoneAt: a.undone_at as string | null })),
    (audits.data ?? []).map((a) => ({ action: a.action as string, details: (a.details ?? {}) as Record<string, unknown>, userId: a.actor_user_id as string | null, at: a.created_at as string })),
    (id) => displayName(id ? byId.get(id) : undefined),
    limit,
  );
}
