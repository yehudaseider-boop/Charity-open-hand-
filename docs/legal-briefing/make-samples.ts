/**
 * Generates the worked example, the sample s18A receipt (HTML) and the sample IT3(d) file for the briefing,
 * by calling the real builders with fictional data. Run from the repo root:
 *   npx tsx docs/legal-briefing/make-samples.ts
 * Writes docs/legal-briefing/samples/*.  Nothing here touches a database or a remote service.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { platformConfig } from "@/config/platform";
import { priceDonation } from "@/lib/fees";
import { cardChargeRates } from "@/lib/donations/card-charge";
import { formatRand } from "@/lib/money";
import { buildReceiptDetails } from "@/lib/receipts/details";
import { buildReceiptHtml } from "@/lib/receipts/html";
import { loadFontCss, loadLogoHtml } from "@/lib/receipts/pdf";
import { buildIt3d, it3dBytes, type It3dInput } from "@/lib/receipts/it3d";
import { passesSaIdCheck } from "@/lib/sars-numbers";
import { isValidSaIdNumber } from "@/lib/sa-id";

const out = join(process.cwd(), "docs", "legal-briefing", "samples");
mkdirSync(out, { recursive: true });

// 1. Worked example: a R500 once-off gift, with and without a contribution.
const minimums = {
  minDonationCents: platformConfig.minDonationCents,
  minContributionCents: platformConfig.minContributionCents,
  maxDonationCents: platformConfig.maxDonationCents,
};
const rates = cardChargeRates();
const a = priceDonation(50_000, 0, minimums, rates);
const b = priceDonation(50_000, 5_000, minimums, rates);
let tooLow = "";
try { priceDonation(50_000, 500, minimums); } catch (e) { tooLow = (e as Error).message; }
writeFileSync(join(out, "worked-example.json"), JSON.stringify({
  cardChargeRates: rates,
  noContribution: { ...a, shown: Object.fromEntries(Object.entries(a).map(([k, v]) => [k, formatRand(v)])) },
  withContribution: { ...b, shown: Object.fromEntries(Object.entries(b).map(([k, v]) => [k, formatRand(v)])) },
  contributionBelowMinimum: tooLow,
  config: { minDonation: formatRand(platformConfig.minDonationCents), minContribution: formatRand(platformConfig.minContributionCents), maxDonation: formatRand(platformConfig.maxDonationCents), vat: platformConfig.vat, fees: platformConfig.fees },
}, null, 2));

// 2. A made-up SA ID that passes the check digit (born 15/06/1985, female, citizen): built, then checked by both validators.
function makeId(yymmdd: string, seq: string): string {
  const base = `${yymmdd}${seq}08`;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    let d = Number(base[i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return base + String((10 - (sum % 10)) % 10);
}
const sampleId = makeId("850615", "0123");
if (!isValidSaIdNumber(sampleId) || !passesSaIdCheck(sampleId)) throw new Error("sample ID does not validate");
writeFileSync(join(out, "sample-id-check.txt"), `${sampleId.slice(0, 6)}******${sampleId.slice(-1)} passes sa-id.ts and Appendix J\n`);

// 3. Sample receipt, built by the real builder.
const details = buildReceiptDetails({
  charity: {
    legal_name_en: "Sample Charity Trust (fictional)",
    npo_number: null,
    pbo_number: "SAMPLE-PBO-000",
    s18a_reference: "SAMPLE-18A-000",
    address_line1: "1 Example Street",
    address_line2: null,
    suburb: "Sampleton",
    city: "Johannesburg",
    postal_code: "2000",
    quickgive_code: "SAMPLE",
  },
  donor: {
    donor_type: "individual",
    first_name: "Sample",
    last_name: "Donor",
    organisation_name: null,
    registration_number: null,
    address_line1: "2 Example Road",
    address_line2: null,
    suburb: "Sampleton",
    city: "Johannesburg",
    postal_code: "2000",
    id_number_last4: sampleId.slice(-4),
    tax_reference_last4: null,
  },
  donations: [
    { paidAt: "2025-06-14T08:00:00Z", amountCents: 50_000, id: "11111111-aaaa-4aaa-8aaa-000000000001", recordedMethod: null },
    { paidAt: "2025-11-20T08:00:00Z", amountCents: 123_457, id: "22222222-bbbb-4bbb-8bbb-000000000002", recordedMethod: null },
    { paidAt: "2026-02-10T08:00:00Z", amountCents: 30_000, id: "33333333-cccc-4ccc-8ccc-000000000003", recordedMethod: "eft" },
  ],
  taxYear: 2026,
  periodStart: "2025-03-01",
  periodEnd: "2026-02-28",
  issuedAt: new Date("2026-03-05T08:00:00Z"),
});
const html = buildReceiptHtml({ details, reference: "SAMPLE-2026-0001", fontCss: loadFontCss(), platformName: "Givezy", logoHtml: loadLogoHtml() });
writeFileSync(join(out, "sample-receipt.html"), html);
writeFileSync(join(out, "sample-receipt-details.json"), JSON.stringify(details, null, 2));

// 4. Sample IT3(d) file: two donors, three donations, a fictional charity.
const gift = (id: string, paidAt: string, amountCents: number) => ({ id, paidAt, amountCents, recordedMethod: null });
const input: It3dInput = {
  taxYear: 2026,
  period: "full_year",
  now: new Date("2026-05-10T07:30:00Z"),
  testData: true,
  sourceIdentifier: "SAMPLE-SOURCE-IDENTIFIER".padEnd(144, "X"),
  sourceSystemVersion: "sample",
  uniqueFileId: "00000000-0000-4000-8000-000000000000",
  charity: {
    id: "99999999-9999-4999-8999-999999999999",
    legalName: "Sample Charity Trust (fictional)",
    tradingName: "Sample Charity",
    legalForm: "OTHER_CO",
    registrationNumber: "2010/123456/08",
    taxReference: "0001339050",
    pboNumber: "930000000",
    address: { line1: "1 Example Street", line2: null, suburb: "Sampleton", city: "Johannesburg", postalCode: "2000" },
    contactName: "Sample Contact",
    contactPhone: "0110000000",
    contactEmail: "contact@example.org.za",
  },
  receipts: [
    {
      receiptId: "r1", receiptNumber: "SAMPLE-2026-0001", donorKey: "aaaa1111",
      donor: { type: "individual", firstName: "Sample", lastName: "Donor", organisationName: null, registrationNumber: null, idNumber: sampleId, taxReference: null, phone: "0820000001", email: "donor1@example.co.za", address: { line1: "2 Example Road", line2: null, suburb: "Sampleton", city: "Johannesburg", postalCode: "2000" }, erased: false },
      donations: [gift("11111111-aaaa-4aaa-8aaa-000000000001", "2025-06-14T08:00:00Z", 50_000), gift("22222222-bbbb-4bbb-8bbb-000000000002", "2025-11-20T08:00:00Z", 123_457)],
    },
    {
      receiptId: "r2", receiptNumber: "SAMPLE-2026-0002", donorKey: "bbbb2222",
      donor: { type: "individual", firstName: "Another Sample", lastName: "Giver", organisationName: null, registrationNumber: null, idNumber: makeId("720301", "5000"), taxReference: null, phone: null, email: null, address: { line1: "3 Example Lane", line2: null, suburb: "Sampleton", city: "Cape Town", postalCode: "8000" }, erased: false },
      donations: [gift("33333333-cccc-4ccc-8ccc-000000000003", "2026-02-10T08:00:00Z", 30_000)],
    },
  ],
};
const r = buildIt3d(input);
writeFileSync(join(out, "sample-it3d.psv"), it3dBytes(r.lines));
writeFileSync(join(out, "sample-it3d-result.json"), JSON.stringify({ fileName: r.fileName, problems: r.problems, totals: r.totals, fileReady: r.fileReady, fieldCounts: r.lines.map((l) => [l.split("|")[0], l.split("|").length]) }, null, 2));
console.log("fileReady", r.fileReady, "problems", r.problems.length, r.totals);
console.log(r.problems);
