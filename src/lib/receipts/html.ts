/**
 * The receipt as a printable web page (A4). It is turned into a PDF by
 * headless Chrome, because that handles Hebrew (right to left) correctly.
 * Layout follows the Givezy look: logo top left on white, Fredoka for the
 * title, Inter for every field. Colours come from brand-colors.ts. The wording and fields come from the charity's
 * advisers (config/receipts.ts), not from the design.
 * Pure: everything it prints comes from the stored snapshot.
 */
import { formatRand } from "@/lib/money";
import { brandColors as colours } from "@/lib/brand-colors";
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
  /** The logo as HTML (top left). Without it the platform name is printed as text. */
  logoHtml?: string;
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
body { font-family: "Inter", "Heebo", sans-serif; font-size: 10.5pt; line-height: 1.45; color: ${colours.ink}; background: ${colours.surface}; margin: 0; font-variant-numeric: tabular-nums; }
.brand { margin: 0 0 8mm; }
.brand img { height: 10mm; width: auto; display: block; }
.brand .name { font-weight: 600; font-size: 14pt; color: ${colours.blue}; }
h1 { font-family: "Fredoka", "Inter", sans-serif; font-weight: 600; font-size: 22pt; color: ${colours.blue}; margin: 0 0 2mm; }
h2 { font-size: 10.5pt; font-weight: 600; color: ${colours.blue}; margin: 7mm 0 1.5mm; }
.he { font-family: "Heebo", "Inter", sans-serif; }
.head { border-bottom: 1px solid ${colours.hairline}; padding-bottom: 4mm; display: flex; justify-content: space-between; gap: 8mm; }
.muted { color: ${colours.muted}; }
.ref { text-align: right; }
table { width: 100%; border-collapse: collapse; margin-top: 2mm; }
th, td { padding: 2mm 0; border-bottom: 1px solid ${colours.hairlineSoft}; text-align: left; }
th { font-size: 9pt; color: ${colours.muted}; font-weight: 600; }
.r { text-align: right; }
.total td { font-weight: 600; border-top: 1px solid ${colours.blue}; border-bottom: 0; }
.statement { margin-top: 7mm; }
.foot { position: fixed; bottom: 0; left: 0; right: 0; font-size: 8.5pt; color: ${colours.muted}; }
${args.draft ? `.draft { position: fixed; top: 38%; left: 0; right: 0; text-align: center; font-size: 46pt; font-weight: 600; color: ${colours.danger}2E; transform: rotate(-24deg); }` : ""}
</style></head><body>
${args.draft ? '<div class="draft">DRAFT, NOT A TAX RECEIPT</div>' : ""}
<div class="brand">${args.logoHtml ?? `<span class="name">${esc(args.platformName)}</span>`}</div>
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
<div class="foot">Issued through ${esc(args.platformName)} on behalf of ${esc(d.charity.legal_name_en)}. Amounts are the donations only.</div>
</body></html>`;
}
