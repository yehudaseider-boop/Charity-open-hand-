"use server";

import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { recordAction } from "@/lib/charity/charity-actions";
import { loadCharityForManager } from "@/lib/charity/queries";
import { checkThankYou } from "@/lib/charity/thank-you";
import { sendDonorThankYou } from "@/lib/charity/thank-you-send";
import { isUuid } from "@/lib/ids";
import { hitRateLimit } from "@/lib/rate-limit";
import { safeNextPath } from "@/lib/safe-path";
import type { FormState } from "@/lib/form";
import { ERASED_DONOR, donationStatus, isDonationStatus, isErasedEmail, shownEmail } from "@/lib/charity/dashboard";
import { loadCampaignTitles, loadDonorPaidGifts, loadDonors, loadMonthlyDonations, loadMonthlyGifts } from "@/lib/charity/dashboard-queries";
import { donorGiving } from "@/lib/charity/donor-giving";
import { lapsedDaysFor, listNotes, listReminders, listTags, tagsByDonor } from "@/lib/charity/donor-care";
import { donorGroup, donorGroupsFor, monthlyByDonor } from "@/lib/charity/insights";
import { formatDate, isoDateInJhb } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

/** "Say thank you" on one donor: a short personal email from the charity, sent by Givezy. */
export async function thankOneDonor(charityId: string, donorId: string, back: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  // Throws unless the signed-in person (with their second step) manages this charity.
  const { charity, priv } = await loadCharityForManager(charityId);
  if (charity.status !== "approved") return { ok: false, message: "You can thank donors once your page is live." };
  if (!isUuid(donorId)) return { ok: false, message: "We couldn't find that donor. Please reload the page." };
  const checked = checkThankYou(String(formData.get("body") ?? ""));
  if (!checked.ok) return { ok: false, fieldErrors: { body: checked.message } };
  // "Personally" means a few at a time: a charity account can't be used to mass-mail donors in Givezy's name.
  if (await hitRateLimit("donor-thank", [`charity:${charityId}`], 20, 60)) {
    return { ok: false, message: "You've sent a lot of thank-yous in the last hour, so this one wasn't sent. Please try again later." };
  }
  const replyTo = priv?.contact_email ?? null;
  const r = await sendDonorThankYou({ charityId, charityName: charity.name_en, donorId, body: checked.body, userId: viewer.userId, replyTo });
  if (!r.ok) return { ok: false, message: r.message };
  // A sent email can't be called back, so there is no undo: the form asked first.
  const done = await recordAction(charityId, viewer.userId, "donor_thanked", { name: r.name, replyTo, donorId }, null);
  const fallback = `/charity-admin/${charityId}/donors`;
  const safe = safeNextPath(back, fallback);
  const page = safe.startsWith(fallback) ? safe : fallback;
  redirect(`${page}${page.includes("?") ? "&" : "?"}done=${done}`);
}

export type DonorPeek = {
  name: string;
  email: string | null;
  phone: string | null;
  total: string;
  count: number;
  first: string;
  last: string;
  largest: string | null;
  groupLabel: string | null;
  monthly: "active" | "paused" | null;
  tags: string[];
  followUps: { what: string; due: string; late: boolean }[];
  latestNote: string | null;
  recent: { date: string; amount: string; status: string }[];
};

/**
 * One donor at a glance, for the side panel on the Donors list (decided 28/10/2026): what the full page
 * shows first, read the same way and behind the same check, so a panel never shows more than the page.
 */
export async function peekDonor(charityId: string, donorId: string): Promise<DonorPeek | null> {
  await requireViewer();
  // Throws unless the signed-in person (with their second step) manages this charity.
  await loadCharityForManager(charityId);
  if (!isUuid(donorId)) return null;
  const donor = (await loadDonors(charityId)).find((d) => d.donor_id === donorId);
  if (!donor) return null;
  const supabase = await createClient();
  const [paid, titles, notes, reminders, tags, byDonor, lapsedDays, monthlyGifts, monthly, { data: recent }] = await Promise.all([
    loadDonorPaidGifts(charityId, donorId),
    loadCampaignTitles(charityId),
    listNotes(charityId, donorId),
    listReminders(charityId, donorId),
    listTags(charityId),
    tagsByDonor(charityId),
    lapsedDaysFor(charityId),
    loadMonthlyGifts(charityId),
    loadMonthlyDonations(charityId),
    supabase.from("charity_donations").select("status, amount_cents, paid_at, created_at").eq("charity_id", charityId).eq("donor_id", donorId).order("paid_at", { ascending: false, nullsFirst: false }).limit(5),
  ]);
  const { largest } = donorGiving(paid, titles);
  const tagName = new Map(tags.map((t) => [t.id, t.name]));
  const today = isoDateInJhb();
  const group = donorGroupsFor(lapsedDays).find((g) => g.key === donorGroup(donor, new Date(), lapsedDays));
  const givesMonthly = monthlyByDonor(monthlyGifts, monthly).get(donorId);
  const statusLabel = (s: string) => (isDonationStatus(s) ? donationStatus[s].label : s);
  return {
    name: isErasedEmail(donor.email) ? ERASED_DONOR : donor.display_name,
    email: shownEmail(donor.email) ? donor.email : null,
    phone: donor.phone,
    total: formatRand(donor.total_cents),
    count: donor.donation_count,
    first: formatDate(donor.first_paid_at),
    last: formatDate(donor.last_paid_at),
    largest: largest ? `${formatRand(largest.amount_cents)} on ${formatDate(largest.paid_at ?? donor.last_paid_at)}` : null,
    groupLabel: group?.label ?? null,
    monthly: givesMonthly === "active" || givesMonthly === "paused" ? givesMonthly : null,
    tags: (byDonor.get(donorId) ?? []).map((t) => tagName.get(t)).filter((t): t is string => Boolean(t)),
    followUps: reminders.filter((r) => !r.done_at).slice(0, 3).map((r) => ({ what: r.what, due: formatDate(`${r.due_on}T12:00:00+02:00`), late: r.due_on < today })),
    latestNote: notes[0]?.body ?? null,
    recent: (recent ?? []).map((g) => ({ date: formatDate((g.paid_at ?? g.created_at) as string), amount: formatRand(Number(g.amount_cents)), status: statusLabel(g.status as string) })),
  };
}
