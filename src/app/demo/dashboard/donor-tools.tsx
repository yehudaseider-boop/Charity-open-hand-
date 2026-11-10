"use client";

import { Card, Notice } from "@/components/card";
import { PageHeader } from "@/components/dash";
import { ThankYouForm } from "@/app/charity-admin/[id]/thank-donors/forms";
import { AppealForm } from "@/app/charity-admin/[id]/email-donors/forms";
import type { AppealCheck } from "@/app/charity-admin/[id]/email-donors/actions";
import { APPEALS_PER_MONTH, checkAppeal } from "@/lib/charity/appeals-rules";
import type { FormState } from "@/lib/form";
import { demoId, demoNow, pause, useDemo } from "./store";

/**
 * Thank donors and Email donors in the public demo: the real dashboard's own forms, with actions that keep what is
 * "sent" in this visitor's browser. Nobody is emailed. Each result says so.
 */

const NOT_SENT = "In this demo nothing was emailed.";

type Thanked = { id: string; month: string; label: string; body: string; at: string; count: number };

export function DemoThankDonors({ months, sampleName }: { months: { month: string; label: string; count: number }[]; sampleName: string }) {
  const [sent, setSent] = useDemo<Thanked[]>("thank-yous", []);
  const done = new Set(sent.map((s) => s.month));
  const open = months.filter((m) => !done.has(m.month));

  const sendFor = (m: { month: string; label: string; count: number }) => async (_: FormState, f: FormData): Promise<FormState> => {
    const body = String(f.get("body") ?? "").trim();
    if (body.length < 10) return { ok: false, fieldErrors: { body: "Write your thank-you: a few sentences is enough" } };
    if (body.length > 1000) return { ok: false, fieldErrors: { body: "Keep it to 1 000 characters or fewer" } };
    await pause();
    setSent([{ id: demoId(), month: m.month, label: m.label, body, at: demoNow(), count: m.count }, ...sent]);
    return { ok: true, message: `Sent to ${m.count} ${m.count === 1 ? "donor" : "donors"}. ${NOT_SENT}` };
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Thank donors"
        intro={
          <>
            A short thank-you is the biggest reason people give again. Write it once and we email it to everyone who gave that month,
            with their first name. You don&apos;t need their addresses, and they can stop these emails at any time. One thank-you per month.
          </>
        }
      />
      <Notice>Each donor sees &quot;Dear&quot; and their own first name, for example &quot;Dear {sampleName}&quot;, then your words, then your charity&apos;s name and a link to stop these emails.</Notice>

      {open.map((m) => (
        <Card key={m.month} title={`${m.label}: ${m.count} ${m.count === 1 ? "donor" : "donors"}`}>
          {m.count ? (
            <ThankYouForm
              action={sendFor(m)}
              defaultBody=""
              confirm={`Email this thank-you to ${m.count} ${m.count === 1 ? "donor" : "donors"} who gave in ${m.label}? Once sent it can't be taken back, and you can only send one for this month${m.month === months[0]?.month ? ". The month isn't over: people who give later this month won't get it" : ""}.`}
            />
          ) : (
            <p className="rounded-control border-2 border-dashed border-honey bg-honey-soft/60 p-4 text-sm text-muted">Nobody to thank for this month yet.</p>
          )}
        </Card>
      ))}

      {sent.length ? (
        <Card title="Sent">
          <ul className="-mb-3 divide-y divide-border text-sm">
            {sent.map((r) => (
              <li key={r.id} className="space-y-1 py-3">
                <p className="font-semibold text-navy">
                  <span className="font-display text-base font-bold text-indigo">{r.label}</span> <span className="font-normal text-muted">· sent {r.at} to {r.count} {r.count === 1 ? "donor" : "donors"} (demo, not emailed)</span>
                </p>
                <p className="whitespace-pre-line rounded-control bg-honey-soft p-3 text-muted [overflow-wrap:anywhere]">{r.body}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

type Appeal = { id: string; subject: string; label: string; at: string; sent: number; skipped: number };
type Audience = { value: string; label: string; count: number; stopped: number };

export function DemoEmailDonors({ audiences, groups }: { audiences: Audience[]; groups: { group: string; values: string[] }[] }) {
  const [appeals, setAppeals] = useDemo<Appeal[]>("appeals", []);
  const byValue = new Map(audiences.map((a) => [a.value, a]));
  const options = groups.map((g) => ({ group: g.group, options: g.values.map((v) => ({ value: v, label: byValue.get(v)?.label ?? v })) }));

  const check = async (_: AppealCheck, f: FormData): Promise<AppealCheck> => {
    const typed = checkAppeal({ subject: f.get("subject"), body: f.get("body") });
    if (!typed.ok) return { state: "refused", message: "A few things to fix before checking. Nothing was sent.", fieldErrors: typed.fieldErrors };
    const a = byValue.get(String(f.get("audience") ?? ""));
    if (!a) return { state: "refused", message: "Choose who it goes to.", fieldErrors: { audience: "Choose who it goes to" } };
    await pause(400);
    return { state: "checked", count: a.count, stopped: a.stopped, thisWeek: 0, recordedOnly: 0, label: a.label, fingerprint: `${a.value}|${typed.subject}|${typed.body.length}` };
  };
  const test = async (): Promise<FormState> => {
    await pause();
    return { ok: true, message: `A test would go to your own email address. ${NOT_SENT}` };
  };
  const send = async (_: FormState, f: FormData): Promise<FormState> => {
    const typed = checkAppeal({ subject: f.get("subject"), body: f.get("body") });
    const a = byValue.get(String(f.get("audience") ?? ""));
    if (!typed.ok || !a) return { ok: false, message: "Something changed since you checked. Nothing was sent. Check who it goes to again." };
    await pause(900);
    setAppeals([{ id: demoId(), subject: typed.subject, label: a.label, at: demoNow(), sent: a.count, skipped: a.stopped }, ...appeals]);
    return { ok: true, message: `Sent to ${a.count} ${a.count === 1 ? "donor" : "donors"}. ${NOT_SENT}` };
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Email donors"
        intro="Send your donors news or an appeal. Givezy sends it for you, so you never handle their addresses. Replies go to your charity's email address. Donors who asked not to get emails are always left out, and nobody gets more than 4 from you in a month."
      />
      <Card title="Write an email">
        {appeals.length ? <p className="mb-3 text-sm text-muted">You&apos;ve sent {appeals.length} {appeals.length === 1 ? "email" : "emails"} in this demo.</p> : null}
        <AppealForm check={check} test={test} send={send} audiences={options} initialAudience="all" />
      </Card>

      <Card title="Sent">
        {appeals.length === 0 ? (
          <p className="rounded-control border-2 border-dashed border-honey bg-honey-soft/60 p-4 text-sm text-muted">Nothing sent yet. Your emails appear here, with how many went out.</p>
        ) : (
          <ul className="-mb-3 divide-y divide-border text-sm">
            {appeals.map((a) => (
              <li key={a.id} className="space-y-1 py-3">
                <p className="font-display text-base font-bold text-indigo [overflow-wrap:anywhere]">{a.subject}</p>
                <p className="text-xs text-muted [overflow-wrap:anywhere]">{a.at} · {a.label}</p>
                <p className="text-xs font-semibold tabular-nums text-navy">{a.sent} sent{a.skipped ? `, ${a.skipped} left out` : ""} (demo, not emailed)</p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 border-t border-border pt-3 text-xs text-muted">&quot;Left out&quot; means they asked not to get emails since, already had {APPEALS_PER_MONTH} from you this month, or email isn&apos;t switched on here.</p>
      </Card>
    </div>
  );
}
