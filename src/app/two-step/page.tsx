import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/card";
import { requireCharityAdmin } from "@/lib/auth";
import { safeAdminPath } from "@/lib/safe-path";
import { createClient } from "@/lib/supabase/server";
import { EnrolForm, VerifyForm } from "./forms";

export const metadata: Metadata = { title: "Two-step sign-in" };

/**
 * Charity and platform admins see donor details, so their areas need a
 * second step at sign-in: a code from an authenticator app on their phone.
 */
export default async function TwoStepPage({ searchParams }: PageProps<"/two-step">) {
  const { next: nextParam } = await searchParams;
  const next = safeAdminPath(typeof nextParam === "string" ? nextParam : "");
  await requireCharityAdmin();

  const supabase = await createClient();
  const [{ data: aal }, { data: factors }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);
  if (aal?.currentLevel === "aal2") redirect(next);
  const hasApp = (factors?.totp.length ?? 0) > 0;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-semibold">Two-step sign-in</h1>
      {hasApp ? (
        <Card title="Enter your code">
          <p className="mb-3 text-sm text-muted">Open your authenticator app and type the 6-digit code for this site.</p>
          <VerifyForm next={next} />
        </Card>
      ) : (
        <Card title="Set up your authenticator app">
          <p className="mb-3 text-sm text-muted">
            Admin pages show donors&apos; personal details, so it needs a second step when you sign in: a code from an
            app on your phone. You set this up once. After that you&apos;ll type a code each time you sign in.
          </p>
          <EnrolForm next={next} />
        </Card>
      )}
      <p className="text-xs text-muted">Lost your phone? Contact us and we&apos;ll reset your two-step sign-in after checking it&apos;s you.</p>
    </div>
  );
}
