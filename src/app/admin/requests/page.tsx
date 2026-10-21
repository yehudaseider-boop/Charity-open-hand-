import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { closeRequest, eraseByEmailForm, eraseForRequest } from "./actions";
import { EraseByEmailForm } from "./erase-form";

export const metadata: Metadata = { title: "Privacy requests" };

/** Requests to correct, delete or stop using someone's information, for the Information Officer. */
export default async function PrivacyRequestsPage({ searchParams }: PageProps<"/admin/requests">) {
  await requirePlatformAdmin();
  const { erased, donors } = await searchParams;
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
      {erased === "full" || erased === "kept" || erased === "guest" ? (
        <p role="status" className="rounded-control bg-success-soft p-3 text-sm text-success">
          Done. {donors ?? 0} donor {Number(donors) === 1 ? "record was" : "records were"} erased.
          {erased === "kept" ? " Their sign-in account was kept (it belongs to someone who runs a charity or the platform)." : null}
          {erased === "full" ? " Their sign-in account was deleted." : null}
        </p>
      ) : null}
      {erased === "unchecked" || erased === "check" ? <p role="status" className="rounded-control bg-danger-soft p-3 text-sm text-danger">Nothing was erased. Tick the box to confirm you have checked who is asking{erased === "check" ? ", and type the email address twice, the same both times" : ""}.</p> : null}
      {erased === "hasaccount" ? <p role="status" className="rounded-control bg-danger-soft p-3 text-sm text-danger">Nothing was erased. That address has a sign-in account, so erase it from the person&apos;s own delete request above.</p> : null}
      {erased === "notfound" ? <p role="status" className="rounded-control bg-danger-soft p-3 text-sm text-danger">That request is not an open delete request.</p> : null}
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
              {r.kind === "delete" ? (
                <form action={eraseForRequest.bind(null, r.id)} className="space-y-2 rounded-control border border-border p-3">
                  <p className="text-xs text-muted">
                    Erases their name, contact details, address, ID and tax numbers, messages and giving choices, stops any monthly
                    donation, and deletes their sign-in account. Keeps each donation&apos;s amount, date and charity and any s18A receipt
                    already issued (tax law). They are emailed to say it is done. This cannot be undone.
                  </p>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" name="checked" className="mt-1" />
                    <span>I have checked this request is really from the person.</span>
                  </label>
                  <button className="min-h-11 rounded-control border border-danger px-3 py-2 text-danger">Erase their information</button>
                </form>
              ) : null}
              <form action={closeRequest.bind(null, r.id)} className="space-y-2">
                <textarea name="response" rows={2} maxLength={2000} aria-label="Reply to the person" placeholder="Reply to the person" className="w-full rounded-control border border-border bg-surface px-3 py-2" />
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
      <section className="space-y-2 rounded-card border border-border bg-surface p-4 text-sm">
        <h2 className="font-semibold">Erase a donor with no account</h2>
        <p className="text-muted">For someone who gave as a guest and asked by email. Check who they are first. Type their email address twice.</p>
        <EraseByEmailForm action={eraseByEmailForm} />
      </section>
    </div>
  );
}
