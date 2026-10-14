import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Append an entry to the audit log. Never throws away a failure silently. */
export async function logAudit(entry: {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
}) {
  const { error } = await createAdminClient().from("audit_log").insert({
    actor_user_id: entry.actorUserId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    details: entry.details ?? {},
  });
  if (error) throw new Error(`Audit log write failed: ${error.message}`);
}
