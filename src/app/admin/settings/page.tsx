import type { Metadata } from "next";
import Link from "next/link";
import { Card, Notice } from "@/components/card";
import { requirePlatformAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { settingsCheck, siteKind, type SettingCheck } from "@/lib/ops/settings-check";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Settings check" };
export const dynamic = "force-dynamic";

/** The newest database changes, each found by something it added. In date order: the last one in means all are. */
const DATABASE_CHANGES: { label: string; table: string; column: string }[] = [
  { label: "Impact per gift (22/10/2026)", table: "charities", column: "impact_unit_cents" },
  { label: "Update my card (22/10/2026)", table: "monthly_card_updates", column: "donation_id" },
  { label: "Receipt emails sent once (22/10/2026)", table: "s18a_receipts", column: "email_claimed_at" },
  { label: "Update my card, same page again (22/10/2026)", table: "monthly_card_updates", column: "checkout_url" },
];

async function databaseChecks(): Promise<SettingCheck[]> {
  let db: ReturnType<typeof createAdminClient>;
  try {
    db = createAdminClient();
  } catch {
    return [{ name: "Database", status: "fix", says: "Can't connect: check the three Supabase settings above." }];
  }
  const { error } = await db.from("charities").select("id", { head: true, count: "exact" }).limit(1);
  if (error) return [{ name: "Database", status: "fix", says: "Can't reach it with these settings. Check the Supabase address and secret key." }];
  const out: SettingCheck[] = [{ name: "Database", status: "ok", says: "Reached." }];
  for (const c of DATABASE_CHANGES) {
    const { error: e } = await db.from(c.table).select(c.column, { head: true }).limit(1);
    out.push(e ? { name: c.label, status: "fix", says: "Not in this database yet. Claude applies it once you say yes." } : { name: c.label, status: "ok", says: "In." });
  }
  return out;
}

const mark = { ok: "✓", fix: "!", later: "–" } as const;
const tone = { ok: "bg-success-soft text-success", fix: "bg-danger-soft text-danger", later: "bg-brand-soft text-indigo" } as const;
const word = { ok: "Fine", fix: "Needs fixing", later: "Off for now" } as const;

function List({ items, plain }: { items: SettingCheck[]; plain?: boolean }) {
  return (
    <ul className="divide-y divide-border">
      {items.map((c) => (
        <li key={c.name} className="flex gap-3 py-2.5">
          <span aria-hidden className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-sm font-bold ${tone[c.status]}`}>{mark[c.status]}</span>
          <div className="min-w-0">
            <p className={`${plain ? "" : "font-mono "}text-sm font-semibold text-navy [overflow-wrap:anywhere]`}>
              {c.name} <span className="sr-only">: {word[c.status]}.</span>
            </p>
            <p className="text-sm text-muted">{c.says}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Is the host set up right? A tick or a plain-words problem for each setting and the newest database changes.
 * Never shows a value: only whether it is there and the right shape.
 */
export default async function SettingsCheckPage() {
  await requirePlatformAdmin();
  const settings = settingsCheck(process.env);
  const database = await databaseChecks();
  const site = siteKind(process.env);
  const toFix = [...settings, ...database].filter((c) => c.status === "fix").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-indigo">Settings check</h1>
        <p className="text-sm text-muted">
          {site === "live" ? "The live site" : site === "test" ? "The test site" : "This site"}. Each setting on the host, checked for being there and the right shape. Values are never shown.
          Checked {formatDateTime(new Date())}. After changing a setting on the host, redeploy, then <Link href="/admin/settings" className="font-semibold text-brand underline underline-offset-4">check again</Link>.
        </p>
      </div>
      <div role="status">
        {toFix ? (
          <Notice tone="warning">{toFix === 1 ? "1 thing needs fixing" : `${toFix} things need fixing`}. Each one says what to do.</Notice>
        ) : (
          <Notice tone="success">Everything needed is set. Items marked &quot;off for now&quot; are expected for launch.</Notice>
        )}
      </div>
      <Card title="Settings">
        <List items={settings} />
      </Card>
      <Card title="Database">
        <List items={database} plain />
      </Card>
    </div>
  );
}
