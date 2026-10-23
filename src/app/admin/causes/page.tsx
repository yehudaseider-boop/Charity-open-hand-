import type { Metadata } from "next";
import { Card, Notice } from "@/components/card";
import { PendingButton } from "@/components/forms/pending-button";
import { requirePlatformAdmin } from "@/lib/auth";
import { causeMessages, SUGGESTED_CAUSES } from "@/lib/charity/causes";
import { createAdminClient } from "@/lib/supabase/admin";
import { addCause, addSuggestedCauses, moveCause, removeCause, renameCause } from "./actions";

export const metadata: Metadata = { title: "Causes" };

/**
 * The cause list donors filter by (website and app) and charities tick on their profile. Added, renamed and
 * ordered here; a cause no charity uses can be removed.
 */
export default async function CausesPage({ searchParams }: PageProps<"/admin/causes">) {
  await requirePlatformAdmin();
  const sp = await searchParams;
  const db = createAdminClient();
  const [{ data: causes, error }, { data: links, error: linkError }] = await Promise.all([
    db.from("categories").select("id, slug, name_en, sort_order").order("sort_order").order("name_en"),
    db.from("charity_categories").select("category_id"),
  ]);
  if (error) throw error;
  if (linkError) throw linkError;
  const used = new Map<string, number>();
  for (const l of links ?? []) used.set(l.category_id as string, (used.get(l.category_id as string) ?? 0) + 1);
  const said = (k: unknown) => (typeof k === "string" && Object.hasOwn(causeMessages, k) ? causeMessages[k] : undefined);
  const done = said(sp.done);
  const problem = said(sp.error);
  const list = causes ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-indigo">Causes</h1>
        <p className="text-sm text-muted">What donors filter charities by, on the website and in the app, in this order. Each charity ticks its own on its profile.</p>
      </div>
      {done ? <p role="status" className="rounded-card bg-success-soft p-3 text-sm text-success">{done}</p> : null}
      {problem ? <p role="alert" className="rounded-card bg-danger-soft p-3 text-sm text-danger">{problem}</p> : null}

      {list.length === 0 ? (
        <Notice tone="warning">
          There are no causes yet, so the home page shows no cause buttons and Charities shows only &quot;All&quot;. Add the launch list in one go, or add your own below.
        </Notice>
      ) : null}

      <Card title="Add a cause">
        <form action={addCause} className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor="new-cause" className="mb-1 block text-sm font-medium">Name</label>
            <input id="new-cause" name="name" required maxLength={40} placeholder="For example: Food and welfare" className="w-full min-w-0 rounded-control border-2 border-border bg-surface px-3 py-2" />
          </div>
          <PendingButton pendingLabel="Adding…" className="pressable rounded-control bg-brand px-4 py-2 font-semibold text-brand-contrast">Add</PendingButton>
        </form>
        <form action={addSuggestedCauses} className="mt-4 border-t border-border pt-4">
          <p className="text-sm text-muted">The launch list: {SUGGESTED_CAUSES.join(", ")}.</p>
          <PendingButton pendingLabel="Adding…" className="mt-2 rounded-control border-2 border-border px-4 py-2 text-sm font-semibold text-brand hover:border-brand">Add the launch list (only the missing ones)</PendingButton>
        </form>
      </Card>

      {list.length ? (
        <Card title={`The list (${list.length})`}>
          <ul className="divide-y divide-border">
            {list.map((c) => {
              const n = used.get(c.id as string) ?? 0;
              return (
                <li key={c.id as string} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 font-medium [overflow-wrap:anywhere]">{c.name_en as string}</p>
                    <p className="text-xs text-muted">{n ? `${n} ${n === 1 ? "charity" : "charities"}` : "No charity yet"}</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <form action={renameCause} className="flex min-w-0 gap-2 sm:flex-1">
                      <input type="hidden" name="id" value={c.id as string} />
                      <label className="sr-only" htmlFor={`name-${c.id}`}>New name for {c.name_en as string}</label>
                      <input id={`name-${c.id}`} name="name" defaultValue={c.name_en as string} required maxLength={40} className="min-w-0 flex-1 rounded-control border-2 border-border bg-surface px-3 py-1.5 text-sm" />
                      <PendingButton pendingLabel="Saving…" className="rounded-control border-2 border-border px-3 py-1.5 text-sm font-semibold text-brand hover:border-brand">Rename</PendingButton>
                    </form>
                    <div className="flex flex-wrap gap-2">
                    <form action={moveCause}>
                      <input type="hidden" name="id" value={c.id as string} />
                      <input type="hidden" name="dir" value="up" />
                      <PendingButton pendingLabel="…" className="rounded-control border-2 border-border px-3 py-1.5 text-sm disabled:opacity-40">
                        <span aria-label={`Move ${c.name_en as string} up`}>Up</span>
                      </PendingButton>
                    </form>
                    <form action={moveCause}>
                      <input type="hidden" name="id" value={c.id as string} />
                      <input type="hidden" name="dir" value="down" />
                      <PendingButton pendingLabel="…" className="rounded-control border-2 border-border px-3 py-1.5 text-sm">
                        <span aria-label={`Move ${c.name_en as string} down`}>Down</span>
                      </PendingButton>
                    </form>
                    {n === 0 ? (
                      <form action={removeCause}>
                        <input type="hidden" name="id" value={c.id as string} />
                        <PendingButton pendingLabel="Removing…" className="rounded-control border-2 border-danger-soft px-3 py-1.5 text-sm font-semibold text-danger hover:border-danger">Remove</PendingButton>
                      </form>
                    ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
