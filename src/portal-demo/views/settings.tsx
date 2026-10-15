"use client";

import { useState, type ReactNode } from "react";
import { DEMO_PAYOUT_SCHEDULE } from "../data/demo-config";
import type { DemoDataset, TeamMember, TeamRole } from "../data/types";
import { DEFAULT_BRANDING, DEFAULT_NOTIFICATIONS, DEFAULT_SECURITY, usePortal, type BrandingPrefs, type NotificationPrefs, type SecurityPrefs } from "../store";
import { dateTime } from "../ui/format";
import { Select, TextArea, TextInput, Toggle } from "../ui/form";
import { Icon, type IconName } from "../ui/icons";
import { ConfirmDialog, Modal } from "../ui/overlay";
import { Avatar, Badge, Button, Callout, Card, CardHeader, cx, DetailList, PageHeader, type Tone } from "../ui/primitives";
import { Loaded, useQueryParam } from "./common";

const TABS = [
  { id: "profile", label: "Charity profile", icon: "building" },
  { id: "branding", label: "Branding and logo", icon: "image" },
  { id: "notifications", label: "Notifications", icon: "bell" },
  { id: "team", label: "Team members", icon: "users" },
  { id: "roles", label: "Role permissions", icon: "lock" },
  { id: "verification", label: "Verification", icon: "shield" },
  { id: "payouts", label: "Payment and payouts", icon: "bank" },
  { id: "security", label: "Security", icon: "lock" },
] as const satisfies readonly { id: string; label: string; icon: IconName }[];

type TabId = (typeof TABS)[number]["id"];

export function SettingsView() {
  return <Loaded>{(data) => <Settings data={data} />}</Loaded>;
}

function Settings({ data }: { data: DemoDataset }) {
  const [tab, setTab] = useState<TabId>("profile");
  const fromAddress = useQueryParam("tab");
  const [applied, setApplied] = useState(false);
  if (!applied && fromAddress && TABS.some((t) => t.id === fromAddress)) {
    setApplied(true);
    setTab(fromAddress as TabId);
  }
  return (
    <div className="gz-fade-in">
      <PageHeader title="Settings and team" subtitle="Your charity's details, look, alerts, people and security. Changes in the demo stay in this browser." />
      <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-8">
        <nav aria-label="Settings sections" className="mb-5 lg:mb-0">
          <div className="lg:hidden">
            <Select label="Settings section" hideLabel value={tab} onChange={(e) => setTab(e.target.value as TabId)} options={TABS.map((t) => ({ value: t.id, label: t.label }))} />
          </div>
          <ul className="hidden space-y-0.5 lg:block">
            {TABS.map((t) => (
              <li key={t.id}>
                <button type="button" aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)} className={cx("flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 text-left text-[15px] font-medium", tab === t.id ? "bg-gz-surface text-gz-blue shadow-gz" : "text-gz-ink hover:bg-gz-blue-soft/50")}>
                  <Icon name={t.icon} size={18} />
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-6" key={`${tab}-${data.charity.id}`}>
          {tab === "profile" && <ProfileTab data={data} />}
          {tab === "branding" && <BrandingTab data={data} />}
          {tab === "notifications" && <NotificationsTab />}
          {tab === "team" && <TeamTab data={data} />}
          {tab === "roles" && <RolesTab />}
          {tab === "verification" && <VerificationTab data={data} />}
          {tab === "payouts" && <PayoutsTab data={data} />}
          {tab === "security" && <SecurityTab data={data} />}
        </div>
      </div>
    </div>
  );
}

function SaveBar({ onSave, onReset, dirty }: { onSave: () => void; onReset?: () => void; dirty: boolean }) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-gz-hairline pt-4">
      {dirty && <span className="mr-auto text-sm text-gz-muted">Unsaved changes</span>}
      {onReset && (
        <Button variant="ghost" onClick={onReset} disabled={!dirty}>
          Undo changes
        </Button>
      )}
      <Button icon="check" onClick={onSave} disabled={!dirty}>
        Save
      </Button>
    </div>
  );
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ProfileTab({ data }: { data: DemoDataset }) {
  const { updateOverrides, toast } = usePortal();
  const c = data.charity;
  const initial = { name: c.name, shortName: c.shortName, tagline: c.tagline, contactEmail: c.contactEmail, contactPhone: c.contactPhone, city: c.city };
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof typeof initial, string>>>({});
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const set = (k: keyof typeof initial) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = () => {
    const e: typeof errors = {};
    if (form.name.trim().length < 3) e.name = "Enter the charity's public name.";
    if (!form.shortName.trim()) e.shortName = "Enter a short name for menus.";
    else if (form.shortName.length > 24) e.shortName = "Keep it to 24 characters.";
    if (!EMAIL.test(form.contactEmail)) e.contactEmail = "Enter a valid email address.";
    setErrors(e);
    if (Object.keys(e).length) return toast({ tone: "error", title: "Not saved", body: "Fix the highlighted fields." });
    updateOverrides({ profile: form });
    toast({ tone: "success", title: "Profile saved (demo)", body: "The new name shows in the menu and top bar." });
  };
  return (
    <>
      <Card>
        <CardHeader title="Public profile" subtitle="What donors see on your Givezy page." />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <TextInput label="Public name" value={form.name} onChange={set("name")} error={errors.name} />
          </div>
          <TextInput label="Short name" value={form.shortName} onChange={set("shortName")} error={errors.shortName} hint="Used in menus and on small screens." />
          <TextInput label="City" value={form.city} onChange={set("city")} />
          <div className="sm:col-span-2">
            <TextArea label="One-line description" value={form.tagline} onChange={set("tagline")} maxLength={160} hint={`${form.tagline.length} of 160 characters`} />
          </div>
          <TextInput label="Contact email" type="email" value={form.contactEmail} onChange={set("contactEmail")} error={errors.contactEmail} />
          <TextInput label="Contact phone" type="tel" value={form.contactPhone} onChange={set("contactPhone")} />
        </div>
        <SaveBar dirty={dirty} onSave={save} onReset={() => setForm(initial)} />
      </Card>
      <Card>
        <CardHeader title="Registration details" subtitle="Locked after approval. To change them, contact the Givezy team." />
        <DetailList
          items={[
            ["NPO number", c.npoNumber],
            ["PBO number", c.pboNumber ?? "None"],
            ["s18A receipts", c.s18a ? "Approved" : "Not approved"],
          ]}
        />
      </Card>
    </>
  );
}

