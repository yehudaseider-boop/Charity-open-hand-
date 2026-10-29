import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard-shell";
import { OverviewView } from "@/app/charity-admin/[id]/overview-view";
import { demoData } from "../data";
import { DEMO_BASE, DEMO_CHARITY, demoOverview } from "../sample";
import { DemoAbout, DemoCampaigns, DemoDonation, DemoDonations, DemoDonor, DemoDonors, DemoMonthly, DemoReceipts, DemoReport } from "../pages";

export const metadata: Metadata = { title: "Charity dashboard demo", robots: { index: false, follow: false } };

/**
 * A public look at the whole charity dashboard, with made-up records: no sign-in and no database. Every page
 * of the menu opens; the pages that send or save things describe what they do.
 */
export default async function DemoDashboard({ params, searchParams }: PageProps<"/demo/dashboard/[[...page]]">) {
  const [{ page = [] }, sp] = await Promise.all([params, searchParams]);
  const now = new Date();
  const data = demoData(now);
  const [first, second] = page;
  const path = page.join("/");
  let body: React.ReactNode;
  if (page.length === 0) body = <OverviewView {...demoOverview(now, data)} />;
  else if (first === "donations" && !second) body = <DemoDonations data={data} sp={sp} />;
  else if (first === "donations" && second && !["record", "import", "deposits"].includes(second)) body = <DemoDonation data={data} id={second} />;
  else if (first === "donors" && !second) body = <DemoDonors data={data} sp={sp} />;
  else if (first === "donors" && second) body = <DemoDonor data={data} id={second} />;
  else if (first === "monthly") body = <DemoMonthly data={data} sp={sp} />;
  else if (first === "campaigns") body = <DemoCampaigns data={data} />;
  else if (first === "receipts") body = <DemoReceipts data={data} />;
  else if (first === "report") body = <DemoReport data={data} sp={sp} />;
  else body = <DemoAbout path={first === "donations" ? `donations/${second}` : path} />;

  return (
    <DashboardShell id="demo" charity={DEMO_CHARITY} asGivezy={false} base={DEMO_BASE} publicHref={null}>
      <p role="note" className="rounded-card border-2 border-honey bg-honey-soft p-4 text-sm text-navy">
        This is a demonstration with made-up donors and figures. Nothing here is real and nothing you click is saved or sent.
      </p>
      {body}
    </DashboardShell>
  );
}
