import Link from "next/link";
import { Badge } from "@/components/badge";
import { Card } from "@/components/card";
import { ActionLink, EmptyState, MiniStat, PageHeader, Tabs, blueAction, field, rowLink, table } from "@/components/dash";
import { GoalRing } from "@/app/charity-admin/[id]/overview-parts";
import { chargeDayLabel, donationStatus, monthlyState, monthlyStateLabel } from "@/lib/charity/dashboard";
import { donorGroup, donorGroupsFor } from "@/lib/charity/insights";
import { progressPercent } from "@/lib/charity/campaigns";
import { initials } from "@/lib/charity/initials";
import { RECORDED_METHODS, type RecordedMethod } from "@/lib/charity/recorded-gifts";
import { GIFT_SOURCES, giftSourceLabel } from "@/lib/donations/source";
import { formatDate, taxYearFor, taxYearName, taxYearRange } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { typedDay } from "@/lib/typed-date";
import { plural } from "@/lib/text";
import { donorFacts, type DemoData, type DemoGift } from "./data";
import { DEMO_BASE as base, DEMO_LAPSED_DAYS, monthOf, saDay } from "./sample";

/**
 * The demo's own versions of the dashboard pages: the same look and the same words as the real pages, drawn
 * from the demo's made-up records, read-only. Filters are plain links and a plain search form, so every
 * click leads somewhere real inside the demo.
 */

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const sum = (gs: DemoGift[]) => gs.reduce((t, g) => t + g.amountCents, 0);
const tints = ["bg-honey", "bg-peach", "bg-brand-soft", "bg-success-soft"];

