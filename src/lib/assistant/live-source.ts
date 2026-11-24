import "server-only";
import { can } from "@/lib/charity/permissions";
import { applicationChecklist, gettingStarted } from "@/lib/charity/checklist";
import { allTime, donorName, ERASED_DONOR, isErasedEmail, lastMonth, monthlySummary, thisMonth, thisTaxYear, type Period } from "@/lib/charity/dashboard";
import { loadS18aMissing } from "@/lib/charity/s18a-reminder-send";
import type { MissingDetail } from "@/lib/donations/s18a-details";
import { loadDonors, loadMonthlyDonations, loadMonthlyGifts, loadMonthlyTotals, loadOverview, loadReceiptGifts } from "@/lib/charity/dashboard-queries";
import { loadCharityForManager, loadStories } from "@/lib/charity/queries";
import { loadStartFacts } from "@/lib/charity/start-facts";
import { statusLabels, type CharityStatus } from "@/lib/charity/status";
import { viewerRole } from "@/lib/charity/team";
import { formatDate, taxYearLabel } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { linkTarget } from "./prompt";
import { giftCents, type HelperSource, type MonthTotal, type PeriodKey } from "./tools";
import { monthlyStates, newFlags } from "./donor-states";

/**
 * The dashboard helper's facts for a real charity (22/11/2026). Read as the signed-in person (their own session), by
 * the same queries the dashboard pages use, so row-level security shows the helper exactly what that person may see
 * on the dashboard, never more. Call only after the route has checked they are on the team and passed the second step.
 */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthName = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS[(m || 1) - 1]} ${y}`;
};

function period(key: PeriodKey, now: Date): { period: Period; label: string } {
  if (key === "this_month") return { period: thisMonth(now), label: `This month (${monthName(thisMonth(now).from.slice(0, 10))})` };
  if (key === "last_month") return { period: lastMonth(now), label: `Last month (${monthName(lastMonth(now).from.slice(0, 10))})` };
  if (key === "this_tax_year") {
    const t = thisTaxYear(now);
    return { period: t, label: taxYearLabel(t.taxYear) };
  }
  return { period: allTime, label: "Since the charity joined Givezy" };
}

/** A dashboard page as the helper writes links ("dash:/profile"), from the page's real address under this dashboard. */
function pageLink(href: string | null, base: string): string | null {
  if (!href || !href.startsWith(base)) return null;
  return linkTarget(`/charity-admin/[id]${href.slice(base.length)}`);
}

export function liveSource(charityId: string, now: Date = new Date()): HelperSource {
  const base = `/charity-admin/${charityId}`;
  let donorList: Promise<[Awaited<ReturnType<typeof loadDonors>>, Awaited<ReturnType<typeof loadMonthlyGifts>>, Awaited<ReturnType<typeof loadMonthlyDonations>>]> | undefined;
  return {
    async totals(key) {
      const { period: p, label } = period(key, now);
      const o = await loadOverview(charityId, p);
      return {
        label,
        gifts: o.paid_count,
        raisedCents: o.paid_cents,
        donors: o.donor_count,
        s18aRequestedCents: o.receipt_requested_cents,
        refunded: o.refunded_count,
        refundedCents: o.refunded_cents,
        chargedBack: o.charged_back_count,
        pending: o.pending_count,
        failed: o.failed_count,
      };
    },

    async byMonth() {
      const rows = await loadMonthlyTotals(charityId, 12);
      return rows.map((r): MonthTotal => ({ month: monthName(r.month), gifts: r.donationCount, raisedCents: r.amountCents, monthlyCents: r.monthlyCents }));
    },

    async monthly() {
      const rows = await loadMonthlyDonations(charityId);
      const s = monthlySummary(rows);
      const next = rows
        .filter((r) => r.status === "active" && r.next_charge_at)
        .sort((a, b) => String(a.next_charge_at).localeCompare(String(b.next_charge_at)))
        .slice(0, 5)
        .map((r) => ({ day: formatDate(r.next_charge_at as string), amountCents: Number(r.amount_cents) }));
      return {
        running: s.runningCount,
        perMonthCents: s.runningCentsPerMonth,
        retrying: rows.filter((r) => r.status === "active" && r.retrying).length,
        paused: s.pausedCount,
        ended: s.endedCount,
        nextCharges: next,
      };
    },

    async setup() {
      // documentTypes, not the documents read: it counts a bank letter this role can't see (review 22/11/2026).
      const { charity, priv, documentTypes } = await loadCharityForManager(charityId);
      const role = await viewerRole(charityId);
      const status = statusLabels[charity.status as CharityStatus]?.label ?? String(charity.status);
      const editable = charity.status === "draft" || charity.status === "rejected";
      const application = editable
        ? applicationChecklist({ charity, priv, documentTypes }).map((i) => ({
            label: i.label,
            done: i.done,
            page: "dash:/application",
            who: can(role, "application") ? null : "Your charity's owner or an admin does this.",
          }))
        : null;
      const stories = await loadStories(charityId, 1).catch(() => ({ updates: [] as unknown[] }));
      const facts = await loadStartFacts(charityId, charity, stories.updates.length);
      const steps = gettingStarted(facts, base, (p) => can(role, p)).map((i) => ({
        label: i.optional ? `${i.label} (optional)` : i.label,
        done: i.done,
        page: pageLink(i.href, base),
        who: i.can ? null : i.who,
      }));
      return { status, application, gettingStarted: steps };
    },

    async receipts() {
      const { gifts, onIssued } = await loadReceiptGifts(charityId);
      const years = new Map<number, { giftsWanting: number; onIssued: number; wantingCents: number }>();
      for (const g of gifts) {
        const left = giftCents(g);
        if (!g.tax_year || left <= 0) continue;
        const y = years.get(g.tax_year) ?? { giftsWanting: 0, onIssued: 0, wantingCents: 0 };
        y.giftsWanting += 1;
        y.wantingCents += left;
        if (onIssued.has(g.id)) y.onIssued += 1;
        years.set(g.tax_year, y);
      }
      return [...years.entries()].sort((a, b) => b[0] - a[0]).map(([taxYear, y]) => ({ taxYear, label: taxYearLabel(taxYear), ...y }));
    },

    async recentGifts(limit, withNames) {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("charity_donations")
        // The email only to tell an erased donor (whose name is kept for SARS) from the rest: it never goes further.
        .select("status, amount_cents, refunded_cents, paid_at, created_at, is_anonymous, recurring_id, donor_id, donor_type, first_name, last_name, organisation_name, email")
        .eq("charity_id", charityId)
        .order("paid_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      // A donor who gave anonymously even once is anonymous on the Donors page (review 24/11/2026): never named on
      // any of their gifts here either, as donors() hides them.
      const hidden = withNames ? new Set((await readDonors())[0].filter((d) => d.is_anonymous).map((d) => d.donor_id)) : new Set<string>();
      return (data ?? []).map((g) => ({
        date: formatDate((g.paid_at ?? g.created_at) as string),
        amountCents: giftCents(g as { amount_cents: number; refunded_cents: number }),
        status: g.status === "charged_back" ? "charged back" : String(g.status),
        donor: withNames ? donorName(g as Parameters<typeof donorName>[0]) : null,
        monthly: Boolean(g.recurring_id),
        anonymous: Boolean(g.is_anonymous) || (g.donor_id != null && hidden.has(g.donor_id as string)),
      }));
    },

    async donors() {
      const [rows, monthlyGifts, monthlyRows] = await readDonors();
      const states = monthlyStates(monthlyGifts, monthlyRows);
      const flags = newFlags(now);
      return rows.map((d) => {
        const s = states.get(d.donor_id);
        return {
          // Someone erased at their request keeps their name only for SARS: never named here, as on every page.
          name: isErasedEmail(d.email) ? ERASED_DONOR : d.is_anonymous ? "Anonymous donor" : d.display_name,
          hidden: isErasedEmail(d.email) || d.is_anonymous,
          gifts: d.donation_count,
          totalCents: d.total_cents,
          firstGift: d.first_paid_at ? formatDate(d.first_paid_at) : null,
          lastGift: d.last_paid_at ? formatDate(d.last_paid_at) : null,
          // Only while a monthly donation is running, as the Donors page's "Gives monthly" badge (review 24/11/2026).
          monthly: s?.state === "running",
          // For the name tools (24/11/2026). The id stays on the server; contact details are never put here.
          id: d.donor_id,
          monthlyState: s?.state ?? "none",
          monthlyCents: s?.perMonthCents ?? 0,
          stopped: s?.stopped ?? null,
          newIn: flags(d.first_paid_at),
          firstAt: d.first_paid_at ?? null,
          s18aAsked: Boolean(d.wants_18a),
        };
      });
    },

    async donorGifts(donorId) {
      // Only a donor in this charity's own list (read as the person asking), and only this charity's gifts.
      const [rows] = await readDonors();
      if (!rows.some((d) => d.donor_id === donorId)) return { taxYear: taxYearLabel(thisTaxYear(now).taxYear), gifts: [] };
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("charity_donations")
        .select("status, amount_cents, refunded_cents, paid_at, created_at, recurring_id, tax_year")
        .eq("charity_id", charityId)
        .eq("donor_id", donorId)
        .in("status", ["paid", "refunded", "charged_back"])
        .order("paid_at", { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw new Error(error.message);
      const year = thisTaxYear(now).taxYear;
      return {
        taxYear: taxYearLabel(year),
        gifts: (data ?? []).map((g) => ({
          date: formatDate((g.paid_at ?? g.created_at) as string),
          amountCents: giftCents(g as { amount_cents: number; refunded_cents: number }),
          status: g.status === "charged_back" ? "charged back" : String(g.status),
          monthly: Boolean(g.recurring_id),
          thisTaxYear: Number(g.tax_year) === year,
        })),
      };
    },

    async s18aMissing() {
      // As the Donors page reads it (service role, after the route checked the person is on the team): only which
      // details are missing, never a number or an address.
      const missing = await loadS18aMissing(charityId, now).catch((e: unknown) => {
        console.error("[assistant] s18A details check failed", e instanceof Error ? e.message : e);
        return null;
      });
      if (!missing) return null;
      return new Map([...missing.entries()].map(([id, kinds]) => [id, kinds.map((k) => MISSING_WORDS[k])]));
    },

    async donorContact(donorId) {
      // From this charity's own list, read as the person asking: a role that can't see contact details gets nulls
      // from the database itself (charity_contact_or_null). An erased donor's placeholder address goes back as is,
      // for the tool to show as erased.
      const [rows] = await readDonors();
      const d = rows.find((r) => r.donor_id === donorId);
      if (!d || d.is_anonymous) return { email: null, phone: null };
      return { email: d.email ?? null, phone: d.phone ?? null };
    },
  };

  // Read once per question, however many lookups need it (the list can be long).
  function readDonors() {
    donorList ??= Promise.all([loadDonors(charityId), loadMonthlyGifts(charityId), loadMonthlyDonations(charityId)]);
    return donorList;
  }
}

const MISSING_WORDS: Record<MissingDetail, string> = { id_number: "SA ID number", registration_number: "registration number", address: "address" };
