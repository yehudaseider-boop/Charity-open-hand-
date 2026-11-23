import { Tabs } from "@/components/dash";
import { hiddenPages } from "@/lib/charity/permissions";
import { donorJourneyTabItems, type DonorJourneyPage } from "@/lib/charity/donor-journey-tabs";
import { viewerRole } from "@/lib/charity/team";

/** The tab row at the top of each "Donor journeys" page. Not shown when only one of the pages is open to this person. */
export function DonorJourneyTabsView({ base, current, hidden }: { base: string; current: DonorJourneyPage; hidden: readonly string[] }) {
  const items = donorJourneyTabItems(base, current, hidden);
  return items.length > 1 ? <Tabs label="Donor journeys" items={items} /> : null;
}

/** The tab row for a real charity's page: the pages hidden from this person's role, as in the menu. */
export async function DonorJourneyTabs({ id, current }: { id: string; current: DonorJourneyPage }) {
  const hidden = hiddenPages(await viewerRole(id));
  return <DonorJourneyTabsView base={`/charity-admin/${id}`} current={current} hidden={hidden} />;
}
