/**
 * The yearly s18A receipts job, for a person at a terminal. Receipts themselves are issued from the
 * website (21/10/2026): each charity approves its list on its receipts page, then Givezy signs it off
 * in Admin, s18A receipts. This script never issues a receipt nobody approved.
 *
 *   npm run receipts -- 2027                    what would be issued (nothing is written)
 *   npm run receipts -- 2027 --preview=./out    DRAFT PDFs of those receipts, to check the layout
 *   npm run receipts -- 2027 --finish           make missing PDFs for receipts already issued
 *   npm run receipts -- 2027 --finish --email   ...and email each donor any receipt not yet sent
 *
 * --finish only works when RECEIPTS_ENABLED=yes and RECEIPT_WORDING_CONFIRMED=yes are set (the
 * attorney must confirm the wording first). Making PDFs needs CHROME_PATH (see .env.example).
 * --email uses EMAIL_TRANSPORT ("console" only logs; "resend" really sends).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getEmailTransport } from "../src/lib/email";
import { platformConfig } from "../src/config/platform";
import { receiptsEnabled } from "../src/config/receipts";
import { formatDate, taxYearFor } from "../src/lib/dates";
import { buildReceiptHtml } from "../src/lib/receipts/html";
import { previewReceipts, runReceiptsJob } from "../src/lib/receipts/issue";
import { htmlToPdf, loadFontCss, loadLogoHtml } from "../src/lib/receipts/pdf";
import { supabaseReceiptStore } from "../src/lib/receipts/store";

async function main() {
  const args = process.argv.slice(2);
  const taxYear = Number(args.find((a) => /^\d{4}$/.test(a)));
  if (!taxYear) throw new Error("Give the tax year, for example: npm run receipts -- 2027");
  const previewDir = args.find((a) => a.startsWith("--preview="))?.slice("--preview=".length);
  if (args.includes("--issue")) throw new Error("Receipts are issued from the website now: the charity approves its list, then Givezy signs it off in Admin, s18A receipts. Use --finish here for missing PDFs or emails.");
  const issue = args.includes("--finish");
  const email = args.includes("--email");
  if (email && !issue) throw new Error("--email goes with --finish.");
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
  const fontCss = issue ? loadFontCss() : "";
  const logoHtml = issue ? loadLogoHtml() : undefined;
  const summary = await runReceiptsJob({
    store,
    taxYear,
    today,
    now,
    mode: issue ? "finish" : "dry-run",
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
