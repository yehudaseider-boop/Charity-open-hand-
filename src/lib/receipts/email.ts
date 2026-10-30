import { formatRand } from "@/lib/money";
import type { ReceiptDetails } from "./details";
import { buttonHtml, cardHtml, emailLayout, escHtml, paragraphHtml } from "@/lib/email/html";

/** The email that carries a donor's s18A receipt. The PDF is attached by the sender. */
export function buildReceiptEmail(args: { details: ReceiptDetails; reference: string; siteUrl: string; platformName: string }) {
  const { details: d, reference } = args;
  const total = d.donations.reduce((t, x) => t + x.amount_cents, 0);
  const greeting = d.donor.donor_type === "individual" ? d.donor.name.split(" ")[0] || "there" : d.donor.name || "there";
  const charity = d.charity.legal_name_en;
  const account = `${args.siteUrl.replace(/\/$/, "")}/account`;
  const subject = `Your s18A receipt ${reference} from ${charity}`;
  const text = [
    `Dear ${greeting},`,
    "",
    `Thank you for your donations to ${charity}. Your s18A receipt for ${d.period} is attached.`,
    "",
    `Receipt number: ${reference}`,
    `Total donated: ${formatRand(total)} (the donations only)`,
    "",
    `You can also download it any time from your account: ${account}`,
    "",
    `${args.platformName}, on behalf of ${charity}`,
  ].join("\n");
  // The Givezy email look (src/lib/email/html.ts): the logo, a headline, the receipt number and total on a
  // pale lilac card, one blue button. Same words as the text version.
  const html = emailLayout({
    title: subject,
    siteUrl: args.siteUrl,
    bodyHtml: [
      paragraphHtml(`Dear ${escHtml(greeting)},`),
      paragraphHtml(`Thank you for your donations to <strong>${escHtml(charity)}</strong>. Your s18A receipt for ${escHtml(d.period)} is attached.`),
      cardHtml([{ label: "Receipt number", value: reference }, { label: "Total donated", value: `${formatRand(total)} (the donations only)` }]),
      buttonHtml("Download it from your account", account),
      paragraphHtml(`${escHtml(args.platformName)}, on behalf of ${escHtml(charity)}`, { muted: true }),
    ].join("\n"),
  });
  return { subject, text, html };
}
