/**
 * The receipt as a printable web page (A4). It is turned into a PDF by headless Chrome.
 * Two pages, shaped like the s18A certificates charities issue themselves (an example was shared by Yehuda,
 * 30/10/2026): the certificate, with labelled fields and the amount in words, then a summary of every
 * donation with its reference, date and nature. In the Givezy look (v2.1): Bricolage Grotesque for the
 * title and amounts, DM Sans for the fields, labels in blue, the receipt number on a pale lilac card.
 * Colours come from brand-colors.ts. The wording and fields come from the charity's
 * advisers (config/receipts.ts), not from the design. English only: no Hebrew names (decided 30/10/2026).
 * Pure: everything it prints comes from the stored snapshot.
 */
import { formatRand } from "@/lib/money";
import { brandColors as colours } from "@/lib/brand-colors";
import type { ReceiptDetails } from "./details";
import { taxYearName } from "@/lib/dates";
import { randInWords } from "./words";

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
  const count = d.donations.length;
  // Page 2, the donation summary: one row per gift. Receipts issued before 30/10/2026 have no reference or nature.
  const rows = d.donations
    .map(
      (x) =>
        `<tr><td>${esc(x.reference ?? "")}</td><td>${esc(x.date)}</td><td>${esc(x.nature ?? "")}</td><td class="r">${esc(formatRand(x.amount_cents))}</td></tr>`,
    )
    .join("");
  const natures = [...new Set(d.donations.map((x) => x.nature).filter((n): n is string => Boolean(n)))];
  const first = d.donations[0]?.date ?? "";
  const last = d.donations[count - 1]?.date ?? "";
  const dates = first === last ? first : `${first} to ${last}`;
  const ids = [
    d.charity.npo_number ? `NPO number ${esc(d.charity.npo_number)}` : "",
    d.charity.pbo_number ? `PBO number ${esc(d.charity.pbo_number)}` : "",
    d.charity.s18a_reference ? `s18A reference ${esc(d.charity.s18a_reference)}` : "",
  ].filter(Boolean);
  const kind = d.donor.donor_type === "individual" ? "Individual" : d.donor.donor_type === "company" ? "Company" : "Trust";
  const field = (label: string, value: string) => (value ? `<div class="f"><dt>${label}</dt><dd>${value}</dd></div>` : "");
  const brand = `<div class="brand">${args.logoHtml ?? `<span class="name">${esc(args.platformName)}</span>`}</div>`;
  const foot = `<div class="foot">Issued through ${esc(args.platformName)} on behalf of ${esc(d.charity.legal_name_en)}${d.charity.pbo_number ? `, PBO number ${esc(d.charity.pbo_number)}` : ""}. Amounts are the donations only.</div>`;

  return `<!doctype html>
<html lang="en-ZA"><head><meta charset="utf-8"><title>${esc(d.wording.title)} ${esc(reference)}</title>
<style>
${args.fontCss ?? ""}
@page { size: A4; margin: 16mm 16mm 20mm; }
* { box-sizing: border-box; }
body { font-family: "DM Sans", Arial, sans-serif; font-size: 10.5pt; line-height: 1.45; color: ${colours.ink}; background: ${colours.surface}; margin: 0; font-variant-numeric: tabular-nums; }
.page { position: relative; }
.page + .page { break-before: page; }
.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8mm; margin-bottom: 7mm; }
.brand img { height: 10mm; width: auto; display: block; }
.brand .name { font-family: "Bricolage Grotesque", "DM Sans", sans-serif; font-weight: 700; font-size: 16pt; color: ${colours.blue}; }
.no { background: ${colours.lilacSoft}; border: 1px solid ${colours.hairline}; border-radius: 14px; padding: 2.5mm 4.5mm; text-align: right; }
.no .l { font-size: 8.5pt; color: ${colours.muted}; }
.no strong { font-family: "Bricolage Grotesque", "DM Sans", sans-serif; font-weight: 700; font-size: 12pt; }
h1 { font-family: "Bricolage Grotesque", "DM Sans", sans-serif; font-weight: 700; font-size: 24pt; line-height: 1.1; color: ${colours.ink}; margin: 0 0 2mm; }
h1 .accent { color: ${colours.blue}; }
.charity { border-bottom: 1px solid ${colours.hairline}; padding-bottom: 5mm; margin-bottom: 5mm; }
.charity strong { font-size: 11.5pt; }
.muted { color: ${colours.muted}; }
dl { margin: 0; }
.f { display: grid; grid-template-columns: 52mm 1fr; gap: 4mm; padding: 2.4mm 0; border-bottom: 1px solid ${colours.hairlineSoft}; }
.f dt { color: ${colours.blue}; font-weight: 600; }
.f dd { margin: 0; }
.amount { font-family: "Bricolage Grotesque", "DM Sans", sans-serif; font-weight: 700; font-size: 15pt; }
.words { color: ${colours.muted}; font-size: 9.5pt; }
.statement { margin-top: 6mm; background: ${colours.lilacSoft}; border-radius: 14px; padding: 4mm 5mm; }
h2 { font-family: "Bricolage Grotesque", "DM Sans", sans-serif; font-size: 18pt; font-weight: 700; color: ${colours.ink}; margin: 0 0 1.5mm; }
.sub { color: ${colours.muted}; margin: 0 0 5mm; }
.meta { display: grid; grid-template-columns: auto 1fr; gap: 1mm 5mm; margin-bottom: 5mm; }
.meta b { font-weight: 600; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 2.2mm 2.5mm; border-bottom: 1px solid ${colours.hairlineSoft}; text-align: left; }
thead th { font-size: 9pt; color: ${colours.muted}; font-weight: 600; background: ${colours.lilacSoft}; border-bottom: 1.5px solid ${colours.blue}; }
.r { text-align: right; }
.total td { font-family: "Bricolage Grotesque", "DM Sans", sans-serif; font-weight: 700; font-size: 11.5pt; border-top: 1.5px solid ${colours.blue}; border-bottom: 0; padding-top: 3mm; }
.foot { margin-top: 8mm; padding-top: 3mm; border-top: 1px solid ${colours.hairline}; font-size: 8.5pt; color: ${colours.muted}; }
${args.draft ? `.draft { position: fixed; top: 38%; left: 0; right: 0; text-align: center; font-size: 46pt; font-weight: 600; color: ${colours.danger}2E; transform: rotate(-24deg); }` : ""}
</style></head><body>
${args.draft ? '<div class="draft">DRAFT, NOT A TAX RECEIPT</div>' : ""}
<section class="page">
  <div class="top">${brand}<div class="no"><div class="l">Receipt number</div><strong>${esc(reference)}</strong></div></div>
  <h1>${esc(d.wording.title)}</h1>
  <div class="charity">
    <div><strong>${esc(d.charity.legal_name_en)}</strong></div>
    ${ids.length ? `<div class="muted">${ids.join(" · ")}</div>` : ""}
    ${d.charity.address.length ? `<div class="muted">${d.charity.address.map(esc).join(", ")}</div>` : ""}
  </div>
  <dl>
    ${field(`Donor (${kind})`, `<strong>${esc(d.donor.name)}</strong>`)}
    ${field("Registration number", d.donor.registration_number ? esc(d.donor.registration_number) : "")}
    ${field("South African ID number", masked(d.donor.id_number_last4))}
    ${field("Income tax number", masked(d.donor.tax_reference_last4))}
    ${field("Donor address", d.donor.address.map(esc).join(", "))}
    ${field(count === 1 ? "Date of donation" : "Dates of donations", esc(dates))}
    ${field("Nature of donation", esc(natures.join(", ")))}
    ${field("Number of donations", count > 1 ? `${count}, listed on the next page` : "")}
    ${field("Donation amount", `<div class="amount">${esc(formatRand(total))}</div><div class="words">${esc(randInWords(total))}</div>`)}
    ${field("Tax year", `${esc(taxYearName(Number(d.tax_year)))} (${esc(d.period)})`)}
    ${field("Date issued", esc(d.issued_on))}
  </dl>
  <p class="statement">${esc(d.wording.statement)}</p>
  ${foot}
</section>
<section class="page">
  <div class="top">${brand}<div class="no"><div class="l">Receipt number</div><strong>${esc(reference)}</strong></div></div>
  <h2>Donation summary</h2>
  <p class="sub">Every donation on ${esc(d.wording.title.charAt(0).toLowerCase() + d.wording.title.slice(1))} ${esc(reference)}.</p>
  <div class="meta">
    <b>Donor</b><span>${esc(d.donor.name)}</span>
    <b>Charity</b><span>${esc(d.charity.legal_name_en)}</span>
    <b>Tax year</b><span>${esc(taxYearName(Number(d.tax_year)))} (${esc(d.period)})</span>
  </div>
  <table>
    <thead><tr><th>Reference</th><th>Date received</th><th>Nature of donation</th><th class="r">Amount</th></tr></thead>
    <tbody>${rows}<tr class="total"><td colspan="3">Total (${count} ${count === 1 ? "donation" : "donations"})</td><td class="r">${esc(formatRand(total))}</td></tr></tbody>
  </table>
  ${foot}
</section>
</body></html>`;
}
