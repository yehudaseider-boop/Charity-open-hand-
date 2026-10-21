"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { recordAction } from "@/lib/charity/charity-actions";
import { loadCharityForManager } from "@/lib/charity/queries";
import { canIssue18a } from "@/lib/charities";
import {
  checkFile,
  checkGift,
  giftKey,
  isRecordedMethod,
  paidAtOf,
  taxYearOfGift,
  type CleanGift,
  type GiftField,
  type GiftFields,
} from "@/lib/charity/recorded-gifts";
import { campaignsByTitle, fileFingerprint, recordGifts, recordedKeys, removeRecorded } from "@/lib/charity/recorded-gifts-store";
import { formatDate, isoDateInJhb, taxYearFor } from "@/lib/dates";
import type { FormState } from "@/lib/form";
import { formatRand } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";

const FIELDS: GiftField[] = [
  "date", "amount", "method", "donor_type", "first_name", "last_name", "organisation_name", "registration_number", "email", "phone",
  "wants_18a", "id_number", "tax_reference", "address_line1", "address_line2", "suburb", "city", "postal_code", "reference",
];

const giftName = (g: CleanGift) => (g.donorType === "individual" ? `${g.firstName} ${g.lastName}` : g.organisationName ?? "");

/** One gift typed in on the dashboard. */
export async function recordOneGift(charityId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  await loadCharityForManager(charityId);
  const f: GiftFields = {};
  for (const k of FIELDS) f[k] = String(formData.get(k) ?? "");
  f.wants_18a = formData.get("wants_18a") === "on" ? "yes" : "no";
  const checked = checkGift(f, { today: isoDateInJhb() });
  if (!checked.ok) return { ok: false, message: "Some details need fixing. Nothing was recorded yet.", fieldErrors: checked.errors as Record<string, string> };
  const g = checked.gift;

  // The campaign is chosen from the charity's own list.
  const campaignId = String(formData.get("campaign_id") ?? "");
  let campaign: string | null = null;
  if (campaignId) {
    const { data } = await createAdminClient().from("campaigns").select("id").eq("id", campaignId).eq("charity_id", charityId).maybeSingle();
    if (!data) return { ok: false, fieldErrors: { campaign_id: "Choose one of your campaigns" } };
    campaign = data.id as string;
  }
  if ((await recordedKeys(charityId)).has(giftKey(g))) {
    return {
      ok: false,
      message: g.reference
        ? `You've already recorded a gift with the reference "${g.reference}". Nothing was recorded.`
        : "You've already recorded a gift from this email for this amount on this date. If it's a second gift, add a reference (for example the bank reference) and record it again.",
    };
  }
  const r = await recordGifts({ charityId, userId: viewer.userId, gifts: [{ ...g, campaignId: campaign }] });
  if (!r.ok) return { ok: false, message: r.message };
  revalidatePath(`/charity-admin/${charityId}/donations`);
  const done = await recordAction(
    charityId,
    viewer.userId,
    "gift_recorded",
    { amount: formatRand(g.amountCents), name: giftName(g), date: formatDate(`${g.date}T12:00:00+02:00`), s18a: g.wants18a },
    { type: "remove_recorded", donationIds: r.ids },
  );
  redirect(`/charity-admin/${charityId}/donations?done=${done}`);
}

export type ImportPreview =
  | { state: "idle" }
  | { state: "refused"; message: string }
  | {
      state: "checked";
      fingerprint: string;
      good: number;
      bad: number;
      totalCents: number;
      problems: { line: number; messages: string[] }[];
      warnings: string[];
      unknownColumns: string[];
    };

/** Check a file and its rows against the charity's campaigns and what it already recorded. Writes nothing. */
async function checkUpload(charityId: string, text: string, method: string) {
  const { charity } = await loadCharityForManager(charityId);
  const fallbackMethod = isRecordedMethod(method) ? method : null;
  const file = checkFile(text, { today: isoDateInJhb(), fallbackMethod, seen: await recordedKeys(charityId) });
  if (!file.ok) return { file, charity, campaigns: new Map<string, string>() };
  const campaigns = await campaignsByTitle(charityId);
  // A campaign named in the file must be one of the charity's own.
  for (const r of file.rows) {
    if (r.check.ok && r.check.gift.campaign && !campaigns.has(r.check.gift.campaign.toLowerCase())) {
      r.check = { ok: false, errors: { campaign: `No campaign called "${r.check.gift.campaign}". Use the title exactly as it is on your Campaigns page, or leave it empty` } };
    }
  }
  const good = file.rows.filter((r) => r.check.ok && !r.duplicateOf);
  file.good = good.length;
  file.bad = file.rows.length - good.length;
  file.totalCents = good.reduce((t, r) => t + (r.check.ok ? r.check.gift.amountCents : 0), 0);
  return { file, charity, campaigns };
}

