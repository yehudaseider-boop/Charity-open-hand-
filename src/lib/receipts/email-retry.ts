import "server-only";
import { platformConfig } from "@/config/platform";
import { getEmailTransport } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildReceiptEmail } from "./email";
import { wasCutOff } from "@/lib/email/retry-plan";
import { supabaseReceiptStore } from "./store";

/**
 * Try an s18A receipt's email again (the daily job, 10/11/2026). The same rules as a receipt run's own emailing:
 * only an issued receipt with its PDF, not yet emailed, every gift on it still paid, and a donor who wasn't
 * erased; the same claim, so a run finishing at the same moment never sends a second copy.
 */
export async function retryReceiptEmail(receiptId: string, signal: AbortSignal): Promise<"sent" | "skipped" | "gone" | "busy"> {
  const db = createAdminClient();
  const { data: row, error } = await db.from("s18a_receipts").select("tax_year, charity_id, status, emailed_at").eq("id", receiptId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row || row.status !== "issued" || row.emailed_at) return "gone";
  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) throw new Error("SITE_URL is not set, so a receipt email can't link to the site");
  const store = supabaseReceiptStore(db);
  // listToEmail applies the rules (PDF made, gifts still paid, donor not erased); a receipt it leaves out has nothing to send.
  const r = (await store.listToEmail(Number(row.tax_year), row.charity_id as string, receiptId)).find((x) => x.id === receiptId);
  if (!r) return "gone";
  if (!(await store.claimEmail(r))) return "busy";
  try {
    const pdf = await store.readPdf(r);
    const mail = buildReceiptEmail({ details: r.details, reference: r.reference, siteUrl, platformName: platformConfig.appName });
    const sent = await getEmailTransport().send({
      to: r.email,
      ...mail,
      attachments: [{ filename: `${r.reference}.pdf`, content: pdf, contentType: "application/pdf" }],
      signal,
    });
    if (sent === "sent") {
      await store.markEmailed(r);
      return "sent";
    }
    await store.releaseEmail(r);
    return "skipped";
  } catch (e) {
    // A send cut off at the time limit, or a dropped connection, may have gone: the claim stays, so nothing sends it
    // again straight away, and the daily job flags it for a person (email.retry_unknown). Only a refusal from the
    // email service (sure not to have gone) frees it for the next try.
    if (!wasCutOff(e)) await store.releaseEmail(r).catch(() => undefined);
    throw e;
  }
}
