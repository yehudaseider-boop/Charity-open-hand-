"use client";

/**
 * Follow up: thank-yous and win-backs. Givezy writes a draft; the charity reads it, edits it and
 * sends it from its own email. Nothing is ever sent from here.
 */
import { useEffect, useMemo, useState } from "react";
import { taxYearFor, taxYearRange } from "@/lib/dates";
import { FOLLOW_UP_LARGE_DAYS, FOLLOW_UP_NEW_DAYS } from "../data/demo-config";
import { showDay } from "../data/day";
import { donorStats, followUps, type FollowUpKind, type FollowUpRow } from "../data/selectors";
import type { DemoDataset } from "../data/types";
import { usePortal } from "../store";
import { count, rand } from "../ui/format";
import { TextArea, TextInput } from "../ui/form";
import { Icon } from "../ui/icons";
import { Modal } from "../ui/overlay";
import { Avatar, Badge, Button, Callout, Card, cx, EmptyState } from "../ui/primitives";
import { campaignName, useLookups } from "./common";

const TABS: { id: FollowUpKind; label: string; hint: string }[] = [
  { id: "new", label: "Welcome new donors", hint: `Gave for the first time in the last ${FOLLOW_UP_NEW_DAYS} days. A thank-you in the first week is what turns one donation into two.` },
  { id: "large", label: "Thank large donors", hint: `Large donations in the last ${FOLLOW_UP_LARGE_DAYS} days. The amount comes from Notifications in Settings.` },
  { id: "checkin", label: "Check in: giving less", hint: "Donors in the Decreasing group: they used to give most months and now give less often. A personal note now, before they stop, is the best chance to keep them." },
  { id: "winback", label: "Win back inactive donors", hint: "Donors in the Inactive group who gave more than once: no donation in the last 6 months." },
];

export function isFollowUpKind(v: string | null): v is FollowUpKind {
  return v === "new" || v === "large" || v === "checkin" || v === "winback";
}

