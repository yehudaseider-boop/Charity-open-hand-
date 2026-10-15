/**
 * The yearly s18A receipts job. Run by a person, not from the website.
 *
 *   npm run receipts -- 2027                   what would be issued (nothing is written)
 *   npm run receipts -- 2027 --preview=./out   DRAFT PDFs of those receipts, to check the layout
 *   npm run receipts -- 2027 --issue           issue the receipts and make their PDFs
 *   npm run receipts -- 2027 --issue --email   ...and email each donor their receipt (also emails any not yet sent)
 *
 * --issue only works when RECEIPTS_ENABLED=yes and RECEIPT_WORDING_CONFIRMED=yes
 * are set (the attorney must confirm the wording first), and only after the
 * tax year has closed. Making PDFs needs CHROME_PATH (see .env.example).
 * --email uses EMAIL_TRANSPORT ("console" only logs; "resend" really sends).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getEmailTransport } from "../src/lib/email";
import { platformConfig } from "../src/config/platform";
import { receiptsEnabled } from "../src/config/receipts";
import { formatDate, taxYearFor, taxYearRange } from "../src/lib/dates";
import { buildReceiptHtml } from "../src/lib/receipts/html";
import { previewReceipts, runReceiptsJob } from "../src/lib/receipts/issue";
import { htmlToPdf, loadFontCss, loadLogoHtml } from "../src/lib/receipts/pdf";
import { supabaseReceiptStore } from "../src/lib/receipts/store";

async function main() {
  const args = process.argv.slice(2);
  const taxYear = Number(args.find((a) => /^\d{4}$/.test(a)));
  if (!taxYear) throw new Error("Give the tax year, for example: npm run receipts -- 2027");
  const previewDir = args.find((a) => a.startsWith("--preview="))?.slice("--preview=".length);
  const issue = args.includes("--issue");
  const email = args.includes("--email");
  if (email && !issue) throw new Error("--email goes with --issue.");
  // Receipt emails link to the site and show its logo: without the address those links would be broken.
  if (email && !process.env.SITE_URL) throw new Error("Set SITE_URL (the website's address) before emailing receipts.");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.");
  const store = supabaseReceiptStore(createClient(url, secret, { auth: { persistSession: false } }));
  const now = new Date();
  const today = formatDate(now).split("/").reverse().join("-");

  if (previewDir) {
    const fontCss = loadFontCss();
    const logoHtml = loadLogoHtml();
    mkdirSync(previewDir, { recursive: true });
    const list = await previewReceipts({ store, taxYear, now });
    for (const r of list) {
      const html = buildReceiptHtml({ details: r.details, reference: r.reference, draft: true, fontCss, platformName: platformConfig.appName, logoHtml });
      writeFileSync(join(previewDir, `${r.reference}.pdf`), await htmlToPdf(html));
    }
    console.log(`Wrote ${list.length} DRAFT receipts to ${previewDir}. Nothing was issued.`);
    return;
  }

  if (issue && !receiptsEnabled()) {
    throw new Error("Receipts are switched off. Set RECEIPTS_ENABLED=yes and RECEIPT_WORDING_CONFIRMED=yes (after the attorney confirms the wording).");
  }
  // A payment from the last days of the tax year still waiting for the gateway could be confirmed after its
  // receipt is issued, and then need a withdraw and re-issue. (Abandoned checkouts also stay "pending", so
  // this warns rather than blocks: check them in Admin, Payments first.)
  if (issue) {
    const { end } = taxYearRange(taxYear);
    const lastDays = new Date(Date.parse(`${end}T00:00:00+02:00`) - 3 * 86_400_000).toISOString();
    const { count, error } = await createClient(url, secret, { auth: { persistSession: false } })
      .from("donations")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .eq("wants_18a", true)
      .gte("created_at", lastDays)
      .lte("created_at", `${end}T23:59:59+02:00`);
    if (error) throw new Error(`Could not check for pending payments: ${error.message}`);
    if (count) {
      console.warn(`WARNING: ${count} s18A payment(s) from the last days of tax year ${taxYear} are still pending. If any is confirmed later it will need its donor's receipt withdrawn and issued again.`);
    }
  }
  const fontCss = issue ? loadFontCss() : "";
  const logoHtml = issue ? loadLogoHtml() : undefined;
  const summary = await runReceiptsJob({
    store,
    taxYear,
    today,
    now,
    mode: issue ? "issue" : "dry-run",
    mailer: email ? { transport: getEmailTransport(), siteUrl: process.env.SITE_URL ?? "", platformName: platformConfig.appName } : undefined,
    render: async ({ details, reference }) =>
      htmlToPdf(buildReceiptHtml({ details, reference, fontCss, platformName: platformConfig.appName, logoHtml })),
  });
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed.length) {
    console.error(`${summary.failed.length} step(s) failed (see "failed" above). Everything else was done. Fix the cause and run the job again.`);
    process.exitCode = 1;
  }
  if (!issue) console.log(`This was a dry run. Nothing was written. (Current tax year: ${taxYearFor(now)}.)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
