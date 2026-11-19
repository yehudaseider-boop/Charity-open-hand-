"use server";

import { requirePlatformAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getEmailTransport, maskEmail } from "@/lib/email";
import { SAMPLE, sampleEmails, sampleReceiptDetails } from "@/lib/email/samples";
import type { FormState } from "@/lib/form";
import { buildReceiptHtml } from "@/lib/receipts/html";
import { platformConfig } from "@/config/platform";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends the signed-in Givezy admin one copy of every email (19/11/2026), to their own address only, so each can be
 * read in Gmail, Outlook and on a phone before launch. Sample details only; the s18A receipt PDF is marked as a sample.
 */
export async function sendSampleEmails(): Promise<FormState> {
  const viewer = await requirePlatformAdmin();
  const to = viewer.email;
  if (!to) return { ok: false, message: "Your account has no email address, so there is nowhere to send them." };
  const base = (process.env.SITE_URL ?? "").replace(/\/+$/, "") || "https://test.givezy.co.za";
  const messages = sampleEmails(to, base);

  // The s18A receipt sample carries its PDF, marked so it can never pass for a real receipt.
  try {
    // Loaded only here, like the receipt runs do: the PDF maker needs a browser, and if that fails the emails still go.
    const { htmlToPdf, loadFontCss, loadLogoHtml } = await import("@/lib/receipts/pdf");
    const pdf = await htmlToPdf(buildReceiptHtml({ details: sampleReceiptDetails(), reference: SAMPLE.receiptReference, draft: true, mark: "SAMPLE, NOT A TAX RECEIPT", fontCss: loadFontCss(), platformName: platformConfig.appName, logoHtml: loadLogoHtml() }));
    const receipt = messages.find((m) => m.subject.includes(SAMPLE.receiptReference));
    if (receipt) receipt.attachments = [{ filename: `s18A-receipt-${SAMPLE.receiptReference}.pdf`, content: pdf, contentType: "application/pdf" }];
  } catch (e) {
    console.error("[samples] receipt PDF:", e instanceof Error ? e.message : e);
  }

  const transport = getEmailTransport();
  const receiptHasPdf = messages.some((m) => m.attachments?.length);
  let sent = 0;
  let skipped = 0;
  const failed: string[] = [];
  for (const m of messages) {
    try {
      const outcome = await transport.send(m);
      if (outcome === "sent") sent++;
      else skipped++;
    } catch (e) {
      failed.push(m.subject.replace(/^\[Sample\] /, ""));
      console.error("[samples]", e instanceof Error ? e.message : e);
    }
    // The email service takes a couple a second; slower is kinder.
    await pause(600);
  }
  await logAudit({ actorUserId: viewer.userId, action: "admin.sample_emails_sent", entityType: "user", entityId: viewer.userId, details: { sent, skipped, failed: failed.length } });

  const where = maskEmail(to);
  if (sent === 0 && failed.length === 0) {
    return { ok: false, message: `Nothing was sent to ${where}: email is switched off on this site, or your address isn't on its email allow list. ${skipped} emails were skipped.` };
  }
  const parts = [`Sent ${sent} sample emails to ${where}. They start with "[Sample]".`];
  if (skipped) parts.push(`${skipped} were skipped.`);
  if (!receiptHasPdf) parts.push("The s18A receipt sample went without its PDF: the PDF maker didn't start on this site.");
  if (failed.length) parts.push(`${failed.length} didn't go: ${failed.slice(0, 5).join("; ")}. Press again to try once more (you'll get the others again too).`);
  return { ok: failed.length === 0, message: parts.join(" ") };
}