function BrandingTab({ data }: { data: DemoDataset }) {
  const { overrides, updateOverrides, toast } = usePortal();
  const initial: BrandingPrefs = overrides.branding ?? DEFAULT_BRANDING;
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return setError("Use a PNG, JPG or WebP image.");
    if (file.size > 300_000) return setError("Keep the logo under 300 KB for the demo (it is stored in this browser).");
    const reader = new FileReader();
    reader.onload = () => {
      setError(null);
      setForm((f) => ({ ...f, logoDataUrl: String(reader.result) }));
    };
    reader.readAsDataURL(file);
  };
  const cover = { blue: "bg-gz-blue text-white", lilac: "bg-gz-lilac-soft text-gz-ink", cream: "bg-gz-cream text-gz-ink border border-gz-hairline" }[form.coverTone];
  return (
    <Card>
      <CardHeader title="Branding and logo" subtitle="How your page and thank-you screens look to donors." />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-5">
          <div>
            <p className="mb-1.5 text-sm font-semibold">Logo</p>
            <div className="flex items-center gap-4">
              {form.logoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.logoDataUrl} alt="Your logo" className="size-16 rounded-2xl object-cover" />
              ) : (
                <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-gz-blue text-xl font-semibold text-white">{data.charity.initials}</span>
              )}
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-gz-hairline bg-gz-surface px-3.5 text-sm font-semibold text-gz-blue hover:bg-gz-blue-soft/40">
                  <Icon name="upload" size={16} /> Upload
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
                </label>
                {form.logoDataUrl && (
                  <Button variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, logoDataUrl: null }))}>
                    Remove
                  </Button>
                )}
              </div>
            </div>
            {error ? <p className="mt-2 text-sm text-gz-danger" role="alert">{error}</p> : <p className="mt-2 text-xs text-gz-muted">Square, at least 256 by 256 pixels. Placeholder initials show until you add one.</p>}
          </div>
          <Select label="Page header colour" value={form.coverTone} onChange={(e) => setForm((f) => ({ ...f, coverTone: e.target.value as BrandingPrefs["coverTone"] }))} options={[{ value: "blue", label: "Givezy blue" }, { value: "lilac", label: "Soft lilac" }, { value: "cream", label: "Cream" }]} />
          <TextArea label="Thank-you message" value={form.thankYouMessage} onChange={(e) => setForm((f) => ({ ...f, thankYouMessage: e.target.value }))} maxLength={200} hint="Shown to donors after they give." />
        </div>
        <div>
          <p className="mb-1.5 text-sm font-semibold">Preview</p>
          <div className="overflow-hidden rounded-[22px] border border-gz-hairline bg-gz-surface">
            <div className={cx("flex items-center gap-3 p-5", cover)}>
              {form.logoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.logoDataUrl} alt="" className="size-12 rounded-xl object-cover" />
              ) : (
                <span className="inline-flex size-12 items-center justify-center rounded-xl bg-white/90 font-semibold text-gz-blue">{data.charity.initials}</span>
              )}
              <span>
                <span className="block font-semibold" style={{ fontFamily: "var(--font-fredoka)" }}>{data.charity.name}</span>
                <span className="block text-xs opacity-80">{data.charity.city}</span>
              </span>
            </div>
            <div className="space-y-3 p-5">
              <p className="text-sm text-gz-muted">{data.charity.tagline}</p>
              <div className="rounded-2xl bg-gz-lilac-soft p-4 text-center">
                <p className="text-sm font-semibold">{form.thankYouMessage || "Thank you."}</p>
              </div>
              <span className="inline-flex min-h-10 items-center rounded-full bg-gz-blue px-5 text-sm font-semibold text-white">Give now</span>
            </div>
          </div>
        </div>
      </div>
      <SaveBar
        dirty={dirty}
        onReset={() => setForm(initial)}
        onSave={() => {
          updateOverrides({ branding: form });
          toast({ tone: "success", title: "Branding saved (demo)", body: "Your logo now shows in the menu." });
        }}
      />
    </Card>
  );
}

