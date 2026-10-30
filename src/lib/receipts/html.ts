/**
 * The receipt as a printable web page (A4). It is turned into a PDF by headless Chrome.
 * Layout follows the Givezy look (v2.1): logo top left on white, Bricolage Grotesque for the
 * title and the total, DM Sans for every field, ink text, the receipt number on a pale lilac card.
 * Colours come from brand-colors.ts. The wording and fields come from the charity's
 * advisers (config/receipts.ts), not from the design. English only: no Hebrew names (decided 30/10/2026).
 * Pure: everything it prints comes from the stored snapshot.
 */
import { formatRand } from "@/lib/money";
import { brandColors as colours } from "@/lib/brand-colors";
import type { ReceiptDetails } from "./details";
import { taxYearName } from "@/lib/dates";

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
body { font-family: "DM Sans", Arial, sans-serif; font-size: 10.5pt; line-height: 1.45; color: ${colours.ink}; background: ${colours.surface}; margin: 0; font-variant-numeric: tabular-nums; }
.brand { margin: 0 0 8mm; }
.brand img { height: 10mm; width: auto; display: block; }
.brand .name { font-family: "Bricolage Grotesque", "DM Sans", sans-serif; font-weight: 700; font-size: 16pt; color: ${colours.blue}; }
h1 { font-family: "Bricolage Grotesque", "DM Sans", sans-serif; font-weight: 700; font-size: 22pt; line-height: 1.15; color: ${colours.ink}; margin: 0 0 3mm; }
h2 { font-family: "Bricolage Grotesque", "DM Sans", sans-serif; font-size: 12pt; font-weight: 700; color: ${colours.ink}; margin: 8mm 0 2mm; }
.head { border-bottom: 1px solid ${colours.hairline}; padding-bottom: 5mm; display: flex; justify-content: space-between; align-items: flex-start; gap: 8mm; }
.muted { color: ${colours.muted}; }
.ref { flex: none; min-width: 52mm; background: ${colours.lilacSoft}; border: 1px solid ${colours.hairline}; border-radius: 18px; padding: 4mm 5mm; }
.ref strong { font-family: "Bricolage Grotesque", "DM Sans", sans-serif; font-weight: 700; font-size: 12pt; }
table { width: 100%; border-collapse: collapse; margin-top: 2mm; }
th, td { padding: 2mm 0; border-bottom: 1px solid ${colours.hairlineSoft}; text-align: left; }
th { font-size: 9pt; color: ${colours.muted}; font-weight: 600; }
.r { text-align: right; }
.total td { font-family: "Bricolage Grotesque", "DM Sans", sans-serif; font-weight: 700; font-size: 12pt; border-top: 1.5px solid ${colours.blue}; border-bottom: 0; padding-top: 3mm; }
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
    ${ids.map((x) => `<div class="muted">${x}</div>`).join("")}
    ${d.charity.address.map((x) => `<div class="muted">${esc(x)}</div>`).join("")}
  </div>
  <div class="ref">
    <div class="muted">Receipt number</div><div><strong>${esc(reference)}</strong></div>
    <div class="muted" style="margin-top:2mm">Date issued</div><div>${esc(d.issued_on)}</div>
    <div class="muted" style="margin-top:2mm">Tax year</div><div>${esc(taxYearName(Number(d.tax_year)))} (${esc(d.period)})</div>
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
