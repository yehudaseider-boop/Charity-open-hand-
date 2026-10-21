import "server-only";
import { createHash } from "node:crypto";
import { platformConfig } from "@/config/platform";
import { receiptsEnabled } from "@/config/receipts";
import { logAudit } from "@/lib/audit";
import { formatDate, taxYearFor, taxYearRange } from "@/lib/dates";
import { getEmailTransport } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildReceiptHtml } from "./html";
import { receiptDonorName } from "./details";
import { runReceiptsJob, type JobSummary } from "./issue";
import { planReceipts, type PlannedReceipt } from "./plan";
import { supabaseReceiptStore } from "./store";

/**
 * The yearly receipt run with two approvals (21/10/2026, Yehuda): the charity checks its list and
 * approves it, then Givezy signs off and the receipts are issued and emailed. Every function here is
 * called after the caller checked who the person is (loadCharityForManager or requirePlatformAdmin).
 */

export type RunStatus = "charity_approved" | "issuing" | "done" | "cancelled";
export type ReceiptRun = {
  id: string;
  charity_id: string;
  tax_year: number;
  status: RunStatus;
  plan_fingerprint: string;
  receipts_planned: number;
  total_cents: number;
  charity_approved_at: string;
  signed_off_at: string | null;
  finished_at: string | null;
  summary: JobSummary | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
};
const RUN_COLUMNS = "id, charity_id, tax_year, status, plan_fingerprint, receipts_planned, total_cents, charity_approved_at, signed_off_at, finished_at, summary, cancelled_at, cancelled_reason";

/** One line of the list a charity approves: who gets a receipt, for how many gifts, for how much. */
export type PlanLine = { donorName: string; gifts: number; totalCents: number };
export type Plan = { taxYear: number; lines: PlanLine[]; totalCents: number; fingerprint: string };

/**
 * A fingerprint of exactly what would be issued: each receipt's donor, identity, donations and amount.
 * Pure. The same receipts in any order give the same fingerprint; any change gives a different one.
 */
export function fingerprintPlan(receipts: Pick<PlannedReceipt, "donorId" | "donorIdentity" | "donationIds" | "totalCents">[]): string {
  const lines = receipts.map((r) => `${r.donorId}|${r.donorIdentity}|${[...r.donationIds].sort().join(",")}|${r.totalCents}`).sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

/** The tax years a charity can approve receipts for now: the last two that have closed. */
export function closedTaxYears(now: Date): number[] {
  const current = taxYearFor(now);
  return [current - 1, current - 2];
}

const store = () => supabaseReceiptStore(createAdminClient());

/**
 * What would be issued for one charity and tax year, if it were approved now: the same planning as the
 * issuing job, with each donor's name from their latest gift (as the receipt prints it). A few queries
 * in all, however many donors, because the charity opens this page often.
 */
export async function loadPlan(charityId: string, taxYear: number): Promise<Plan> {
  const s = store();
  const donations = await s.listDonations(taxYear, charityId);
  const charities = await s.listCharities([...new Set(donations.map((d) => d.charityId))]);
  const { receipts } = planReceipts({ taxYear, donations, charities, alreadyReceipted: await s.receiptedDonationIds(taxYear) });
  const names = await namesByDonation(receipts.flatMap((r) => r.donationIds));
  const lines = receipts
    .map((r) => {
      const latest = r.donationIds.map((id) => names.get(id)).filter((n) => n !== undefined).sort((a, b) => b.paidAt.localeCompare(a.paidAt))[0];
      return { donorName: latest?.name || "Name missing", gifts: r.donationIds.length, totalCents: r.totalCents };
    })
    .sort((a, b) => a.donorName.localeCompare(b.donorName, "en-ZA"));
  return { taxYear, lines, totalCents: lines.reduce((t, l) => t + l.totalCents, 0), fingerprint: fingerprintPlan(receipts) };
}

/** The donor name typed with each donation, and when it was paid. */
async function namesByDonation(ids: string[]): Promise<Map<string, { paidAt: string; name: string }>> {
  const out = new Map<string, { paidAt: string; name: string }>();
  const db = createAdminClient();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db
      .from("donations")
      .select("id, paid_at, donation_checkout_details(donor_type, first_name, last_name, organisation_name)")
      .in("id", ids.slice(i, i + 200));
    if (error) throw error;
    for (const d of data ?? []) {
      const det = (Array.isArray(d.donation_checkout_details) ? d.donation_checkout_details[0] : d.donation_checkout_details) as Parameters<typeof receiptDonorName>[0] | null;
      out.set(d.id as string, { paidAt: String(d.paid_at ?? ""), name: det ? receiptDonorName(det) : "" });
    }
  }
  return out;
}

