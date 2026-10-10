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
import { formatDate, taxYearFor } from "../src/lib/dates";
import { buildReceiptHtml } from "../src/lib/receipts/html";
import { previewReceipts, runReceiptsJob } from "../src/lib/receipts/issue";
import { htmlToPdf, loadFontCss } from "../src/lib/receipts/pdf";
import { supabaseReceiptStore } from "../src/lib/receipts/store";

async function main() {
  const args = process.argv.slice(2);
  const taxYear = Number(args.find((a) => /^\d{4}$/.test(a)));
  if (!taxYear) throw new Error("Give the tax year, for example: npm run receipts -- 2027");
  const previewDir = args.find((a) => a.startsWith("--preview="))?.slice("--preview=".length);
  const issue = args.includes("--issue");
  const email = args.includes("--email");
  if (email && !issue) throw new Error("--email goes with --issue.");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.");
  const store = supabaseReceiptStore(createClient(url, secret, { auth: { persistSession: false } }));
  const now = new Date();
  const today = formatDate(now).split("/").reverse().join("-");

  if (previewDir) {
    const fontCss = loadFontCss();
    mkdirSync(previewDir, { recursive: true });
    const list = await previewReceipts({ store, taxYear, now });
    for (const r of list) {
      const html = buildReceiptHtml({ details: r.details, reference: r.reference, draft: true, fontCss, platformName: platformConfig.appName });
      writeFileSync(join(previewDir, `${r.reference}.pdf`), await htmlToPdf(html));
    }
    console.log(`Wrote ${list.length} DRAFT receipts to ${previewDir}. Nothing was issued.`);
    return;
  }

  if (issue && !receiptsEnabled()) {
    throw new Error("Receipts are switched off. Set RECEIPTS_ENABLED=yes and RECEIPT_WORDING_CONFIRMED=yes (after the attorney confirms the wording).");
  }
  const fontCss = issue ? loadFontCss() : "";
  const summary = await runReceiptsJob({
    store,
    taxYear,
    today,
    now,
    mode: issue ? "issue" : "dry-run",
    mailer: email ? { transport: getEmailTransport(), siteUrl: process.env.SITE_URL ?? "", platformName: platformConfig.appName } : undefined,
    render: async ({ details, reference }) =>
      htmlToPdf(buildReceiptHtml({ details, reference, fontCss, platformName: platformConfig.appName })),
  });
  console.log(JSON.stringify(summary, null, 2));
  if (!issue) console.log(`This was a dry run. Nothing was written. (Current tax year: ${taxYearFor(now)}.)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
