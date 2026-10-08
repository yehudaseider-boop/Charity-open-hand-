/**
 * The receipt as a printable web page (A4). It is turned into a PDF by
 * headless Chrome, because that handles Hebrew (right to left) correctly.
 * Pure: everything it prints comes from the stored snapshot.
 */
import { formatRand } from "@/lib/money";
import type { ReceiptDetails } from "./details";

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const masked = (last4: string | null) => (last4 ? `•••• ${esc(last4)}` : "");

export function buildReceiptHtml(args: {
  details: ReceiptDetails;
  reference: string;
  /** Preview only: adds a DRAFT mark. Real receipts are never marked. */
  draft?: boolean;
  /** @font-face rules (fonts are embedded, so the PDF looks the same everywhere). */
  fontCss?: string;
  platformName: string;
}): string {
  const { details: d, reference } = args;
  const total = d.donations.reduce((t, x) => t + x.amount_cents, 0);
  const rows = d.donations
    .map((x) => `<tr><td>${esc(x.date)}</td><td class="r">${esc(formatRand(x.amount_cents))}</td></tr>`)
    .join("");
  const ids = [
    d.charity.npo_number ? `NPO number: ${esc(d.charity.npo_number)}` : "",
    d.charity.pbo_number ? `PBO number: ${esc(d.charity.pbo_number)}` : "",
    d.charity.s18a_reference ? `s18A reference: ${esc(d.charity.s18a_reference)}` : "",
  ].filter(Boolean);
  const donorIds = [
    d.donor.registration_number ? `Registration number: ${esc(d.donor.registration_number)}` : "",
    d.donor.id_number_last4 ? `ID number: ${masked(d.donor.id_number_last4)}` : "",
    d.donor.tax_reference_last4 ? `Income tax number: ${masked(d.donor.tax_reference_last4)}` : "",
  ].filter(Boolean);

  return `<!doctype html>
<html lang="en-ZA"><head><meta charset="utf-8"><title>${esc(d.wording.title)} ${esc(reference)}</title>
<style>
${args.fontCss ?? ""}
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
body { font-family: "Noto Sans", "Noto Sans Hebrew", sans-serif; font-size: 10.5pt; line-height: 1.45; color: #1b2b3a; margin: 0; }
h1 { font-size: 20pt; margin: 0 0 2mm; }
h2 { font-size: 10pt; text-transform: uppercase; letter-spacing: .06em; color: #5b6b78; margin: 7mm 0 1.5mm; }
.he { font-family: "Noto Sans Hebrew", "Noto Sans", sans-serif; }
.head { border-bottom: 1px solid #d5e6e3; padding-bottom: 4mm; display: flex; justify-content: space-between; gap: 8mm; }
.muted { color: #5b6b78; }
.ref { text-align: right; }
table { width: 100%; border-collapse: collapse; margin-top: 2mm; }
th, td { padding: 2mm 0; border-bottom: 1px solid #e6efed; text-align: left; }
th { font-size: 9pt; color: #5b6b78; font-weight: 600; }
.r { text-align: right; }
.total td { font-weight: 700; border-top: 1px solid #1b2b3a; border-bottom: 0; }
.statement { margin-top: 7mm; }
.foot { position: fixed; bottom: 0; left: 0; right: 0; font-size: 8.5pt; color: #5b6b78; }
${args.draft ? ".draft { position: fixed; top: 38%; left: 0; right: 0; text-align: center; font-size: 46pt; font-weight: 700; color: rgba(200, 40, 40, .18); transform: rotate(-24deg); }" : ""}
</style></head><body>
${args.draft ? '<div class="draft">DRAFT, NOT A TAX RECEIPT</div>' : ""}
<div class="head">
  <div>
    <h1>${esc(d.wording.title)}</h1>
    <div><strong>${esc(d.charity.legal_name_en)}</strong></div>
    ${d.charity.legal_name_he ? `<div class="he" lang="he" dir="rtl" style="text-align:left">${esc(d.charity.legal_name_he)}</div>` : ""}
    ${ids.map((x) => `<div class="muted">${x}</div>`).join("")}
    ${d.charity.address.map((x) => `<div class="muted">${esc(x)}</div>`).join("")}
  </div>
  <div class="ref">
    <div class="muted">Receipt number</div><div><strong>${esc(reference)}</strong></div>
    <div class="muted" style="margin-top:2mm">Date issued</div><div>${esc(d.issued_on)}</div>
    <div class="muted" style="margin-top:2mm">Tax year</div><div>${esc(String(d.tax_year))} (${esc(d.period)})</div>
  </div>
</div>

<h2>Donor</h2>
<div><strong>${esc(d.donor.name)}</strong></div>
${donorIds.map((x) => `<div class="muted">${x}</div>`).join("")}
${d.donor.address.map((x) => `<div class="muted">${esc(x)}</div>`).join("")}

<h2>Donations received</h2>
<table>
  <thead><tr><th>Date</th><th class="r">Amount</th></tr></thead>
  <tbody>${rows}<tr class="total"><td>Total</td><td class="r">${esc(formatRand(total))}</td></tr></tbody>
</table>

<p class="statement">${esc(d.wording.statement)}</p>
<div class="foot">Issued through ${esc(args.platformName)} on behalf of ${esc(d.charity.legal_name_en)}. Amounts are the donations only, not the processing fee.</div>
</body></html>`;
}
