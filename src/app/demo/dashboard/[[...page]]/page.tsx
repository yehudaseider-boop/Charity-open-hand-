import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/card";
import { DashboardShell } from "@/components/dashboard-shell";
import { OverviewView } from "@/app/charity-admin/[id]/overview-view";
import { DEMO_BASE, DEMO_CHARITY, demoOverview } from "../sample";

export const metadata: Metadata = { title: "Charity dashboard demo", robots: { index: false, follow: false } };

/**
 * A public look at the charity dashboard, with made-up figures: no sign-in and no database. Only the Overview
 * is drawn here; every other page of the menu says so and links back.
 */
export default async function DemoDashboard({ params }: PageProps<"/demo/dashboard/[[...page]]">) {
  const { page } = await params;
  const overview = !page || page.length === 0;
  return (
    <DashboardShell id="demo" charity={DEMO_CHARITY} asGivezy={false} base={DEMO_BASE} publicHref={null}>
      <p role="note" className="rounded-card border-2 border-honey bg-honey-soft p-4 text-sm text-navy">
        This is a demonstration with made-up donors and figures. Nothing here is real and nothing you click is saved or sent.
      </p>
      {overview ? (
        <OverviewView {...demoOverview()} />
      ) : (
        <Card title="Not in the demo yet">
          <p className="text-sm">
            This page of the dashboard isn&apos;t part of the demonstration yet. <Link href={DEMO_BASE} className="font-semibold text-brand underline">Back to the Overview</Link>
          </p>
        </Card>
      )}
    </DashboardShell>
  );
}
