import type { Metadata } from "next";
import { Card, Notice } from "@/components/card";
import { requirePlatformAdmin } from "@/lib/auth";
import { weekStart } from "@/lib/charity/thank-you";
import { formatDate } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import { clearFeatured, setFeatured } from "./actions";
import { PendingButton } from "@/components/forms/pending-button";

export const metadata: Metadata = { title: "Cause of the week" };

const WEEKS = 8;
const plusDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const shown = (iso: string) => formatDate(`${iso}T12:00:00+02:00`);
/** Only a real yyyy-mm-dd from our own redirect is shown; anything else in the address is ignored. */
const dayParam = (v: string | string[] | undefined) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`)) ? v : null);

/**
 * Cause of the week (from Alza of Feed a Child, 21/10/2026): one approved charity per week, Monday to
 * Sunday, shown at the top of Discover in the app. A week left empty shows no card.
 */
export default async function FeaturedPage({ searchParams }: PageProps<"/admin/featured">) {
  await requirePlatformAdmin();
  const sp = await searchParams;
  const first = weekStart(new Date());
  const weeks = Array.from({ length: WEEKS }, (_, i) => plusDays(first, i * 7));
  const db = createAdminClient();
  const [{ data: charities, error }, { data: picks, error: pickError }] = await Promise.all([
    db.from("charities").select("id, name_en").eq("status", "approved").order("name_en"),
    db.from("featured_charities").select("week_start, charity_id").gte("week_start", first).lte("week_start", weeks[WEEKS - 1]),
  ]);
  if (error) throw error;
  if (pickError) throw pickError;
  const nameOf = new Map((charities ?? []).map((c) => [c.id as string, c.name_en as string]));
  const pickOf = new Map((picks ?? []).map((p) => [p.week_start as string, p.charity_id as string]));
  const saved = dayParam(sp.saved);
  const cleared = dayParam(sp.cleared);
  const flash = saved ? `Saved for the week of ${shown(saved)}.` : cleared ? `The week of ${shown(cleared)} has no cause of the week now.` : null;
  const problem = sp.error === "week" ? "That week can't be chosen: pick this week or a later one. Nothing was changed." : sp.error === "charity" ? "Choose an approved charity. Nothing was changed." : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Cause of the week</h1>
        <p className="text-sm text-muted">One charity a week at the top of Discover in the app, Monday to Sunday. Leave a week empty and the app shows no card that week.</p>
      </div>
      {flash ? <p role="status" className="rounded-card bg-success-soft p-3 text-sm text-success">{flash}</p> : null}
      {problem ? <p role="alert" className="rounded-card bg-danger-soft p-3 text-sm text-danger">{problem}</p> : null}
      {!charities?.length ? <Notice tone="warning">No approved charities yet.</Notice> : null}
      <Card>
        <ul className="divide-y divide-border text-sm">
          {weeks.map((w, i) => {
            const pick = pickOf.get(w);
            return (
              <li key={w} className="space-y-2 py-3">
                <p className="font-medium">
                  {i === 0 ? "This week: " : i === 1 ? "Next week: " : ""}
                  {shown(w)} to {shown(plusDays(w, 6))}
                </p>
                <p className={pick ? "" : "text-muted"}>{pick ? nameOf.get(pick) ?? "A charity that is no longer approved (not shown)" : "Nothing chosen"}</p>
                {charities?.length ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={setFeatured} className="flex min-w-0 flex-1 flex-wrap gap-2">
                      <input type="hidden" name="week" value={w} />
                      <label className="sr-only" htmlFor={`c-${w}`}>Charity for the week of {shown(w)}</label>
                      <select id={`c-${w}`} name="charity_id" defaultValue={pick ?? ""} required className="min-w-0 max-w-full flex-1 rounded-control border border-border bg-surface px-3 py-2">
                        <option value="" disabled>Choose a charity</option>
                        {(charities ?? []).map((c) => <option key={c.id as string} value={c.id as string}>{c.name_en as string}</option>)}
                      </select>
                      <PendingButton pendingLabel="Saving…" className="pressable rounded-control bg-brand px-4 py-2 font-medium text-brand-contrast">{pick ? "Change" : "Choose"}</PendingButton>
                    </form>
                    {pick ? (
                      <form action={clearFeatured}>
                        <input type="hidden" name="week" value={w} />
                        <PendingButton pendingLabel="Clearing…" className="rounded-control border border-border px-3 py-2">Clear</PendingButton>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