/** A charity's runs, newest first. */
export async function listRuns(charityId: string): Promise<ReceiptRun[]> {
  const { data, error } = await createAdminClient().from("receipt_runs").select(RUN_COLUMNS).eq("charity_id", charityId).order("created_at", { ascending: false }).limit(20);
  if (error) throw error;
  return (data ?? []) as ReceiptRun[];
}

/** One run, with the charity's name. */
export async function getRun(runId: string): Promise<(ReceiptRun & { charity_name: string }) | null> {
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return null;
  const { data, error } = await createAdminClient().from("receipt_runs").select(`${RUN_COLUMNS}, charities(name_en)`).eq("id", runId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const c = (Array.isArray(data.charities) ? data.charities[0] : data.charities) as { name_en: string } | null;
  return { ...(data as unknown as ReceiptRun), charity_name: c?.name_en ?? "A charity" };
}

/** Runs the charity approved that wait for Givezy's sign-off, oldest first, with the charity's name. */
export async function listWaitingRuns(): Promise<(ReceiptRun & { charity_name: string })[]> {
  const { data, error } = await createAdminClient()
    .from("receipt_runs")
    .select(`${RUN_COLUMNS}, charities(name_en)`)
    .in("status", ["charity_approved", "issuing"])
    .order("charity_approved_at");
  if (error) throw error;
  return (data ?? []).map((r) => {
    const c = (Array.isArray(r.charities) ? r.charities[0] : r.charities) as { name_en: string } | null;
    return { ...(r as unknown as ReceiptRun), charity_name: c?.name_en ?? "A charity" };
  });
}

/** Runs that finished with something left to do (a PDF or an email that failed). */
export async function listUnfinishedRuns(): Promise<(ReceiptRun & { charity_name: string })[]> {
  const { data, error } = await createAdminClient()
    .from("receipt_runs")
    .select(`${RUN_COLUMNS}, charities(name_en)`)
    .eq("status", "done")
    .order("finished_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? [])
    .map((r) => {
      const c = (Array.isArray(r.charities) ? r.charities[0] : r.charities) as { name_en: string } | null;
      return { ...(r as unknown as ReceiptRun), charity_name: c?.name_en ?? "A charity" };
    })
    .filter((r) => runNeedsFinishing(r.summary));
}

/** Whether a finished run still has PDFs or emails to do (a receipt not yet emailed counts). Pure. */
export function runNeedsFinishing(summary: JobSummary | null): boolean {
  if (!summary) return false;
  return summary.failed.length > 0 || summary.emailFailed > 0 || summary.pdfsMade < summary.issued || summary.emailed < summary.issued;
}

export type ApproveResult = { ok: true; run: ReceiptRun } | { ok: false; why: "nothing" | "changed" | "open" };

/** The charity approves the list it was shown. Refused when the list changed since it was shown. */
export async function approveRun(args: { charityId: string; taxYear: number; fingerprint: string; userId: string }): Promise<ApproveResult> {
  const plan = await loadPlan(args.charityId, args.taxYear);
  if (plan.lines.length === 0) return { ok: false, why: "nothing" };
  if (plan.fingerprint !== args.fingerprint) return { ok: false, why: "changed" };
  const { data, error } = await createAdminClient()
    .from("receipt_runs")
    .insert({
      charity_id: args.charityId,
      tax_year: args.taxYear,
      plan_fingerprint: plan.fingerprint,
      receipts_planned: plan.lines.length,
      total_cents: plan.totalCents,
      charity_approved_by: args.userId,
    })
    .select(RUN_COLUMNS)
    .single();
  if (error) {
    // Another person at the charity approved it a moment ago (one open run per year).
    if (/duplicate key|receipt_runs_one_open/.test(error.message)) return { ok: false, why: "open" };
    throw error;
  }
  await logAudit({ actorUserId: args.userId, action: "receipts.run_approved", entityType: "charity", entityId: args.charityId, details: { runId: data.id, taxYear: args.taxYear, receipts: plan.lines.length } });
  return { ok: true, run: data as ReceiptRun };
}

/** Take back an approval, or send a run back to the charity. Only while it still waits for sign-off. */
export async function cancelRun(args: { runId: string; charityId?: string; userId: string; reason: string }): Promise<boolean> {
  let q = createAdminClient()
    .from("receipt_runs")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_reason: args.reason })
    .eq("id", args.runId)
    .eq("status", "charity_approved");
  if (args.charityId) q = q.eq("charity_id", args.charityId);
  const { data, error } = await q.select("id, charity_id");
  if (error) throw error;
  if (!data?.length) return false;
  await logAudit({ actorUserId: args.userId, action: "receipts.run_cancelled", entityType: "charity", entityId: data[0].charity_id as string, details: { runId: args.runId, reason: args.reason } });
  return true;
}

