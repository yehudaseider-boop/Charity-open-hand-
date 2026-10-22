import "server-only";
import { decrypt } from "@/lib/crypto";
import { hitRateLimit, ipKeys } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { demoModeOn, demoPerson } from "./mode";
import { totpCode } from "./totp";

export type DemoSignIn = { ok: true; next: string } | { ok: false; status: 400 | 404 | 429 | 503; why: "off" | "who" | "busy" | "not_set_up" | "failed" };

/**
 * Signs this browser in as one of the made-up demo people, with no email and no phone.
 *
 * It takes the same steps a real sign-in does, done for them on the server: a one-time sign-in token
 * (made by the server, never emailed) and, for admins, a real authenticator-app code from the secret
 * stored when the demo data was made. So the site's own checks (second step, row-level security) are
 * untouched and still apply. It refuses unless demo mode is on AND the account is marked as a demo
 * account in this database (app_metadata.demo, which only the demo data script sets). A real
 * database has no such accounts, so even a demo switch turned on by mistake signs nobody in.
 */
export async function signInAsDemoPerson(who: unknown, ip: string): Promise<DemoSignIn> {
  if (!demoModeOn()) return { ok: false, status: 404, why: "off" };
  const person = demoPerson(who);
  if (!person) return { ok: false, status: 400, why: "who" };
  if (await hitRateLimit("demo-sign-in", ipKeys(ip), 30, 10)) return { ok: false, status: 429, why: "busy" };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id").eq("email", person.email).maybeSingle();
  if (!profile) return { ok: false, status: 503, why: "not_set_up" };
  const { data: found } = await admin.auth.admin.getUserById(profile.id as string);
  const meta = (found?.user?.app_metadata ?? {}) as { demo?: boolean; demo_totp?: string };
  if (meta.demo !== true || found?.user?.email !== person.email) return { ok: false, status: 503, why: "not_set_up" };
  if (person.secondStep && !meta.demo_totp) return { ok: false, status: 503, why: "not_set_up" };

  // A one-time sign-in token, made here and used straight away. generateLink sends no email.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: person.email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) return { ok: false, status: 503, why: "failed" };

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (verifyError) return { ok: false, status: 503, why: "failed" };

  if (person.secondStep) {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp?.[0];
    if (!factor || !meta.demo_totp) return { ok: false, status: 503, why: "not_set_up" };
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totpCode(decrypt(meta.demo_totp)) });
    if (error) {
      await supabase.auth.signOut();
      return { ok: false, status: 503, why: "failed" };
    }
  }
  // A charity's people go straight to its dashboard (its id is new after every reset).
  if (person.next === "/charity-admin") {
    const { data: membership } = await admin.from("charity_admins").select("charity_id").eq("user_id", profile.id as string).limit(1).maybeSingle();
    if (membership) return { ok: true, next: `/charity-admin/${membership.charity_id as string}` };
  }
  return { ok: true, next: person.next };
}
