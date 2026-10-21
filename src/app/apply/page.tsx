import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/card";
import { platformConfig } from "@/config/platform";
import { getViewer } from "@/lib/auth";
import { findOpenInvite, isInviteToken } from "@/lib/charity/invites";
import { StartForm } from "./start-form";

export const metadata: Metadata = { title: "List your charity" };

export default async function ApplyPage({ searchParams }: PageProps<"/apply">) {
  const viewer = await getViewer();
  const { invite: raw } = (await searchParams) as { invite?: string };
  const token = isInviteToken(raw) ? raw : undefined;
  const invite = await findOpenInvite(token);
  const next = token ? `/apply?invite=${token}` : "/apply";
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">List your charity on {platformConfig.appName}</h1>
      {invite ? (
        <p className="rounded-card border border-border bg-brand-soft p-4 text-sm">
          You&apos;ve been invited to list <span className="font-semibold">{invite.charityName}</span>. Its name is filled in below.
        </p>
      ) : token ? (
        <p className="rounded-card border border-border bg-surface p-4 text-sm text-muted">
          This invitation link has expired or was already used. You can still start an application below.
        </p>
      ) : null}
      <Card title="What you'll need">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Registered name, and NPO number or PBO reference number</li>
          <li>Registered address and a contact person</li>
          <li>Bank account for donations, with a bank confirmation letter</li>
          <li>PBO approval letter, if you have PBO status</li>
          <li>
            For s18A receipts: your s18A approval and a signed receipting mandate. This lets us issue
            receipts in your name.
          </li>
        </ul>
        <p className="mt-3 text-sm text-muted">
          Organisations without s18A approval are welcome. Donors can still give, but no tax receipts are issued.
          Listing is free.
        </p>
      </Card>
      <Card title="Start">
        {viewer ? (
          <StartForm defaultName={invite?.charityName} invite={invite ? token : undefined} />
        ) : (
          <p className="text-sm">
            <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-brand underline">Sign in</Link> with your email first, so
            you can come back to your application.
          </p>
        )}
      </Card>
    </div>
  );
}
