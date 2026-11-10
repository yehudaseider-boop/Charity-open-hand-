import type { Metadata } from "next";
import { Card, Notice } from "@/components/card";
import { EmptyState, PageHeader } from "@/components/dash";
import { requireViewer } from "@/lib/auth";
import { loadActivity } from "@/lib/charity/activity-store";
import { loadCharityForManager } from "@/lib/charity/queries";

export const metadata: Metadata = { title: "Activity" };

/**
 * Who did what on this dashboard, newest first (team roles, 10/11/2026): receipts approved or declined, downloads,
 * the SARS files, bank and team changes, the donor journey and the rest. Everyone in the team can read it.
 */
export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireViewer(`/charity-admin/${id}/activity`);
  await loadCharityForManager(id);
  const lines = await loadActivity(id).catch((e: unknown) => {
    console.error("[activity] not loaded", e instanceof Error ? e.message : e);
    return null;
  });
  return (
    <div className="space-y-5">
      <PageHeader title="Activity" intro="Who did what on your dashboard, newest first. The latest 100 things are shown." />
      {lines === null ? (
        <Notice>We couldn&apos;t load your activity just now. Nothing was changed. Please reload the page to try again.</Notice>
      ) : lines.length ? (
        <Card>
          <ul className="divide-y divide-border text-sm">
            {lines.map((l, i) => (
              <li key={`${l.at}-${i}`} dir="auto" className="py-2.5 text-navy [overflow-wrap:anywhere]">{l.text}</li>
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState title="Nothing yet">When someone in your team saves, sends, approves or downloads something, it shows here.</EmptyState>
      )}
    </div>
  );
}