/** s18A gifts from the last days of the tax year still waiting for the payment provider. */
export async function pendingAtYearEnd(charityId: string, taxYear: number): Promise<number> {
  const { end } = taxYearRange(taxYear);
  const lastDays = new Date(Date.parse(`${end}T00:00:00+02:00`) - 3 * 86_400_000).toISOString();
  const { count, error } = await createAdminClient()
    .from("donations")
    .select("id", { count: "exact", head: true })
    .eq("charity_id", charityId)
    .eq("status", "pending")
    .eq("wants_18a", true)
    .gte("created_at", lastDays)
    .lte("created_at", `${end}T23:59:59+02:00`);
  if (error) throw error;
  return count ?? 0;
}

export type SignOffResult =
  | { ok: true; summary: JobSummary; emailed: boolean }
  | { ok: false; why: "switched_off" | "gone" | "changed" | "error"; message?: string };

function job(runId: string) {
  const siteUrl = process.env.SITE_URL ?? "";
  return {
    // Receipt emails link to the site: without its address they would be broken, so nothing is emailed.
    mailer: siteUrl ? { transport: getEmailTransport(), siteUrl, platformName: platformConfig.appName } : undefined,
    render: async ({ details, reference }: { details: Parameters<typeof buildReceiptHtml>[0]["details"]; reference: string }) => {
      // Loaded only when a PDF is made, so pages that never make one don't load Chrome's driver.
      const pdf = await import("./pdf");
      return pdf.htmlToPdf(buildReceiptHtml({ details, reference, fontCss: pdf.loadFontCss(), platformName: platformConfig.appName, logoHtml: pdf.loadLogoHtml() }));
    },
    runId,
  };
}

const today = (now: Date) => formatDate(now).split("/").reverse().join("-");

/**
 * Givezy signs off: the list is checked again, then the receipts are issued, their PDFs made and
 * emailed. If the list changed since the charity approved it, nothing is issued and the run goes back.
 */
