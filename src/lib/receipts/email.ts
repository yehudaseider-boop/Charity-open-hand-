import { formatRand } from "@/lib/money";
import type { ReceiptDetails } from "./details";
import { esc } from "./html";
import { brandColors as colours } from "@/lib/brand-colors";

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
  const site = args.siteUrl.replace(/\/$/, "");
  // White background, navy text, the Givezy logo at the top and one blue pill button (colours from brand-colors.ts).
  const html = `<div style="background:${colours.surface};color:${colours.ink};font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">
<p style="margin:0 0 24px"><img src="${esc(site)}/logo.png" alt="${esc(args.platformName)}" width="150" style="display:block;height:auto;border:0"></p>
<p style="margin:0 0 16px">Dear ${esc(greeting)},</p>
<p style="margin:0 0 16px">Thank you for your donations to <strong>${esc(charity)}</strong>. Your s18A receipt for ${esc(d.period)} is attached.</p>
<p style="margin:0 0 24px">Receipt number: <strong>${esc(reference)}</strong><br>Total donated: <strong>${esc(formatRand(total))}</strong> (the donations only)</p>
<p style="margin:0 0 24px"><a href="${esc(account)}" style="display:inline-block;background:${colours.blue};color:${colours.surface};text-decoration:none;font-weight:600;padding:12px 24px;border-radius:999px">Download it from your account</a></p>
<p style="margin:0;color:${colours.muted};font-size:14px">${esc(args.platformName)}, on behalf of ${esc(charity)}</p>
</div>`;
  return { subject, text, html };
}
