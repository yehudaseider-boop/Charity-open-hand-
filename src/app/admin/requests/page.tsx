import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { closeRequest } from "./actions";

export const metadata: Metadata = { title: "Privacy requests" };

/** Requests to correct, delete or stop using someone's information, for the Information Officer. */
export default async function PrivacyRequestsPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { data: requests, error } = await supabase
    .from("data_requests")
    .select("id, user_id, kind, details, created_at")
    .eq("status", "open")
    .order("created_at");
  if (error) throw error;
  const ids = [...new Set((requests ?? []).map((r) => r.user_id as string))];
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, email").in("id", ids) : { data: [] };
  const emailOf = new Map((people ?? []).map((p) => [p.id as string, p.email as string]));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Privacy requests</h1>
      <p className="text-sm text-muted">
        Correct or delete what the person asks for, keeping only the donation and receipt records tax law requires. Then
        close the request with a short reply; they see it on their &quot;Your information&quot; page.
      </p>
      {requests && requests.length > 0 ? (
        <ul className="space-y-3">
          {requests.map((r) => (
            <li key={r.id} className="space-y-2 rounded-card border border-border bg-surface p-4 text-sm">
              <p className="font-medium">
                {r.kind === "delete" ? "Delete" : r.kind === "correct" ? "Correct" : "Stop using"} · {emailOf.get(r.user_id) ?? r.user_id} ·{" "}
                {formatDate(r.created_at)}
              </p>
              {r.details ? <p className="whitespace-pre-wrap text-muted">{r.details}</p> : null}
              <form action={closeRequest.bind(null, r.id)} className="space-y-2">
                <textarea name="response" rows={2} maxLength={2000} placeholder="Reply to the person" className="w-full rounded-control border border-border bg-surface px-3 py-2" />
                <div className="flex gap-2">
                  <button name="status" value="done" className="rounded-control bg-brand px-3 py-2 text-brand-contrast">Mark done</button>
                  <button name="status" value="declined" className="rounded-control border border-border px-3 py-2">Decline</button>
                </div>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No open requests.</p>
      )}
    </div>
  );
}