export async function signOffRun(args: { runId: string; userId: string; now?: Date }): Promise<SignOffResult> {
  if (!receiptsEnabled()) return { ok: false, why: "switched_off" };
  const now = args.now ?? new Date();
  const db = createAdminClient();
  const { data: run, error } = await db.from("receipt_runs").select(RUN_COLUMNS).eq("id", args.runId).maybeSingle();
  if (error) throw error;
  if (!run || run.status !== "charity_approved") return { ok: false, why: "gone" };
  const plan = await loadPlan(run.charity_id, run.tax_year);
  if (plan.fingerprint !== run.plan_fingerprint) {
    await cancelRun({ runId: run.id, userId: args.userId, reason: "The list changed after it was approved (a gift was refunded or paid late), so nothing was issued. Please check the new list and approve it again." });
    return { ok: false, why: "changed" };
  }
  // Claim it, so two people signing off at once can't run it twice.
  const { data: claimed, error: claimError } = await db
    .from("receipt_runs")
    .update({ status: "issuing", signed_off_by: args.userId, signed_off_at: now.toISOString() })
    .eq("id", run.id)
    .eq("status", "charity_approved")
    .select("id");
  if (claimError) throw claimError;
  if (!claimed?.length) return { ok: false, why: "gone" };
  await logAudit({ actorUserId: args.userId, action: "receipts.run_signed_off", entityType: "charity", entityId: run.charity_id, details: { runId: run.id, taxYear: run.tax_year } });

  const j = job(run.id);
  let summary: JobSummary;
  try {
    summary = await runReceiptsJob({ store: store(), taxYear: run.tax_year, today: today(now), now, mode: "issue", charityId: run.charity_id, mailer: j.mailer, render: j.render });
  } catch (e) {
    // The job stopped before or between receipts. Receipts it issued stay issued (they are safe to
    // finish), so the run is marked done with the error, and "Finish" makes the rest.
    summary = { taxYear: run.tax_year, mode: "issue", planned: run.receipts_planned, issued: 0, pdfsMade: 0, emailed: 0, emailFailed: 0, skippedByReason: {}, needsAttention: [], checkIdentities: [], failed: [{ what: "the run", message: e instanceof Error ? e.message : String(e) }] };
  }
  await db.from("receipt_runs").update({ status: "done", finished_at: new Date().toISOString(), summary }).eq("id", run.id);
  return { ok: true, summary, emailed: Boolean(j.mailer) };
}

/** Make any missing PDFs and send any unsent emails for a finished run. Never issues a new receipt. */
export async function finishRun(args: { runId: string; userId: string; now?: Date }): Promise<SignOffResult> {
  if (!receiptsEnabled()) return { ok: false, why: "switched_off" };
  const now = args.now ?? new Date();
  const db = createAdminClient();
  const { data: run, error } = await db.from("receipt_runs").select(RUN_COLUMNS).eq("id", args.runId).maybeSingle();
  if (error) throw error;
  if (!run || run.status !== "done") return { ok: false, why: "gone" };
  const j = job(run.id);
  const before = run.summary as JobSummary | null;
  const step = await runReceiptsJob({ store: store(), taxYear: run.tax_year, today: today(now), now, mode: "finish", charityId: run.charity_id, mailer: j.mailer, render: j.render });
  // The issued count is the first run's; this pass adds PDFs and emails, and replaces what failed.
  const summary: JobSummary = {
    ...(before ?? step),
    mode: "issue",
    pdfsMade: (before?.pdfsMade ?? 0) + step.pdfsMade,
    emailed: (before?.emailed ?? 0) + step.emailed,
    emailFailed: step.emailFailed,
    failed: step.failed,
  };
  await db.from("receipt_runs").update({ finished_at: new Date().toISOString(), summary }).eq("id", run.id);
  await logAudit({ actorUserId: args.userId, action: "receipts.run_finished", entityType: "charity", entityId: run.charity_id, details: { runId: run.id, pdfs: step.pdfsMade, emailed: step.emailed } });
  return { ok: true, summary, emailed: Boolean(j.mailer) };
}
