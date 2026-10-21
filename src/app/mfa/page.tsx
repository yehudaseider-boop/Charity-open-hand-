import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SupportContact } from "@/components/legal";
import { signedInWithPassword } from "@/lib/auth";
import { safeNextPath } from "@/lib/mfa";
import { createClient } from "@/lib/supabase/server";
import { CodeField, Enrol } from "./enrol";
import { verifyCode } from "./actions";

export const metadata: Metadata = { title: "Second step", robots: { index: false, follow: false } };

export default async function MfaPage({ searchParams }: PageProps<"/mfa">) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Only sessions started with an emailed code reach the second step (see auth.ts).
  if (!user || (await signedInWithPassword(supabase))) redirect(`/login?next=${encodeURIComponent(`/mfa?next=${encodeURIComponent(next)}`)}`);
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") redirect(next);

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp?.[0]; // listFactors returns verified factors here
  const error =
    sp.error === "code" ? "That code didn't work. Check the code and try again."
    : sp.error === "busy" ? "Too many tries. Please wait 15 minutes and try again."
    : null;

  return (
    <div className="mx-auto max-w-sm rounded-card border border-border bg-surface p-6">
      <h1 className="text-xl font-semibold">{verified ? "Enter your code" : "Set up a second step"}</h1>
      <div className="mt-4">
        {error ? <p role="alert" className="mb-3 text-sm text-danger">{error}</p> : null}
        {verified ? (
          <form action={verifyCode} className="space-y-3">
            <p className="text-sm text-muted">Open your authenticator app and enter the 6-digit code for Givezy.</p>
            <input type="hidden" name="factorId" value={verified.id} />
            <input type="hidden" name="next" value={next} />
            <CodeField />
            <button className="w-full rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast">Continue</button>
          </form>
        ) : (
          <Enrol next={next} />
        )}
        {verified ? (
          <p className="mt-4 text-xs text-muted">
            Lost your phone or changed it? We can reset this for you once we&apos;ve checked it&apos;s you: <SupportContact />.
          </p>
        ) : null}
      </div>
    </div>
  );
}
