import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DraftNotice, TermsAndPrivacyLinks } from "@/components/legal";
import { legalConfig } from "@/config/legal";
import { platformConfig } from "@/config/platform";
import { getViewer } from "@/lib/auth";
import { safeNextPath } from "@/lib/safe-path";
import { agreeToPolicy } from "./actions";

export const metadata: Metadata = { title: "Before you continue", robots: { index: false, follow: false } };

/** Shown once per policy version to every signed-in person (sign-up, or after the policy changes). */
export default async function AgreePage({ searchParams }: PageProps<"/agree">) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (viewer.agreedToCurrentPolicy) redirect(next);

  return (
    <div className="mx-auto max-w-md space-y-4 rounded-card border-2 border-border bg-surface p-6 sm:p-8">
      <h1 className="font-display text-2xl text-indigo">Before you continue</h1>
      <DraftNotice />
      <p className="text-sm text-muted">
        {platformConfig.appName} keeps your email address and your giving records so you can see them here and in the app.
        Only you see your giving goal and the labels you give your donations. We never sell your information or send you marketing.
      </p>
      <form action={agreeToPolicy} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="agree" required className="mt-1" />
          <span>I agree to <TermsAndPrivacyLinks /> (version {legalConfig.policyVersion}).</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="age" required className="mt-1" />
          <span>I am 18 or older.</span>
        </label>
        {sp.error ? <p role="alert" className="text-sm text-danger">Please tick both boxes to continue.</p> : null}
        <button className="pressable w-full rounded-control bg-coral px-4 py-3 font-bold text-navy">Continue</button>
      </form>
      {/* Not a trap: the public pages work without an account, and signing out is right here. */}
      <form action="/auth/signout" method="post" className="text-center">
        <button className="text-sm text-muted underline">Not now, sign me out</button>
      </form>
    </div>
  );
}
