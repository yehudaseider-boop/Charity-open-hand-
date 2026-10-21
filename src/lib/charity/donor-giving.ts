/**
 * A donor's giving to one charity, summed from their paid gifts: the largest gift, and how much went
 * to each campaign and came in each way. Pure (tested). Whole cents only.
 */
import { giftSourceLabel } from "@/lib/donations/source";

export type DonorGift = { id: string; amount_cents: number; paid_at: string | null; campaign_id: string | null; came_from: string | null };
export type GivingLine = { key: string; label: string; cents: number; count: number };

export function donorGiving(gifts: DonorGift[], campaignTitles: Map<string, string>) {
  let largest: DonorGift | null = null;
  const byCampaign = new Map<string, GivingLine>();
  const bySource = new Map<string, GivingLine>();
  const add = (m: Map<string, GivingLine>, key: string, label: string, cents: number) => {
    const line = m.get(key) ?? { key, label, cents: 0, count: 0 };
    line.cents += cents;
    line.count += 1;
    m.set(key, line);
  };
  for (const g of gifts) {
    // The first of two equal gifts is the largest: the earlier one, as the list comes oldest first.
    if (!largest || g.amount_cents > largest.amount_cents) largest = g;
    const camp = g.campaign_id ?? "none";
    add(byCampaign, camp, g.campaign_id ? campaignTitles.get(g.campaign_id) ?? "A campaign" : "No campaign", g.amount_cents);
    add(bySource, g.came_from ?? "unknown", giftSourceLabel(g.came_from), g.amount_cents);
  }
  const sorted = (m: Map<string, GivingLine>) => [...m.values()].sort((a, b) => b.cents - a.cents || a.label.localeCompare(b.label));
  return { largest, byCampaign: sorted(byCampaign), bySource: sorted(bySource) };
}