function Avatar({ name, i }: { name: string; i: number }) {
  return <span aria-hidden className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-bold text-navy ${tints[i % tints.length]}`}>{initials(name)}</span>;
}

function campaignTitle(data: DemoData, id: string | null) {
  return id ? (data.campaigns.find((c) => c.id === id)?.title ?? "A campaign") : "General";
}

function fromLabel(g: DemoGift) {
  return g.recordedMethod ? `Recorded: ${RECORDED_METHODS[g.recordedMethod as RecordedMethod] ?? "by you"}` : giftSourceLabel(g.source);
}

// Donations --------------------------------------------------------------------------------------------------

const PERIODS = { all: "Any time", "this-month": "This month", "last-month": "Last month", "this-tax-year": "This tax year", "last-tax-year": "Last tax year", custom: "Chosen dates" } as const;
type Period = keyof typeof PERIODS;
const STATUSES = ["all", "paid", "refunded", "charged_back"] as const;

function inPeriod(data: DemoData, g: DemoGift, period: Period, from: string, to: string) {
  const day = saDay(g.paidAt);
  const ty = taxYearFor(data.now);
  switch (period) {
    case "this-month": return day.slice(0, 7) === data.months[11];
    case "last-month": return day.slice(0, 7) === data.months[10];
    case "this-tax-year": { const r = taxYearRange(ty); return day >= r.start && day <= r.end; }
    case "last-tax-year": { const r = taxYearRange(ty - 1); return day >= r.start && day <= r.end; }
    case "custom": return (!from || day >= from) && (!to || day <= to);
    default: return true;
  }
}

export function DemoDonations({ data, sp }: { data: DemoData; sp: Params }) {
  const status = (STATUSES as readonly string[]).includes(one(sp.status)) ? one(sp.status) : "all";
  const period: Period = Object.hasOwn(PERIODS, one(sp.period)) ? (one(sp.period) as Period) : "all";
  // Only a real yyyy-mm-dd day: anything else (13th month, 45th day, other words) is ignored, never shown.
  const from = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.from)) ? (typedDay(one(sp.from)) ?? "") : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.to)) ? (typedDay(one(sp.to)) ?? "") : "";
  const source = one(sp.source);
  const campaign = one(sp.campaign);
  const q = one(sp.q).trim().toLowerCase().slice(0, 60);
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const rows = data.gifts.filter((g) => {
    const d = data.donor(g.donorId)!;
    return (status === "all" || g.status === status)
      && inPeriod(data, g, period, from, to)
      && (!source || (source === "recorded" ? Boolean(g.recordedMethod) || g.source === "recorded" : g.source === source))
      && (!campaign || (campaign === "none" ? !g.campaignId : g.campaignId === campaign))
      && (!q || d.name.toLowerCase().includes(q) || d.email.includes(q));
  });
  const PAGE = 25;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice((Math.min(page, pages) - 1) * PAGE, Math.min(page, pages) * PAGE);
  const paidTotal = sum(rows.filter((g) => g.status === "paid"));
  const keep = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    const all: Record<string, string> = { status, period, from, to, source, campaign, q: one(sp.q), ...over };
    for (const [k, v] of Object.entries(all)) if (v && !(k === "status" && v === "all") && !(k === "period" && v === "all")) p.set(k, v);
    const s = p.toString();
    return `${base}/donations${s ? `?${s}` : ""}`;
  };
  const range = period === "custom" ? `${from ? formatDate(`${from}T12:00:00+02:00`) : "the start"} to ${to ? formatDate(`${to}T12:00:00+02:00`) : "today"}` : PERIODS[period].toLowerCase();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Donations"
        intro="Every gift that went through, newest first. Record a gift or import a file for EFT, cash and other gifts that didn't come through Givezy."
        actions={<>
          <ActionLink href={`${base}/donations/deposits`}>Deposits</ActionLink>
          <ActionLink href={`${base}/donations/import`}>Import from a file</ActionLink>
          <ActionLink href={`${base}/donations/record`} primary>Record a gift</ActionLink>
        </>}
      />
      <Card>
        <form action={`${base}/donations`} method="get" className="flex flex-wrap gap-2">
          <label htmlFor="demo-q" className="sr-only">Search name or email</label>
          <input id="demo-q" name="q" defaultValue={one(sp.q)} placeholder="Search name or email" className={`${field} min-w-0 flex-1 basis-56`} />
          <label htmlFor="demo-period" className="sr-only">Period</label>
          <select id="demo-period" name="period" defaultValue={period} className={field}>
            {Object.entries(PERIODS).filter(([k]) => k !== "custom" || period === "custom").map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <label htmlFor="demo-source" className="sr-only">Came from</label>
          <select id="demo-source" name="source" defaultValue={source} className={field}>
            <option value="">From anywhere</option>
            {Object.entries(GIFT_SOURCES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <label htmlFor="demo-campaign" className="sr-only">Campaign</label>
          <select id="demo-campaign" name="campaign" defaultValue={campaign} className={field}>
            <option value="">Every campaign</option>
            <option value="none">No campaign</option>
            {data.campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
          {/* A month picked from the chart or report stays picked while other filters change. */}
          {period === "custom" && from ? <input type="hidden" name="from" value={from} /> : null}
          {period === "custom" && to ? <input type="hidden" name="to" value={to} /> : null}
          <button className={blueAction}>Search</button>
        </form>
      </Card>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Tabs label="Show donations" items={STATUSES.map((s) => ({ href: keep({ status: s, page: "" }), label: s === "all" ? "All" : donationStatus[s].label, active: status === s }))} />
        <p className="text-sm text-muted">
          <span className="font-display text-2xl font-extrabold text-indigo">{formatRand(paidTotal)}</span> received, {range}
          {source ? `, from ${source === "recorded" ? "gifts you recorded" : giftSourceLabel(source)}` : ""}
          {campaign ? `, ${campaign === "none" ? "no campaign" : campaignTitle(data, campaign)}` : ""} · {plural(rows.length, "donation")}
        </p>
      </div>
      {shown.length === 0 ? (
        <EmptyState title="No matches" action={<ActionLink href={`${base}/donations`}>Show every donation</ActionLink>}>No donations match these filters. Try a wider period or clear the search.</EmptyState>
      ) : (
        <Card lights>
          <div className={table.wrap}>
            <table className={`${table.table} min-w-[40rem]`}>
              <thead><tr className={table.headRow}><th className={table.th}>Status</th><th className={table.th}>Donor</th><th className={table.th}>For</th><th className={table.th}>From</th><th className={table.th}>Date</th><th className={`${table.th} text-right`}>Amount</th></tr></thead>
              <tbody>
                {shown.map((g, i) => {
                  const d = data.donor(g.donorId)!;
                  const st = donationStatus[g.status];
                  return (
                    <tr key={g.id} className={`${table.row} relative`}>
                      <td className={`${table.td} whitespace-nowrap`}><Badge tone={st.tone}>{st.label}</Badge></td>
                      <td className={table.td}>
                        <Link href={`${base}/donations/${g.id}`} className="flex min-w-0 items-center gap-2.5 font-semibold text-indigo after:absolute after:inset-0 group-hover:text-brand group-hover:underline">
                          <Avatar name={d.name} i={i} /><span className="truncate">{d.name}</span>
                        </Link>
                      </td>
                      <td className={`${table.td} max-w-[11rem] truncate`}>{campaignTitle(data, g.campaignId)}{g.recurringId ? <span className="block text-xs text-muted">Monthly donation</span> : null}</td>
                      <td className={table.td}>{fromLabel(g)}</td>
                      <td className={`${table.td} whitespace-nowrap tabular-nums`}>{formatDate(g.paidAt)}</td>
                      <td className={`${table.num} whitespace-nowrap`}>{formatRand(g.amountCents)}{g.wants18a ? <span className="ml-1.5 rounded-md bg-success-soft px-1.5 py-0.5 text-[11px] font-semibold text-success">s18A</span> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {pages > 1 ? (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-sm">
          {page > 1 ? <ActionLink href={keep({ page: String(page - 1) })}>Previous</ActionLink> : <span />}
          <span className="text-muted">Page {Math.min(page, pages)} of {pages}</span>
          {page < pages ? <ActionLink href={keep({ page: String(page + 1) })}>Next</ActionLink> : <span />}
        </nav>
      ) : null}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 border-b border-border py-2.5 text-sm last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-right font-semibold [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

export function DemoDonation({ data, id }: { data: DemoData; id: string }) {
  const g = data.gifts.find((x) => x.id === id);
  if (!g) return <DemoMissing what="donation" back={`${base}/donations`} backLabel="Donations" />;
  const d = data.donor(g.donorId)!;
  const st = donationStatus[g.status];
  return (
    <div className="space-y-5">
      <PageHeader
        back={<Link href={`${base}/donations`} className="font-semibold text-muted hover:text-brand">← Donations</Link>}
        title={formatRand(g.amountCents)}
        intro={<span className="inline-flex flex-wrap items-center gap-2"><Badge tone={st.tone}>{st.label}</Badge>from {d.name} on {formatDate(g.paidAt)}</span>}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Donation">
          <dl>
            <Detail label="Amount">{formatRand(g.amountCents)}</Detail>
            <Detail label="Date">{formatDate(g.paidAt)}</Detail>
            <Detail label="Status">{st.label}</Detail>
            <Detail label="For">{campaignTitle(data, g.campaignId)}</Detail>
            <Detail label="Kind">{g.recurringId ? "Monthly donation" : "Once-off"}</Detail>
            <Detail label="Came from">{fromLabel(g)}</Detail>
            <Detail label="s18A receipt">{g.wants18a ? "Asked for one" : "Not asked for"}</Detail>
            <Detail label="Reference">GZ-{g.id.replace("demo-g", "").padStart(6, "0")}</Detail>
          </dl>
        </Card>
        <Card lights title="Donor">
          <Link href={`${base}/donors/${d.id}`} className={rowLink}>
            <span className="flex min-w-0 items-center gap-3"><Avatar name={d.name} i={0} /><span className="min-w-0"><span className="block truncate font-semibold text-indigo group-hover:text-brand">{d.name}</span><span className="block truncate text-xs text-muted">{d.email}</span></span></span>
            <span className="shrink-0 text-sm font-semibold text-brand">Open <span aria-hidden>→</span></span>
          </Link>
        </Card>
      </div>
    </div>
  );
}

// Donors -----------------------------------------------------------------------------------------------------

export function DemoDonors({ data, sp }: { data: DemoData; sp: Params }) {
  const groups = donorGroupsFor(DEMO_LAPSED_DAYS);
  const group = groups.some((g) => g.key === one(sp.group)) ? one(sp.group) : "";
  const q = one(sp.q).trim().toLowerCase().slice(0, 60);
  const monthlyIds = new Set(data.monthly.filter((m) => m.status === "active").map((m) => m.email));
  const facts = donorFacts(data).sort((a, b) => b.last_paid_at.localeCompare(a.last_paid_at));
  const rows = facts.filter((f) => (!group || donorGroup(f, data.now, DEMO_LAPSED_DAYS) === group) && (!q || f.display_name.toLowerCase().includes(q) || f.email.includes(q)));
  const href = (g: string) => `${base}/donors${g ? `?group=${g}` : ""}`;
  return (
    <div className="space-y-5">
      <PageHeader title="Donors" intro="Everyone who has given to you, most recent first. Open a donor for their gifts." actions={<ActionLink href={`${base}/email-donors`}>Email donors</ActionLink>} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs label="Donor groups" items={[{ href: href(""), label: "All", active: !group, count: facts.length }, ...groups.map((g) => ({ href: href(g.key), label: g.label, active: group === g.key, count: facts.filter((f) => donorGroup(f, data.now, DEMO_LAPSED_DAYS) === g.key).length }))]} />
        <form action={`${base}/donors`} method="get" className="flex gap-2">
          {group ? <input type="hidden" name="group" value={group} /> : null}
          <label htmlFor="demo-donor-q" className="sr-only">Search donors</label>
          <input id="demo-donor-q" name="q" defaultValue={one(sp.q)} placeholder="Search name or email" className={`${field} w-56`} />
          <button className={blueAction}>Search</button>
        </form>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No matches" action={<ActionLink href={`${base}/donors`}>Show every donor</ActionLink>}>No donors match. Try another name or group.</EmptyState>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {rows.map((f, i) => (
              <li key={f.donor_id}>
                <Link href={`${base}/donors/${f.donor_id}`} className={rowLink}>
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar name={f.display_name} i={i} />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-indigo group-hover:text-brand group-hover:underline">{f.display_name}</span>
                      <span className="block truncate text-xs text-muted">{plural(f.donation_count, "donation")} · last {formatDate(f.last_paid_at)}</span>
                    </span>
                    {monthlyIds.has(f.email) ? <Badge tone="success">Gives monthly</Badge> : null}
                  </span>
                  <span className="shrink-0 font-display text-lg font-bold tabular-nums">{formatRand(f.total_cents)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

export function DemoDonor({ data, id }: { data: DemoData; id: string }) {
  const d = data.donor(id);
  const gifts = data.gifts.filter((g) => g.donorId === id);
  if (!d || gifts.length === 0) return <DemoMissing what="donor" back={`${base}/donors`} backLabel="Donors" />;
  const paid = gifts.filter((g) => g.status === "paid");
  const largest = [...paid].sort((a, b) => b.amountCents - a.amountCents)[0];
  const monthly = data.monthly.find((m) => m.email === d.email);
  return (
    <div className="space-y-5">
      <PageHeader
        back={<Link href={`${base}/donors`} className="font-semibold text-muted hover:text-brand">← Donors</Link>}
        title={d.name}
        intro={<span className="inline-flex flex-wrap items-center gap-2">{d.email}{monthly ? <Badge tone={monthly.status === "active" ? "success" : "neutral"}>{monthlyStateLabel[monthlyState(monthly)].label}</Badge> : null}{d.wants18a ? <Badge tone="brand">Asks for s18A receipts</Badge> : null}</span>}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat strong label="Given in all" value={formatRand(sum(paid))} note={plural(paid.length, "donation")} />
        <MiniStat label="First gift" value={formatDate(paid[paid.length - 1]?.paidAt ?? gifts[0].paidAt)} />
        <MiniStat label="Latest gift" value={formatDate(paid[0]?.paidAt ?? gifts[0].paidAt)} />
        <MiniStat label="Largest gift" value={largest ? formatRand(largest.amountCents) : "None"} note={largest ? formatDate(largest.paidAt) : undefined} />
      </div>
      <Card lights title="Gifts">
        <ul className="divide-y divide-border">
          {gifts.map((g) => {
            const st = donationStatus[g.status];
            return (
              <li key={g.id}>
                <Link href={`${base}/donations/${g.id}`} className={rowLink}>
                  <span className="min-w-0">
                    <span className="block font-semibold tabular-nums group-hover:text-brand">{formatDate(g.paidAt)}</span>
                    <span className="block truncate text-xs text-muted">{campaignTitle(data, g.campaignId)}{g.recurringId ? " · Monthly donation" : ""} · {fromLabel(g)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">{g.status !== "paid" ? <Badge tone={st.tone}>{st.label}</Badge> : null}<span className="font-semibold tabular-nums">{formatRand(g.amountCents)}</span></span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

// Monthly donations ------------------------------------------------------------------------------------------

export function DemoMonthly({ data, sp }: { data: DemoData; sp: Params }) {
  const show = ["running", "paused", "ended"].includes(one(sp.show)) ? one(sp.show) : "running";
  const of = (s: string) => data.monthly.filter((m) => (s === "running" ? m.status === "active" : s === "paused" ? m.status === "paused" : m.status === "cancelled" || m.status === "failed"));
  const running = of("running");
  const rows = of(show);
  const donorId = (email: string | null) => data.donors.find((d) => d.email === email)?.id;
  return (
    <div className="space-y-5">
      <PageHeader title="Monthly donations" intro="Donors who give every month. A declined card is tried again automatically, and the donor is asked to update it." />
      <div className="grid gap-3 sm:grid-cols-2">
        <MiniStat strong label="Running" value={formatRand(running.reduce((t, m) => t + m.amount_cents, 0))} note={`a month, from ${plural(running.length, "monthly donor")}`} />
        <MiniStat label="Collected so far" value={formatRand(data.monthly.reduce((t, m) => t + m.paid_cents, 0))} note={plural(data.monthly.reduce((t, m) => t + m.paid_count, 0), "monthly payment")} />
      </div>
      <Tabs label="Show" items={[["running", "Running"], ["paused", "Paused"], ["ended", "Ended"]].map(([k, l]) => ({ href: `${base}/monthly?show=${k}`, label: l, active: show === k, count: of(k).length }))} />
      {rows.length === 0 ? (
        <EmptyState title="None here">No monthly donations in this list.</EmptyState>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {rows.map((m, i) => {
              const state = monthlyStateLabel[monthlyState(m)];
              const id = donorId(m.email);
              return (
                <li key={m.recurring_id}>
                  <Link href={id ? `${base}/donors/${id}` : `${base}/donors`} className={rowLink}>
                    <span className="flex min-w-0 items-center gap-3">
                      <Avatar name={m.display_name ?? "Donor"} i={i} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-indigo group-hover:text-brand group-hover:underline">{m.display_name}</span>
                        <span className="block text-xs text-muted">
                          Since {formatDate(m.started_at)} · {plural(m.paid_count, "payment")}
                          {m.status === "active" && chargeDayLabel(m.charge_day) ? ` · on ${chargeDayLabel(m.charge_day)}` : ""}
                        </span>
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-display text-lg font-bold tabular-nums">{formatRand(m.amount_cents)}</span>
                      <Badge tone={state.tone}>{state.label}</Badge>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

// Campaigns --------------------------------------------------------------------------------------------------

export function DemoCampaigns({ data }: { data: DemoData }) {
  return (
    <div className="space-y-5">
      <PageHeader title="Campaigns" intro="Raise for something specific with a goal. Donors see how close you are." actions={<ActionLink href={`${base}/campaigns#start`} primary>Start a campaign</ActionLink>} />
      <Card lights title="Running now">
        <ul className="space-y-4">
          {data.campaigns.map((c) => (
            <GoalRing
              key={c.id}
              percent={progressPercent(c.raisedCents, c.targetCents)}
              title={c.title}
              line={`${formatRand(c.raisedCents)} of ${formatRand(c.targetCents)} · ${plural(c.giftCount, "gift")} · ends ${formatDate(c.endsAt)}`}
              href={`${base}/donations?campaign=${c.id}&status=paid`}
            />
          ))}
        </ul>
      </Card>
      <p id="start" className="text-sm text-muted">In the real dashboard you start a campaign here with a title, a goal in Rand and an end date. The demo doesn&apos;t save anything.</p>
    </div>
  );
}

