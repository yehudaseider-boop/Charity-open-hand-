import { formatRand } from "@/lib/money";
import type { ReceiptDetails } from "./details";
import { esc } from "./html";

/** The email that carries a donor's s18A receipt. The PDF is attached by the sender. */
export function buildReceiptEmail(args: { details: ReceiptDetails; reference: string; siteUrl: string; platformName: string }) {
  const { details: d, reference } = args;
  const total = d.donations.reduce((t, x) => t + x.amount_cents, 0);
  const greeting = d.donor.donor_type === "individual" ? d.donor.name.split(" ")[0] || "there" : d.donor.name || "there";
  const charity = d.charity.legal_name_en;
  const account = `${args.siteUrl.replace(/\/$/, "")}/account`;
  const subject = `Your section 18A receipt ${reference} from ${charity}`;
  const text = [
    `Dear ${greeting},`,
    "",
    `Thank you for your donations to ${charity}. Your section 18A receipt for ${d.period} is attached.`,
    "",
    `Receipt number: ${reference}`,
    `Total donated: ${formatRand(total)} (the donations only)`,
    "",
    `You can also download it any time from your account: ${account}`,
    "",
    `${args.platformName}, on behalf of ${charity}`,
  ].join("\n");
  const html = `<p>Dear ${esc(greeting)},</p>
<p>Thank you for your donations to <strong>${esc(charity)}</strong>. Your section 18A receipt for ${esc(d.period)} is attached.</p>
<p>Receipt number: <strong>${esc(reference)}</strong><br>Total donated: <strong>${esc(formatRand(total))}</strong> (the donations only)</p>
<p>You can also download it any time from <a href="${esc(account)}">your account</a>.</p>
<p>${esc(args.platformName)}, on behalf of ${esc(charity)}</p>`;
  return { subject, text, html };
}
