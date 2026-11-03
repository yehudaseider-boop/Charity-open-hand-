import "server-only";
import { randomUUID } from "node:crypto";
import { getViewer } from "@/lib/auth";
import { memberRole } from "@/lib/charity/team";
import { hasSecondStep } from "@/lib/mfa";
import { hitRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { taxYearFor } from "@/lib/dates";
import pkg from "../../../package.json";
import { buildIt3d, type It3dPeriod, type It3dResult } from "./it3d";
import { loadIt3dCharity, loadIt3dReceipts } from "./it3d-store";

/**
 * The IT3(d) downloads hold donors' full ID numbers, so they are for the charity's owner only (as for thank-donors
 * and contact imports), with the second step done, and limited like the other exports. A refusal is a status and
 * one plain message for the page to show (the page fetches the file and says what happened).
 */
export async function authoriseIt3d(charityId: string): Promise<{ userId: string } | { status: number; message: string }> {
  const user = await getViewer();
  if (!user || !/^[0-9a-f-]{36}$/i.test(charityId)) return { status: 401, message: "You're signed out. Sign in again, then try the download. Nothing was downloaded." };
  const supabase = await createClient();
  const [{ data: manages }, { data: isAdmin }] = await Promise.all([
    supabase.rpc("is_charity_admin", { target: charityId }),
    supabase.rpc("is_platform_admin"),
  ]);
  if (!manages && !isAdmin) return { status: 404, message: "This download isn't available to you. Nothing was downloaded." };
  if (!(await hasSecondStep())) return { status: 403, message: "Please complete your second step first (reload this page), then try again. Nothing was downloaded." };
  if ((await memberRole(charityId, user.userId)) !== "owner") return { status: 403, message: "Only your charity's owner can download the SARS files, because they hold donors' ID numbers. Nothing was downloaded." };
  if (await hitRateLimit("charity-export", [`user:${user.userId}`], 10, 10)) {
    return { status: 429, message: "Too many downloads in a few minutes. Nothing was downloaded. Please wait a few minutes and try again." };
  }
  return { userId: user.userId };
}

/** The tax year and period asked for, or null when they make no sense. */
export function readChoice(year: unknown, period: unknown, now = new Date()): { taxYear: number; period: It3dPeriod } | null {
  const taxYear = Number(year);
  if (!Number.isInteger(taxYear) || taxYear < 2022 || taxYear > taxYearFor(now)) return null; // field 203: at least 2022
  if (period !== "first_half" && period !== "full_year") return null;
  return { taxYear, period };
}

/** Gather and build. The Source Identifier is passed straight through and never stored or logged. */
export async function prepareIt3d(charityId: string, choice: { taxYear: number; period: It3dPeriod }, opts: { testData?: boolean; sourceIdentifier?: string; now?: Date } = {}): Promise<It3dResult> {
  const [charity, receipts] = await Promise.all([loadIt3dCharity(charityId), loadIt3dReceipts(charityId, choice.taxYear)]);
  return buildIt3d({
    ...choice,
    now: opts.now ?? new Date(),
    testData: opts.testData ?? false,
    sourceIdentifier: opts.sourceIdentifier ?? "",
    sourceSystemVersion: pkg.version,
    uniqueFileId: randomUUID(),
    charity,
    receipts,
  });
}
