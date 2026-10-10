import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DraftNotice, TermsAndPrivacyLinks } from "@/components/legal";
import { legalConfig } from "@/config/legal";
import { platformConfig } from "@/config/platform";
import { getViewer } from "@/lib/auth";
import { safeNextPath } from "@/lib/safe-path";
import { agreeToPolicy } from "./actions";

export const metadata: Metadata = { title: "Before you continue" };

/** Shown once per policy version to every signed-in person (sign-up, or after the policy changes). */
export default async function AgreePage({ searchParams }: PageProps<"/agree">) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (viewer.agreedToCurrentPolicy) redirect(next);

  return (
    <div className="mx-auto max-w-sm space-y-4 rounded-card border border-border bg-surface p-6">
      <h1 className="text-xl font-semibold">Before you continue</h1>
      <DraftNotice />
      <p className="text-sm text-muted">
        {platformConfig.appName} keeps your email address and your giving records so you can see them here and in the app.
        Only you see your maaser and chomesh. We never sell your information or send you marketing.
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
        {sp.error ? <p className="text-sm text-danger">Please tick both boxes to continue.</p> : null}
        <button className="w-full rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast">Continue</button>
      </form>
    </div>
  );
}
