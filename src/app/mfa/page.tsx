import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/mfa";
import { createClient } from "@/lib/supabase/server";
import { CodeField, Enrol } from "./enrol";
import { verifyCode } from "./actions";

export const metadata: Metadata = { title: "Second step" };

export default async function MfaPage({ searchParams }: PageProps<"/mfa">) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/mfa?next=${encodeURIComponent(next)}`)}`);
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") redirect(next);

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp?.[0]; // listFactors returns verified factors here
  const error = sp.error === "code" ? "That code didn't work. Check the code and try again." : null;

  return (
    <div className="mx-auto max-w-sm rounded-card border border-border bg-surface p-6">
      <h1 className="text-xl font-semibold">{verified ? "Enter your code" : "Set up a second step"}</h1>
      <div className="mt-4">
        {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
        {verified ? (
          <form action={verifyCode} className="space-y-3">
            <p className="text-sm text-muted">Open your authenticator app and enter the 6-digit code for NEDIV lev.</p>
            <input type="hidden" name="factorId" value={verified.id} />
            <input type="hidden" name="next" value={next} />
            <CodeField />
            <button className="w-full rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast">Continue</button>
          </form>
        ) : (
          <Enrol next={next} />
        )}
      </div>
    </div>
  );
}
