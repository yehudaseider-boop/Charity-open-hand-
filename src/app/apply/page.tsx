import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/card";
import { platformConfig } from "@/config/platform";
import { getViewer } from "@/lib/auth";
import { StartForm } from "./start-form";

export const metadata: Metadata = { title: "List your charity" };

export default async function ApplyPage() {
  const viewer = await getViewer();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">List your charity on {platformConfig.appName}</h1>
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
          <StartForm />
        ) : (
          <p className="text-sm">
            <Link href="/login?next=/apply" className="text-brand underline">Sign in</Link> with your email first, so
            you can come back to your application.
          </p>
        )}
      </Card>
    </div>
  );
}
