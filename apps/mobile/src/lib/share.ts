/**
 * Sharing a charity or a campaign on WhatsApp: a short message with a link to its page on our
 * website (WhatsApp shows the page's photo and name as a preview). No imports on purpose: the
 * website's tests run this file too. Amounts arrive already formatted ("R31 400").
 */

function page(site: string, path: string): string | null {
  if (!site.startsWith("https://")) return null;
  return `${site.replace(/\/+$/, "")}${path}`;
}

export function charityShareText(site: string | undefined, c: { slug: string; nameEn: string }): string | null {
  const url = page(site ?? "", `/c/${encodeURIComponent(c.slug)}`);
  return url ? `I give to ${c.nameEn} on Givezy. Have a look: ${url}` : null;
}

export function campaignShareText(
  site: string | undefined,
  c: { slug: string; nameEn: string },
  campaign: { id: string; title: string; raised: string; target: string | null },
): string | null {
  const url = page(site ?? "", `/c/${encodeURIComponent(c.slug)}/donate?campaign=${encodeURIComponent(campaign.id)}`);
  if (!url) return null;
  const progress = campaign.target ? `${campaign.raised} of ${campaign.target} raised so far.` : `${campaign.raised} raised so far.`;
  return `${c.nameEn} is raising for ${campaign.title}. ${progress} Give here: ${url}`;
}

/** WhatsApp's own share link: opens WhatsApp with the message ready to send to a chat or group. */
export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
