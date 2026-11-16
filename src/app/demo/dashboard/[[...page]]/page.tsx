import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard-shell";
import { OverviewView } from "@/app/charity-admin/[id]/overview-view";
import { demoData } from "../data";
import { DEMO_BASE, DEMO_CHARITY, demoOverview } from "../sample";
import { DemoAbout, DemoApplicationPage, DemoCampaigns, DemoDeposit, DemoDeposits, DemoDonation, DemoDonations, DemoDonor, DemoDonors, DemoEmailDonorsPage, DemoMonthly, DemoPosterPage, DemoReceipts, DemoRecordGiftPage, DemoReport, DemoThankDonorsPage, DemoWebsiteButtonPage } from "../pages";
import { DemoImport, DemoProfile, DemoTeam, DemoUpdates } from "../charity-tools";
import { DemoReset } from "../reset";

/**
 * Pages the demo leaves out of its menu: they work from a charity's own records over time (who is drifting away,
 * the emails new donors get, who on the team did what), so made-up figures would show nothing true about them.
 */
const DEMO_HIDDEN_TABS = ["/keeping", "/journey", "/activity"];

export const metadata: Metadata = { title: "Charity dashboard demo", robots: { index: false, follow: false } };

/**
 * A public look at the whole charity dashboard, with made-up records: no sign-in and no database. Every page
 * of the menu opens; the pages that send or save things describe what they do.
 */
export default async function DemoDashboard({ params, searchParams }: PageProps<"/demo/dashboard/[[...page]]">) {
  const [{ page = [] }, sp] = await Promise.all([params, searchParams]);
  const now = new Date();
  const data = demoData(now);
  const [first, second, third] = page;
  const site = (process.env.SITE_URL ?? "").replace(/\/+$/, "");
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
  else if (first === "thank-donors" && !second) body = <DemoThankDonorsPage data={data} />;
  else if (first === "email-donors" && !second) body = <DemoEmailDonorsPage data={data} />;
  else if (first === "team" && !second) body = <DemoTeam />;
  else if (first === "profile" && !second) body = <DemoProfile />;
  else if (first === "updates" && !second) body = <DemoUpdates />;
  else if (first === "application" && !second) body = <DemoApplicationPage data={data} />;
  else if (first === "poster" && !second) body = <DemoPosterPage sp={sp} site={site} />;
  else if (first === "website-button" && !second) body = <DemoWebsiteButtonPage data={data} site={site} />;
  else if (first === "donations" && second === "record" && !third) body = <DemoRecordGiftPage data={data} />;
  else if (first === "donations" && second === "import" && !third) body = <DemoImport today={data.today} />;
  else if (first === "donations" && second === "deposits" && !third) body = <DemoDeposits data={data} />;
  else if (first === "donations" && second === "deposits" && third) body = <DemoDeposit data={data} id={third} />;
  else body = <DemoAbout path={first === "donations" ? `donations/${second}` : path} />;

  return (
    <DashboardShell id="demo" charity={DEMO_CHARITY} asGivezy={false} base={DEMO_BASE} publicHref={null} hiddenTabs={DEMO_HIDDEN_TABS}>
      <p role="note" className="rounded-card border-2 border-honey bg-honey-soft p-4 text-sm text-navy">
        This is a demonstration with made-up donors and figures. Nothing here is real, and nothing you do is sent: what you add stays in your own browser. <DemoReset />
      </p>
      {body}
    </DashboardShell>
  );
}
