import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/card";
import { legalConfig, show } from "@/config/legal";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DeleteForm } from "./delete-form";
import { alreadyAskedSentence, openDeleteRequest } from "./open-request";

export const metadata: Metadata = { title: "Delete my account", robots: { index: false, follow: false } };

/** Delete my account: a direct page for the phone app and the website (App Store guideline 5.1.1(v)). */
export default async function DeleteAccountPage() {
  const viewer = await requireViewer("/account/data/delete");
  const supabase = await createClient();
  const { data: requests } = await supabase
    .from("data_requests")
    .select("kind, status, created_at")
    .eq("user_id", viewer.userId)
    .eq("kind", "delete")
    .eq("status", "open")
    .order("created_at", { ascending: true });
  const already = openDeleteRequest(requests);

  return (
    <div className="space-y-4">
      <Link href="/account/data" className="text-sm font-semibold text-muted hover:text-brand">← Your information</Link>
      <h1 className="font-display text-2xl text-indigo">Delete my account</h1>

      <Card title="What happens">
        <div className="space-y-3 text-sm text-muted">
          <p>
            When we delete your account, we delete your sign-in and personal details. Records of past donations and receipts that
            tax law requires us to keep are kept for that period, no longer, and not used for anything else.
          </p>
          <p>Any open monthly donations are stopped when we delete the account.</p>
          <p>We check that the request is from you first, then reply by email.</p>
        </div>
        <div className="mt-4">
          {already ? <p role="status" className="text-sm font-medium">{alreadyAskedSentence(already.created_at)}</p> : <DeleteForm />}
        </div>
      </Card>

      <p className="text-xs text-muted">Questions: {show(legalConfig.privacyEmail)}.</p>
    </div>
  );
}
