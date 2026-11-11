/**
 * "Raising now" on Home (11/11/2026): the campaigns of the charities a donor gave to or saved, with their live
 * progress, so Home is a feed from their own charities. Real campaigns only: nothing is made up.
 */
import type { Charity } from "../data/sample";
import type { RaisingNow } from "./live-charities";

/** Campaigns still running, newest charity choices first: the ones given to, then the saved ones. At most `max`. */
export function yourCampaigns(directory: Charity[], gaveToSlugs: string[], savedSlugs: string[], max = 4, now: Date = new Date()): RaisingNow[] {
  const order = [...gaveToSlugs, ...savedSlugs.filter((s) => !gaveToSlugs.includes(s))];
  const out: RaisingNow[] = [];
  for (const slug of order) {
    const charity = directory.find((c) => c.slug === slug);
    if (!charity) continue;
    for (const campaign of charity.campaigns ?? []) {
      // A campaign past its end date isn't "raising now".
      if (campaign.endsAt && campaign.endsAt.getTime() < now.getTime()) continue;
      out.push({ campaign, charity });
      if (out.length === max) return out;
    }
  }
  return out;
}

/** A name for the thank-you: the first word of what was typed, trimmed, or null when there is nothing to say. */
export function firstNameOf(typed: string | null | undefined): string | null {
  const w = (typed ?? "").trim().split(/\s+/)[0] ?? "";
  return w && w.length <= 40 ? w : null;
}