/** Step 1: read the file the charity chose and say what would be recorded. */
export async function checkImport(charityId: string, _prev: ImportPreview, formData: FormData): Promise<ImportPreview> {
  await requireViewer();
  const text = String(formData.get("text") ?? "");
  if (!text.trim()) return { state: "refused", message: "Choose a CSV file first." };
  const { file, charity } = await checkUpload(charityId, text, String(formData.get("method") ?? ""));
  if (!file.ok) return { state: "refused", message: file.message };

  const problems = file.rows
    .filter((r) => !r.check.ok || r.duplicateOf)
    .map((r) => ({
      line: r.line,
      messages: r.check.ok ? ["Already recorded (same reference, or the same email, amount and date). Left out."] : Object.values(r.check.errors).filter((m): m is string => Boolean(m)),
    }));
  const gifts = file.rows.flatMap((r) => (r.check.ok && !r.duplicateOf ? [r.check.gift] : []));
  const warnings: string[] = [];
  if (file.datesReadBothWays) {
    const sample = file.rows.find((r) => r.check.ok)?.check;
    const d = sample && sample.ok ? sample.gift.date : null;
    warnings.push(
      `We read every date as day/month/year${d ? `: the first gift is on ${Number(d.slice(8))} ${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : ""}. If your file is month/day/year, don't import it: save it with dates as dd/mm/yyyy first.`,
    );
  }
  const wanting = gifts.filter((g) => g.wants18a);
  if (wanting.length) {
    if (!canIssue18a(charity)) {
      warnings.push(`${wanting.length} ${wanting.length === 1 ? "gift asks" : "gifts ask"} for an s18A receipt. Your charity can't issue them through Givezy yet: that needs confirmed s18A approval and a signed receipting mandate.`);
    } else {
      // The same rule the receipt run uses: a gift paid before the mandate was signed can't be receipted.
      const mandate = charity.mandate_signed_at ? new Date(charity.mandate_signed_at).getTime() : null;
      const before = mandate ? wanting.filter((g) => new Date(paidAtOf(g.date)).getTime() < mandate).length : 0;
      if (before) warnings.push(`${before} s18A ${before === 1 ? "gift is" : "gifts are"} dated before your receipting mandate was signed (${formatDate(charity.mandate_signed_at!)}), so Givezy can't put ${before === 1 ? "it" : "them"} on a receipt.`);
    }
    const current = taxYearFor(new Date());
    const past = wanting.filter((g) => taxYearOfGift(g.date) < current).length;
    if (past) warnings.push(`${past} s18A ${past === 1 ? "gift is" : "gifts are"} from a tax year that has ended. If that donor's receipt for the year is already issued, ${past === 1 ? "it" : "they"} won't be on it until we withdraw and re-issue it: tell us.`);
  }
  return {
    state: "checked",
    fingerprint: fileFingerprint(text),
    good: file.good,
    bad: file.bad,
    totalCents: file.totalCents,
    problems: problems.slice(0, 100),
    warnings,
    unknownColumns: file.unknownColumns,
  };
}

/** Step 2: record the gifts that passed, from exactly the file that was checked. */
export async function importGifts(charityId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const text = String(formData.get("text") ?? "");
  if (fileFingerprint(text) !== String(formData.get("fingerprint") ?? "")) {
    return { ok: false, message: "The file changed since it was checked. Nothing was imported. Check it again first." };
  }
  if (formData.get("confirm") !== "on") {
    return { ok: false, fieldErrors: { confirm: "Please confirm, so we know these gifts may be recorded and receipted through Givezy" } };
  }
  const { file, campaigns } = await checkUpload(charityId, text, String(formData.get("method") ?? ""));
  if (!file.ok) return { ok: false, message: file.message };
  const gifts = file.rows.flatMap((r) => (r.check.ok && !r.duplicateOf ? [{ ...r.check.gift, campaignId: r.check.gift.campaign ? campaigns.get(r.check.gift.campaign.toLowerCase()) ?? null : null }] : []));
  if (!gifts.length) return { ok: false, message: "No gift in this file can be recorded: fix the rows listed above and check it again. Nothing was imported." };
  const fileName = String(formData.get("file_name") ?? "file.csv").replace(/[\u0000-\u001f]/g, "").slice(0, 200) || "file.csv";
  const r = await recordGifts({ charityId, userId: viewer.userId, gifts, importOf: { fileName, fingerprint: fileFingerprint(text), confirmedAt: new Date().toISOString() } });
  if (!r.ok) return { ok: false, message: r.message };
  revalidatePath(`/charity-admin/${charityId}/donations`);
  const done = await recordAction(
    charityId,
    viewer.userId,
    "gifts_imported",
    { gifts: gifts.length, file: fileName, total: formatRand(gifts.reduce((t, g) => t + g.amountCents, 0)), leftOut: file.bad },
    { type: "remove_recorded", importId: r.importId ?? undefined },
  );
  redirect(`/charity-admin/${charityId}/donations?done=${done}`);
}

/** Remove one recorded gift, or a whole import, while none of it is on a receipt. Asked first on the page. */
export async function removeRecordedGifts(charityId: string, target: { donationId?: string; importId?: string }, _prev: FormState, _formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  await loadCharityForManager(charityId);
  const id = target.importId ?? target.donationId ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Nothing to remove." };
  const r = await removeRecorded({ charityId, userId: viewer.userId, ...target });
  revalidatePath(`/charity-admin/${charityId}/donations`);
  if (!r.ok) {
    return {
      ok: false,
      message: r.why === "receipted"
        ? "It's on an s18A receipt Givezy has issued, so it can't be removed here. If it's wrong, tell us: only we can withdraw and re-issue a receipt."
        : "It has already been removed.",
    };
  }
  const done = await recordAction(charityId, viewer.userId, "gifts_removed", { removed: r.removed }, null);
  redirect(`/charity-admin/${charityId}/donations?done=${done}`);
}
