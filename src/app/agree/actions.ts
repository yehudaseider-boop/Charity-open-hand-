"use server";

import { redirect } from "next/navigation";
import { legalConfig } from "@/config/legal";
import { logAudit } from "@/lib/audit";
import { safeNextPath } from "@/lib/safe-path";
import { signedInWithPassword } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Records that the signed-in person agreed to the current Terms and Privacy Policy. */
export async function agreeToPolicy(formData: FormData) {
  const next = safeNextPath(formData.get("next"));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // A password session is never Givezy's sign-in (the database refuses it too): it can't agree for anyone.
  if (!user || (await signedInWithPassword(supabase))) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (formData.get("agree") !== "on" || formData.get("age") !== "on") {
    redirect(`/agree?error=1&next=${encodeURIComponent(next)}`);
  }
  const db = createAdminClient();
  // A double submit records the agreement once.
  const { data: already, error: readError } = await db
    .from("consents")
    .select("id")
    .eq("user_id", user.id)
    .eq("kind", "account")
    .eq("policy_version", legalConfig.policyVersion)
    .limit(1)
    .maybeSingle();
  if (readError) throw readError;
  if (already) redirect(next);
  const { error } = await db.from("consents").insert({ kind: "account", policy_version: legalConfig.policyVersion, user_id: user.id });
  if (error) throw error;
  await logAudit({ actorUserId: user.id, action: "consent.account", entityType: "user", entityId: user.id, details: { version: legalConfig.policyVersion } });
  redirect(next);
}
