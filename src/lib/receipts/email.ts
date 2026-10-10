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
  const site = args.siteUrl.replace(/\/$/, "");
  // White background, indigo text, the wordmark at the top and one deep-coral button.
  const html = `<div style="background:#ffffff;color:#1f2a5e;font-family:Inter,Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">
<p style="margin:0 0 24px"><img src="${esc(site)}/logo.png" alt="${esc(args.platformName)}" width="150" style="display:block;height:auto;border:0"></p>
<p style="margin:0 0 16px">Dear ${esc(greeting)},</p>
<p style="margin:0 0 16px">Thank you for your donations to <strong>${esc(charity)}</strong>. Your section 18A receipt for ${esc(d.period)} is attached.</p>
<p style="margin:0 0 24px">Receipt number: <strong>${esc(reference)}</strong><br>Total donated: <strong>${esc(formatRand(total))}</strong> (the donations only)</p>
<p style="margin:0 0 24px"><a href="${esc(account)}" style="display:inline-block;background:#c4442f;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:12px">Download it from your account</a></p>
<p style="margin:0;color:#6a6e80;font-size:14px">${esc(args.platformName)}, on behalf of ${esc(charity)}</p>
</div>`;
  return { subject, text, html };
}
