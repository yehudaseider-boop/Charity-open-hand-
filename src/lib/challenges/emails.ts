/** Emails about group challenges. DRAFT WORDING for Yehuda to approve before go-live. Pure builders. */
import type { EmailMessage } from "@/lib/email";

const site = (env: Record<string, string | undefined> = process.env) => (env.SITE_URL ?? "").replace(/\/+$/, "");

/** To the person who started a challenge, when the charity stops it. */
export function challengeStoppedEmail(to: string, d: { charityName: string; charitySlug: string; title: string }, base = site()): EmailMessage {
  return {
    to,
    subject: `Your challenge "${d.title}" has been stopped`,
    text: [
      `${d.charityName} has stopped your challenge "${d.title}" on Givezy, so it no longer takes new gifts.`,
      "",
      `Everything given to it so far stays with ${d.charityName}. Thank you for getting people behind them.`,
      "",
      `You can still give to ${d.charityName}, or share their page: ${base}/c/${d.charitySlug}`,
      "",
      "The Givezy team",
    ].join("\n"),
  };
}