function NotificationsTab() {
  const { overrides, updateOverrides, toast } = usePortal();
  const initial: NotificationPrefs = overrides.notifications ?? DEFAULT_NOTIFICATIONS;
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const t = (k: keyof NotificationPrefs) => (v: boolean) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Card>
      <CardHeader title="Notifications" subtitle="Emails to you about your charity's giving. Each team member sets their own." />
      <div className="divide-y divide-gz-hairline">
        <Toggle label="Every donation" description="An email for each donation. Busy charities usually prefer the daily summary." checked={form.everyDonation} onChange={t("everyDonation")} />
        <Toggle label="Daily summary" description="Yesterday's donations in one email, at 07:00." checked={form.dailySummary} onChange={t("dailySummary")} />
        <Toggle label="Weekly report" description="Monday morning: the week's donations, donors and campaigns." checked={form.weeklyReport} onChange={t("weeklyReport")} />
        <div>
          <Toggle label="Large donations" description="Hear straight away when a big donation comes in." checked={form.largeDonation} onChange={t("largeDonation")} />
          {form.largeDonation && (
            <div className="max-w-xs pb-3">
              <TextInput label="From this amount" prefix="R" inputMode="numeric" value={form.largeDonationRand} error={error} onChange={(e) => setForm((f) => ({ ...f, largeDonationRand: e.target.value }))} />
            </div>
          )}
        </div>
        <Toggle label="Failed monthly donations" description="When a monthly donor's payment fails." checked={form.failedMonthly} onChange={t("failedMonthly")} />
        <Toggle label="Payout sent" description="When a payout leaves for your bank account." checked={form.payoutSent} onChange={t("payoutSent")} />
        <Toggle label="Campaign goal reached" description="When a campaign reaches its goal." checked={form.campaignGoal} onChange={t("campaignGoal")} />
      </div>
      <SaveBar
        dirty={dirty}
        onReset={() => setForm(initial)}
        onSave={() => {
          if (form.largeDonation && !/^\d[\d ]*$/.test(form.largeDonationRand.trim())) {
            setError("Enter a whole Rand amount, for example 5 000.");
            return;
          }
          setError(null);
          updateOverrides({ notifications: form });
          toast({ tone: "success", title: "Notification settings saved", body: "Demo only: no emails are sent." });
        }}
      />
    </Card>
  );
}