// s18A receipts ----------------------------------------------------------------------------------------------

export function DemoReceipts({ data }: { data: DemoData }) {
  const ty = taxYearFor(data.now);
  const { start, end } = taxYearRange(ty);
  const asked = data.gifts.filter((g) => g.status === "paid" && g.wants18a && saDay(g.paidAt) >= start && saDay(g.paidAt) <= end);
  const byDonor = new Map<string, DemoGift[]>();
  for (const g of asked) byDonor.set(g.donorId, [...(byDonor.get(g.donorId) ?? []), g]);
  const rows = [...byDonor.entries()].map(([id, gs]) => ({ d: data.donor(id)!, gs, total: sum(gs) })).sort((a, b) => b.total - a.total);
  return (
    <div className="space-y-5">
      <PageHeader title="s18A receipts" intro={`For the ${taxYearName(ty)} tax year. Receipts are issued after the tax year ends on ${formatDate(`${end}T12:00:00+02:00`)}, once you have checked and approved the yearly list.`} />
      <div className="grid gap-3 sm:grid-cols-2">
        <MiniStat strong label="Asked for an s18A receipt" value={formatRand(sum(asked))} note={plural(asked.length, "donation")} />
        <MiniStat label="Donors to receive one" value={String(rows.length)} note="One receipt each for the tax year" />
      </div>
      <Card lights title="Yearly list (draft)">
        <ul className="divide-y divide-border">
          {rows.map((r, i) => (
            <li key={r.d.id}>
              <Link href={`${base}/donors/${r.d.id}`} className={rowLink}>
                <span className="flex min-w-0 items-center gap-3"><Avatar name={r.d.name} i={i} /><span className="min-w-0"><span className="block truncate font-semibold group-hover:text-brand">{r.d.name}</span><span className="block text-xs text-muted">{plural(r.gs.length, "donation")}</span></span></span>
                <span className="shrink-0 font-semibold tabular-nums">{formatRand(r.total)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// Annual report ----------------------------------------------------------------------------------------------

export function DemoReport({ data, sp }: { data: DemoData; sp: Params }) {
  const current = taxYearFor(data.now);
  const years = [current, current - 1];
  const ty = years.includes(Number(one(sp.year))) ? Number(one(sp.year)) : current;
  const { start, end } = taxYearRange(ty);
  const paid = data.gifts.filter((g) => g.status === "paid" && saDay(g.paidAt) >= start && saDay(g.paidAt) <= end);
  const months = [...new Set(paid.map((g) => monthOf(g.paidAt)))].sort();
  return (
    <div className="space-y-5">
      <PageHeader title="Annual report" intro={`What came in during the ${taxYearName(ty)} tax year (${formatDate(`${start}T12:00:00+02:00`)} to ${formatDate(`${end}T12:00:00+02:00`)}).`} />
      <Tabs label="Tax year" items={years.map((y) => ({ href: `${base}/report?year=${y}`, label: taxYearName(y), active: y === ty }))} />
      {paid.length === 0 ? (
        <EmptyState title="Nothing in this tax year">No paid donations fall in this tax year in the demo.</EmptyState>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniStat strong label="Received" value={formatRand(sum(paid))} note={plural(paid.length, "donation")} />
            <MiniStat label="Donors" value={String(new Set(paid.map((g) => g.donorId)).size)} />
            <MiniStat label="Monthly donations" value={formatRand(sum(paid.filter((g) => g.recurringId)))} />
          </div>
          <Card title="Month by month">
            <div className={table.wrap}>
              <table className={table.table}>
                <thead><tr className={table.headRow}><th className={table.th}>Month</th><th className={table.th}>Donations</th><th className={`${table.th} text-right`}>Received</th></tr></thead>
                <tbody>
                  {months.map((m) => {
                    const gs = paid.filter((g) => monthOf(g.paidAt) === m);
                    const last = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
                    return (
                      <tr key={m} className={`${table.row} relative`}>
                        <td className={table.td}><Link href={`${base}/donations?status=paid&period=custom&from=${m}-01&to=${m}-${String(last).padStart(2, "0")}`} className="font-semibold text-brand underline-offset-4 after:absolute after:inset-0 hover:underline">{m.slice(5, 7)}/{m.slice(0, 4)}</Link></td>
                        <td className={`${table.td} tabular-nums`}>{gs.length}</td>
                        <td className={table.num}>{formatRand(sum(gs))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// Pages the demo describes rather than shows --------------------------------------------------------------------

const ABOUT: Record<string, { title: string; lines: string[] }> = {
  "thank-donors": { title: "Thank donors", lines: ["Write a short personal thank-you and send it to new donors in one go.", "Each donor gets it once; you see who has been thanked."] },
  "email-donors": { title: "Email donors", lines: ["Send an update or an appeal to a group of donors: new, coming back, lapsed, or a tag you chose.", "Every email carries an unsubscribe link, and you see who it goes to before it is sent."] },
  team: { title: "Team", lines: ["Invite the people who help run your charity, as owners or admins.", "Each person signs in with their own email and a second step."] },
  profile: { title: "Public profile", lines: ["Your name, story, photos, causes and suggested amounts, as donors see them on Givezy.", "Changes show on your public page as soon as you save them."] },
  updates: { title: "Photos and updates", lines: ["Post short updates with a photo to show donors what their gifts did.", "You can email an update to your donors too."] },
  application: { title: "Application", lines: ["Your registration details, documents and bank details, checked by Givezy before you can take donations."] },
  poster: { title: "QR poster", lines: ["A printable poster with your own QR code for notice boards and events.", "Gifts that come from it are counted under QR poster."] },
  "website-button": { title: "Website button", lines: ["A \"Give with Givezy\" button to paste into your own website, with a live preview.", "Gifts that come from it are counted under Website button."] },
  "donations/record": { title: "Record a gift", lines: ["Add an EFT, cash or other gift that didn't come through Givezy, so it counts in your figures and s18A receipts."] },
  "donations/import": { title: "Import from a file", lines: ["Bring in donors and gifts from a spreadsheet: check the file first, then import."] },
  "donations/deposits": { title: "Deposits", lines: ["Each payout into your bank account, with the gifts it is made of, for your bookkeeper.", "Every deposit is checked so the lines add up to what reached the bank."] },
};

export function DemoAbout({ path }: { path: string }) {
  const about = Object.hasOwn(ABOUT, path) ? ABOUT[path] : undefined;
  return (
    <div className="space-y-5">
      <PageHeader
        title={about?.title ?? "Not in the demo"}
        back={path.startsWith("donations/")
          ? <Link href={`${base}/donations`} className="font-semibold text-muted hover:text-brand">← Donations</Link>
          : <Link href={base} className="font-semibold text-muted hover:text-brand">← Overview</Link>}
      />
      <Card title="What this page does">
        {about ? (
          <ul className="list-disc space-y-1.5 pl-5 text-sm">{about.lines.map((l) => <li key={l}>{l}</li>)}</ul>
        ) : (
          <p className="text-sm">This page isn&apos;t part of the demonstration.</p>
        )}
        <p className="mt-4 text-sm text-muted">In the demo nothing is saved or sent, so this page is described rather than shown.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <ActionLink href={base}>Back to the Overview</ActionLink>
          <ActionLink href={`${base}/donations`}>See donations</ActionLink>
        </div>
      </Card>
    </div>
  );
}

export function DemoMissing({ what, back, backLabel }: { what: string; back: string; backLabel: string }) {
  return (
    <div className="space-y-5">
      <PageHeader title={`No such ${what}`} back={<Link href={back} className="font-semibold text-muted hover:text-brand">← {backLabel}</Link>} />
      <EmptyState title={`No such ${what} in the demo`} action={<ActionLink href={back}>Back to {backLabel}</ActionLink>}>It may have been an old link. Everything in the demo is made up.</EmptyState>
    </div>
  );
}