export function FollowUpPanel({ data, initialTab }: { data: DemoDataset; initialTab: FollowUpKind | null }) {
  const { largeDonationCents, overrides, markHandled, toast } = usePortal();
  const lookups = useLookups(data);
  const [tab, setTab] = useState<FollowUpKind>(initialTab ?? "new");
  const [appliedTab, setAppliedTab] = useState(initialTab);
  if (initialTab !== appliedTab) {
    setAppliedTab(initialTab);
    if (initialTab) setTab(initialTab);
  }
  const [hideDone, setHideDone] = useState(true);
  const [open, setOpen] = useState<FollowUpRow | null>(null);
  const handled = overrides.followUps ?? {};

  const lists = useMemo(() => followUps(data, largeDonationCents, donorStats(data)), [data, largeDonationCents]);
  const all = lists[tab];
  const rows = hideDone ? all.filter((r) => !handled[r.key]) : all;
  const visible = rows.slice(0, 40);
  const doneCount = all.filter((r) => handled[r.key]).length;
  const meta = TABS.find((t) => t.id === tab)!;

  return (
    <div className="space-y-5">
      <Callout tone="info" title="You write and send, Givezy drafts">
        Each draft opens in your own email, ready to edit. Givezy never sends anything to your donors, and you see only what a donor chose to share with you.
      </Callout>

      <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label="Follow-up lists">
        {TABS.map((t) => {
          const left = lists[t.id].filter((r) => !handled[r.key]).length;
          return (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cx("min-h-11 shrink-0 rounded-2xl border px-4 text-left text-sm", tab === t.id ? "border-gz-blue bg-gz-blue text-white" : "border-gz-hairline bg-gz-surface hover:border-gz-blue/40")}>
              <span className="block font-semibold">{t.label}</span>
              <span className={cx("block text-xs", tab === t.id ? "text-white/80" : "text-gz-muted")}>{count(left)} to do</span>
            </button>
          );
        })}
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-2xl text-sm text-gz-muted">{meta.hint}</p>
          {doneCount > 0 && (
            <button type="button" onClick={() => setHideDone((h) => !h)} className="min-h-9 rounded-full px-3 text-sm font-semibold text-gz-blue hover:bg-gz-blue-soft/60">
              {hideDone ? `Show ${count(doneCount)} done` : "Hide done"}
            </button>
          )}
        </div>
        {(tab === "winback" || tab === "checkin") && (tab === "winback" ? lists.winbackHiddenNoConsent : lists.checkinHiddenNoConsent) > 0 && (
          <p className="mb-3 flex gap-2 rounded-2xl bg-gz-neutral-soft p-3 text-xs text-gz-muted">
            <Icon name="lock" size={14} className="mt-0.5 shrink-0" />
            {count(tab === "winback" ? lists.winbackHiddenNoConsent : lists.checkinHiddenNoConsent)} more donors are not listed because they did not agree to hear about appeals. Thank-you messages do not need that agreement.
          </p>
        )}        {rows.length ? (
          <ul className="divide-y divide-gz-hairline">
            {visible.map((r) => {
              const done = handled[r.key];
              return (
                <li key={r.key} className="flex flex-wrap items-center gap-3 py-3">
                  <Avatar name={r.donor.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {r.donor.name}
                      {r.donor.anyAnonymous && <Icon name="eyeOff" size={14} className="text-gz-muted" label="Asked to be anonymous in public" />}
                      {done && <Badge tone="success">Done {showDay(done)}</Badge>}
                    </p>
                    <p className="text-sm text-gz-muted">{describe(r, data, lookups.campaign)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {done ? (
                      <Button variant="ghost" size="sm" onClick={() => markHandled([r.key], false)}>
                        Undo
                      </Button>
                    ) : (
                      <Button variant="soft" size="sm" icon="mail" onClick={() => setOpen(r)}>
                        Review draft
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon="check" title="Nobody is waiting" body={all.length ? "Everyone on this list is done." : tab === "large" ? "No donations of this size in the last 30 days." : "Nobody matches right now."} />
        )}
        {rows.length > 40 && <p className="mt-3 text-xs text-gz-muted">Showing the first 40 of {count(rows.length)}.</p>}
        {visible.length > 1 && hideDone && (
          <div className="mt-4 border-t border-gz-hairline pt-4">
            <Button
              variant="secondary"
              size="sm"
              icon="check"
              onClick={() => {
                markHandled(visible.map((r) => r.key), true);
                toast({ tone: "success", title: `${count(visible.length)} marked as done`, body: "Use this once you have sent them from your own email." });
              }}
            >
              Mark these {count(visible.length)} as done
            </Button>
          </div>
        )}
      </Card>

      {open && <DraftModal row={open} data={data} onClose={() => setOpen(null)} />}
    </div>
  );
}

function describe(r: FollowUpRow, data: DemoDataset, campaigns: ReturnType<typeof useLookups>["campaign"]): string {
  if (r.kind === "winback" || r.kind === "checkin") return `${count(r.donor.giftCount)} donations, last on ${showDay(r.day)}, usually ${rand(r.amountCents)}${r.kind === "checkin" ? ` · gave in ${r.donor.recentWindows} of the last 6 months` : ""}`;
  return `${rand(r.amountCents)} to ${campaignName(r.campaignId, campaigns)} on ${showDay(r.day)}${r.kind === "new" ? " · first donation" : ""}${r.wants18a && data.charity.s18a ? " · wants s18A" : ""}`;
}

export function buildDraft(r: FollowUpRow, data: DemoDataset, campaigns: ReturnType<typeof useLookups>["campaign"]): { subject: string; body: string } {
  const charity = data.charity;
  const sender = data.team.find((m) => m.role === "owner")?.name ?? charity.shortName;
  const first = r.donor.firstName;
  const forCampaign = r.campaignId ? ` to ${campaignName(r.campaignId, campaigns)}` : "";
  const yearEnd = showDay(taxYearRange(taxYearFor(`${r.day}T12:00:00Z`)).end);
  const s18a = charity.s18a && r.wants18a ? `\n\nYou asked for an s18A receipt. We issue one receipt for the whole tax year once it closes on ${yearEnd}, so please keep an eye out for it.` : "";
  const sign = `With thanks,\n${sender}\n${charity.name}`;
  if (r.kind === "new") {
    return {
      subject: `Thank you for your first donation to ${charity.shortName}`,
      body: `Dear ${first},\n\nThank you for your donation of ${rand(r.amountCents)} on ${showDay(r.day)}${forCampaign}. It is the first time you have given to ${charity.name}, and it means a great deal to us.${s18a}\n\nIf you would like to hear how donations are used, please reply to this email or call us on ${charity.contactPhone}.\n\n${sign}`,
    };
  }
  if (r.kind === "large") {
    return {
      subject: `Thank you for your generous donation`,
      body: `Dear ${first},\n\nThank you for your donation of ${rand(r.amountCents)} on ${showDay(r.day)}${forCampaign}. A gift of this size makes a real difference to the work of ${charity.name}, and we wanted to thank you personally.${s18a}\n\nIf you would like to hear how it is being used, please reply and we will gladly arrange it.\n\n${sign}`,
    };
  }
  if (r.kind === "checkin") {
    return {
      subject: `A note of thanks from ${charity.shortName}`,
      body: `Dear ${first},\n\nThank you for giving to ${charity.name} so faithfully over the past year. Your donations, most recently on ${showDay(r.day)}, have made a real difference.\n\nWe wanted to check in and share what is happening here. If anything has changed for you, we understand completely. If you would like to keep giving, a donation like your usual ${rand(r.amountCents)} would help us plan ahead.\n\nIf you would rather not hear from us, just reply and we will stop.\n\n${sign}`,
    };
  }
  return {
    subject: `We have missed you at ${charity.shortName}`,
    body: `Dear ${first},\n\nYou have given to ${charity.name} ${count(r.donor.giftCount)} times, most recently on ${showDay(r.day)}, and we are grateful for every one of those donations.\n\nWe would like to share what your support has helped us do, and to ask whether you would give again. A donation similar to your usual ${rand(r.amountCents)} would help us plan ahead, and any amount is welcome.\n\nIf you would rather not hear from us, just reply and we will stop.\n\n${sign}`,
  };
}

function DraftModal({ row, data, onClose }: { row: FollowUpRow; data: DemoDataset; onClose: () => void }) {
  const { markHandled, toast } = usePortal();
  const lookups = useLookups(data);
  const initial = useMemo(() => buildDraft(row, data, lookups.campaign), [row, data, lookups.campaign]);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the editable draft when another person is opened
    setSubject(initial.subject);
    setBody(initial.body);
  }, [initial]);
  const edited = subject !== initial.subject || body !== initial.body;
  const kindLabel = row.kind === "winback" ? "Win-back" : row.kind === "checkin" ? "Check-in" : row.kind === "large" ? "Thank-you for a large donation" : "Welcome";
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Draft for ${row.donor.name}`}
      description={`${kindLabel}. A draft only: edit it, then send it from your own email.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {edited && (
            <Button variant="ghost" onClick={() => { setSubject(initial.subject); setBody(initial.body); }}>
              Reset wording
            </Button>
          )}
          <Button
            variant="secondary"
            icon="copy"
            onClick={() => {
              navigator.clipboard?.writeText(`${subject}\n\n${body}`).catch(() => undefined);
              toast({ tone: "success", title: "Draft copied", body: "Nothing was sent." });
            }}
          >
            Copy
          </Button>
          <a href={`mailto:${row.donor.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gz-blue px-5 text-[15px] font-semibold text-white hover:bg-gz-blue-hover">
            <Icon name="mail" size={18} /> Open in email
          </a>
          <Button
            variant="soft"
            icon="check"
            onClick={() => {
              markHandled([row.key], true);
              toast({ tone: "success", title: `${row.donor.name} marked as done` });
              onClose();
            }}
          >
            Mark as done
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm"><span className="text-gz-muted">To:</span> {row.donor.email}</p>
        <TextInput label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <TextArea label="Message" value={body} onChange={(e) => setBody(e.target.value)} className="min-h-72 font-sans leading-relaxed" />
        {(row.kind === "winback" || row.kind === "checkin") && <Callout tone="neutral" title="This is an appeal">This donor agreed to hear about appeals, and the draft says how to stop. Keep that line in.</Callout>}
      </div>
    </Modal>
  );
}