const ROLE_LABEL: Record<TeamRole, string> = { owner: "Owner", admin: "Admin", finance: "Finance", viewer: "Viewer" };
const ROLE_TONE: Record<TeamRole, Tone> = { owner: "info", admin: "lilac", finance: "success", viewer: "neutral" };

function TeamTab({ data }: { data: DemoDataset }) {
  const { inviteMember, setMemberRole, removeMember, toast } = usePortal();
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  return (
    <>
      <Callout tone="warning" title="Design proposal">
        Decided 09/10/2026: no team invites for now, the Givezy team adds charity admins, and owners and admins see the same things. This screen shows how self-service invites and roles could look if that changes.
      </Callout>
      <Card>
        <CardHeader title="Team members" subtitle={`${data.team.length} people can sign in to this charity's portal.`} action={<Button icon="plus" onClick={() => setInviting(true)}>Invite</Button>} />
        <ul className="divide-y divide-gz-hairline">
          {data.team.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 py-3.5">
              <Avatar name={m.name} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {m.name}
                  {m.status === "invited" && <Badge tone="warning" icon="mail">Invited</Badge>}
                  {!m.twoStep && m.status === "active" && <Badge tone="danger">No two-step sign-in</Badge>}
                </p>
                <p className="truncate text-sm text-gz-muted">
                  {m.email} · {m.lastActive ? `last active ${dateTime(m.lastActive)}` : "has not signed in yet"}
                </p>
              </div>
              {m.role === "owner" ? (
                <Badge tone={ROLE_TONE.owner} icon="shield">Owner</Badge>
              ) : (
                <div className="flex items-center gap-2">
                  <Select
                    label={`Role for ${m.name}`}
                    hideLabel
                    value={m.role}
                    className="min-h-9 w-32 rounded-full text-sm"
                    onChange={(e) => {
                      setMemberRole(m.id, e.target.value as TeamRole);
                      toast({ tone: "success", title: `${m.name} is now ${ROLE_LABEL[e.target.value as TeamRole].toLowerCase()}` });
                    }}
                    options={(["admin", "finance", "viewer"] as TeamRole[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
                  />
                  <button type="button" aria-label={`Remove ${m.name}`} onClick={() => setRemoving(m)} className="inline-flex size-9 items-center justify-center rounded-full text-gz-muted hover:bg-gz-danger-soft hover:text-gz-danger">
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <InviteModal
        open={inviting}
        onClose={() => setInviting(false)}
        existing={data.team.map((m) => m.email.toLowerCase())}
        onInvite={(name, email, role) => {
          inviteMember(name, email, role);
          toast({ tone: "success", title: "Invitation added (demo)", body: `${name} shows as invited. No email was sent.` });
        }}
      />
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (!removing) return;
          removeMember(removing.id);
          toast({ tone: "success", title: `${removing.name} removed`, body: "They can no longer sign in to this charity (demo)." });
        }}
        title="Remove this person?"
        body={removing ? `${removing.name} will lose access to ${data.charity.shortName}'s portal straight away.` : ""}
        confirmLabel="Remove"
        danger
      />
    </>
  );
}

function InviteModal({ open, onClose, onInvite, existing }: { open: boolean; onClose: () => void; onInvite: (name: string, email: string, role: TeamRole) => void; existing: string[] }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("viewer");
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const close = () => {
    setName("");
    setEmail("");
    setRole("viewer");
    setErrors({});
    onClose();
  };
  const submit = () => {
    const e: typeof errors = {};
    if (name.trim().length < 2) e.name = "Enter their name.";
    if (!EMAIL.test(email.trim())) e.email = "Enter a valid email address.";
    else if (existing.includes(email.trim().toLowerCase())) e.email = "This person is already on the team.";
    setErrors(e);
    if (Object.keys(e).length) return;
    onInvite(name.trim(), email.trim(), role);
    close();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title="Invite a team member"
      description="Demo only: the invitation is added to the list, but no email is sent."
      footer={
        <>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button icon="mail" onClick={submit}>Add invitation</Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        <TextInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as TeamRole)} options={(["admin", "finance", "viewer"] as TeamRole[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))} hint="See Role permissions for what each role can do." />
        <p className="text-xs text-gz-muted">They will need to set up two-step sign-in the first time they sign in.</p>
      </div>
    </Modal>
  );
}

const PERMISSIONS: [string, boolean, boolean, boolean, boolean][] = [
  ["See the overview, donations and campaigns", true, true, true, true],
  ["See donors' contact details", true, true, true, false],
  ["Export CSV files", true, true, true, false],
  ["Create and edit campaigns", true, true, false, false],
  ["See finances and payouts", true, true, true, false],
  ["Edit the charity profile and branding", true, true, false, false],
  ["Invite and remove team members", true, false, false, false],
  ["Change security settings", true, false, false, false],
  ["Change bank details", false, false, false, false],
];

function RolesTab() {
  return (
    <Card>
      <CardHeader title="Role permissions" subtitle="Proposal for discussion. Today owners and admins see the same things (decided 09/10/2026); Finance and Viewer would be new roles." />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs text-gz-muted">
              <th className="pb-3 font-semibold">What they can do</th>
              {(["owner", "admin", "finance", "viewer"] as TeamRole[]).map((r) => (
                <th key={r} className="pb-3 text-center font-semibold">
                  <Badge tone={ROLE_TONE[r]} icon={false}>{ROLE_LABEL[r]}</Badge>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map(([label, ...cells]) => (
              <tr key={label} className="border-t border-gz-hairline/70">
                <td className="py-2.5 pr-3">{label}</td>
                {cells.map((ok, i) => (
                  <td key={i} className="py-2.5 text-center">
                    {ok ? <Icon name="check" size={18} className="inline text-gz-success" label="Yes" /> : <Icon name="x" size={16} className="inline text-gz-muted/60" label="No" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-gz-muted">Bank details stay with the Givezy team for every role: an approved charity&apos;s bank account is locked and only a Givezy admin can change it.</p>
    </Card>
  );
}

const STEP_STATE: Record<"done" | "current" | "todo", { tone: Tone; label: string }> = {
  done: { tone: "success", label: "Done" },
  current: { tone: "warning", label: "In review" },
  todo: { tone: "neutral", label: "To do" },
};

function VerificationTab({ data }: { data: DemoDataset }) {
  const c = data.charity;
  const verified = c.verification === "verified";
  const steps: [string, string, "done" | "current" | "todo"][] = [
    ["Application submitted", "Your charity's details and contact person.", "done"],
    ["Documents checked", "NPO certificate, constitution and proof of bank account.", verified ? "done" : "current"],
    ["Bank account verified", "The account payouts go to, in the charity's name.", verified ? "done" : "todo"],
    ["Connected for online donations", "Your charity can take donations through Givezy.", verified ? "done" : "todo"],
    ["s18A receipts", c.s18a ? "s18A approval and the receipting mandate are confirmed." : "Optional. Add your PBO number and s18A approval to offer tax receipts.", c.s18a ? "done" : "todo"],
  ];
  return (
    <>
      <Card className={verified ? "bg-gz-success-soft/60" : "bg-gz-warning-soft/60"}>
        <div className="flex items-center gap-4">
          <span className={cx("inline-flex size-12 shrink-0 items-center justify-center rounded-full", verified ? "bg-gz-sage text-white" : "bg-gz-warning-soft text-gz-warning")}>
            <Icon name={verified ? "shield" : "clock"} size={24} />
          </span>
          <div>
            <h2 className="text-xl">{verified ? "Verified charity" : "Verification in progress"}</h2>
            <p className="text-sm text-gz-ink/80">{verified ? "Donors see the Verified badge on your page." : "The Givezy team is checking your documents. This usually takes a few working days (demo wording)."}</p>
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Steps" />
        <ol className="space-y-4">
          {steps.map(([title, body, state], i) => (
            <li key={title} className="flex gap-4">
              <span className={cx("inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold", state === "done" ? "bg-gz-sage text-white" : state === "current" ? "bg-gz-warning-soft text-gz-warning" : "bg-gz-neutral-soft text-gz-muted")}>
                {state === "done" ? <Icon name="check" size={16} /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {title} <Badge tone={STEP_STATE[state].tone}>{STEP_STATE[state].label}</Badge>
                </p>
                <p className="text-sm text-gz-muted">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}

function PayoutsTab({ data }: { data: DemoDataset }) {
  const { toast } = usePortal();
  const [asking, setAsking] = useState(false);
  return (
    <>
      <Card>
        <CardHeader title="Payment provider" />
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-full bg-gz-success-soft text-gz-success">
            <Icon name="check" />
          </span>
          <div>
            <p className="font-semibold">Connected for online donations</p>
            <p className="text-sm text-gz-muted">Card payments go straight to your charity&apos;s account through Givezy&apos;s payment provider. Givezy never holds your donations.</p>
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Payout account" action={<Button variant="secondary" size="sm" onClick={() => setAsking(true)}>Change account</Button>} />
        <DetailList
          items={[
            ["Bank", data.charity.bankName],
            ["Account", `Ending ${data.charity.bankLast4}`],
            ["Account holder", data.charity.name],
            ["Schedule", DEMO_PAYOUT_SCHEDULE],
            ["Statement reference", "GIVEZY PO-yyyymmdd (demo format, one per deposit)"],
          ]}
        />
        <p className="mt-3 text-xs text-gz-muted">Only the last 4 digits are ever shown.</p>
      </Card>
      <Modal
        open={asking}
        onClose={() => setAsking(false)}
        title="Change the payout account"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAsking(false)}>Cancel</Button>
            <Button
              onClick={() => {
                setAsking(false);
                toast({ tone: "info", title: "Request noted (demo)", body: "Nothing was sent. In the live portal this reaches the Givezy team." });
              }}
            >
              Ask the Givezy team
            </Button>
          </>
        }
      >
        <p className="text-[15px]">For your safety, an approved charity&apos;s bank account can only be changed by the Givezy team, after checking proof of the new account. Your payouts keep going to the current account until then.</p>
      </Modal>
    </>
  );
}

function SecurityTab({ data }: { data: DemoDataset }) {
  const { overrides, updateOverrides, toast } = usePortal();
  const initial: SecurityPrefs = overrides.security ?? DEFAULT_SECURITY;
  const [form, setForm] = useState(initial);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const missing = data.team.filter((m) => m.status === "active" && !m.twoStep);
  return (
    <>
      <Card>
        <CardHeader title="Sign-in and access" />
        <div className="divide-y divide-gz-hairline">
          <Toggle label="Two-step sign-in for everyone" description="An authenticator app code at every sign-in. Required for all charity admins (decided), so it cannot be switched off." checked onChange={() => undefined} disabled />
          <div className="py-3">
            <Select label="Sign out after inactivity" value={form.sessionTimeout} onChange={(e) => setForm((f) => ({ ...f, sessionTimeout: e.target.value as SecurityPrefs["sessionTimeout"] }))} options={[{ value: "15", label: "15 minutes" }, { value: "30", label: "30 minutes" }, { value: "60", label: "1 hour" }, { value: "240", label: "4 hours" }]} />
          </div>
          <Toggle label="Only the owner can export" description="Every export is logged either way." checked={form.exportsOwnersOnly} onChange={(v) => setForm((f) => ({ ...f, exportsOwnersOnly: v }))} />
          <Toggle label="Email me about new devices" description="When someone on the team signs in from a new device." checked={form.newDeviceAlerts} onChange={(v) => setForm((f) => ({ ...f, newDeviceAlerts: v }))} />
        </div>
        <SaveBar
          dirty={dirty}
          onReset={() => setForm(initial)}
          onSave={() => {
            updateOverrides({ security: form });
            toast({ tone: "success", title: "Security settings saved (demo)" });
          }}
        />
      </Card>
      {missing.length > 0 && (
        <Callout tone="danger" title="Two-step sign-in not set up">
          {missing.map((m) => m.name).join(", ")} must set it up at their next sign-in before they can see anything.
        </Callout>
      )}
      <Card>
        <CardHeader title="Recent activity" subtitle="Sign-ins, exports and changes, from the audit log (demo entries)." />
        <ul className="divide-y divide-gz-hairline text-sm">
          {data.team
            .filter((m) => m.lastActive)
            .map((m) => (
              <ActivityRow key={m.id} who={m.name} what="Signed in with two-step code" when={m.lastActive!} />
            ))}
          <ActivityRow who={data.team[0].name} what="Exported donations (CSV)" when="2026-10-09T09:12:00Z" />
        </ul>
      </Card>
    </>
  );
}

function ActivityRow({ who, what, when }: { who: string; what: ReactNode; when: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2.5">
      <span>
        <span className="font-semibold">{who}</span> <span className="text-gz-muted">· {what}</span>
      </span>
      <span className="text-xs text-gz-muted">{dateTime(when)}</span>
    </li>
  );
}

