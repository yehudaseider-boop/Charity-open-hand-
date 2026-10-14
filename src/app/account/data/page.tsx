import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/card";
import { legalConfig, show } from "@/config/legal";
import { requireViewer } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { RequestForm } from "./request-form";

export const metadata: Metadata = { title: "Your information" };

const kindLabel = { correct: "Correct", delete: "Delete", object: "Stop using" } as const;
const statusLabel = { open: "Open", done: "Done", declined: "Declined" } as const;

/** POPIA rights for the signed-in person: see, download, correct, delete, object. */
export default async function YourInformationPage() {
  const viewer = await requireViewer("/account/data");
  const supabase = await createClient();
  const [{ data: consents }, { data: requests }] = await Promise.all([
    supabase.from("consents").select("kind, policy_version, accepted_at").eq("user_id", viewer.userId).order("accepted_at", { ascending: false }).limit(20),
    supabase.from("data_requests").select("id, kind, status, response, created_at").eq("user_id", viewer.userId).order("created_at", { ascending: false }),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Your information</h1>
      <p className="text-sm text-muted">
        What we keep and why is set out in our <Link href="/privacy" className="text-brand underline">Privacy Policy</Link>.
      </p>

      <Card title="Download everything we hold about you">
        <p className="text-sm text-muted">Your account, donations, receipts, maaser records and agreements, in one file.</p>
        <a href="/account/data/export" className="mt-3 inline-block rounded-control bg-brand px-4 py-2.5 text-sm font-medium text-brand-contrast">
          Download my information
        </a>
      </Card>

      <Card title="Ask us to correct, delete or stop using your information">
        <p className="mb-3 text-sm text-muted">
          If you ask us to delete your account, we delete your sign-in and personal details. Records of past donations and
          receipts that tax law requires us to keep are kept for that period, no longer, and not used for anything else.
        </p>
        <RequestForm />
        {requests && requests.length > 0 ? (
          <ul className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
            {requests.map((r) => (
              <li key={r.id}>
                {kindLabel[r.kind as keyof typeof kindLabel]} · {formatDate(r.created_at)} · {statusLabel[r.status as keyof typeof statusLabel]}
                {r.response ? <p className="text-muted">{r.response}</p> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card title="What you agreed to">
        {consents && consents.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {consents.map((c, i) => (
              <li key={i}>
                Terms and Privacy Policy, version {c.policy_version}, on {formatDate(c.accepted_at)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nothing recorded yet.</p>
        )}
      </Card>

      <p className="text-xs text-muted">
        Questions or complaints: {show(legalConfig.privacyEmail)}. You may also complain to the Information Regulator
        (inforegulator.org.za).
      </p>
    </div>
  );
}
