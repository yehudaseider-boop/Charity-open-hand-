import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export { CHANGED_SINCE_OPENED, VERSION_FIELD } from "./submission-version-field";

/**
 * What an application looked like when a page was drawn: when the charity row and its private row (contact and bank
 * details) were last changed. Approving refuses if either moved since the admin opened the page, so a bank account
 * changed in between is never marked as checked unseen (review 23/11/2026).
 */
export async function readSubmissionVersion(charityId: string): Promise<{ version: string; charityUpdatedAt: string; privUpdatedAt: string }> {
  const db = createAdminClient();
  const [charity, priv] = await Promise.all([
    db.from("charities").select("updated_at").eq("id", charityId).maybeSingle(),
    db.from("charity_private").select("updated_at").eq("charity_id", charityId).maybeSingle(),
  ]);
  if (charity.error) throw charity.error;
  if (priv.error) throw priv.error;
  const charityUpdatedAt = String(charity.data?.updated_at ?? "");
  const privUpdatedAt = String(priv.data?.updated_at ?? "");
  return { version: `${charityUpdatedAt}|${privUpdatedAt}`, charityUpdatedAt, privUpdatedAt };
}
