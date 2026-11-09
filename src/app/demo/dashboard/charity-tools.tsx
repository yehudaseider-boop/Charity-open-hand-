"use client";

import Link from "next/link";
import { Badge } from "@/components/badge";
import { Card, Notice } from "@/components/card";
import { ActionLink, EmptyState, PageHeader, secondaryAction } from "@/components/dash";
import { AddMemberForm, RemoveMemberForm } from "@/app/charity-admin/[id]/team/forms";
import { DonationEmailsForm, ImageForm, ProfileForm } from "@/app/charity-admin/[id]/profile/forms";
import { PhotoForm, UpdateForm } from "@/app/charity-admin/[id]/updates/forms";
import { ImportGiftsForm, RecordGiftForm } from "@/app/charity-admin/[id]/donations/record-forms";
import type { ImportPreview } from "@/app/charity-admin/[id]/donations/record-actions";
import { RECORDED_METHODS, checkFile, checkGift, type GiftField, type GiftFields, type RecordedMethod } from "@/lib/charity/recorded-gifts";
import { MAX_PHOTOS } from "@/lib/charity/validation";
import type { FormState } from "@/lib/form";
import { formatRand, parseRandToCents } from "@/lib/money";
import { platformConfig } from "@/config/platform";
import { DEMO_BASE as base } from "./sample";
import { demoId, demoNow, pause, useDemo } from "./store";

/**
 * Team, Public profile, Photos and updates, Record a gift and Import in the public demo: the real dashboard's own
 * forms, with actions that keep everything in this visitor's browser. Nothing reaches Givezy; each result says so.
 */

const KEPT = "Kept in this browser only.";

// Team -------------------------------------------------------------------------------------------------------

type Member = { id: string; email: string; role: "owner" | "admin"; since: string; you?: boolean };
const START_TEAM: Member[] = [
  { id: "you", email: "you@samplecharity.example", role: "owner", since: "03/02/2026", you: true },
  { id: "m2", email: "finance@samplecharity.example", role: "admin", since: "14/04/2026" },
];

export function DemoTeam() {
  const [team, setTeam] = useDemo<Member[]>("team", START_TEAM);
  const add = async (_: FormState, f: FormData): Promise<FormState> => {
    const email = String(f.get("email") ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, fieldErrors: { email: "Enter an email address, for example name@example.co.za" } };
    if (team.some((m) => m.email === email)) return { ok: false, fieldErrors: { email: "This person already has access" } };
    await pause();
    setTeam([...team, { id: demoId(), email, role: "admin", since: demoNow().slice(0, 10) }]);
    return { ok: true, message: `${email} is now an admin. In the real dashboard we email them how to sign in. ${KEPT}` };
  };
  const remove = (m: Member) => async (): Promise<FormState> => {
    await pause(400);
    setTeam(team.filter((x) => x.id !== m.id));
    return { ok: true, message: "Removed." };
  };
  return (
    <div className="space-y-5">
      <PageHeader title="Team" intro="People who can sign in to this dashboard. Admins can do everything here except add or remove people, and send emails to your donors. Only the owner can do those." />
      <Card title={`Who has access (${team.length})`}>
        <ul className="divide-y divide-border text-sm">
          {team.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-semibold text-navy [overflow-wrap:anywhere]">{m.email}{m.you ? <span className="text-muted"> (you)</span> : null}</p>
                <p className="text-xs text-muted">Since {m.since}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={m.role === "owner" ? "brand" : undefined}>{m.role === "owner" ? "Owner" : "Admin"}</Badge>
                {m.role === "admin" ? <RemoveMemberForm action={remove(m)} email={m.email} self={false} /> : null}
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Give someone access">
        <p className="mb-3 text-sm text-muted">They become an admin. They&apos;ll see your donations and donors&apos; details, so add only people you trust with them. The first time they sign in they set up a second step on their phone.</p>
        <AddMemberForm action={add} />
      </Card>
    </div>
  );
}

// Public profile ---------------------------------------------------------------------------------------------

const CATEGORIES = [
  { id: "food", slug: "food-and-welfare", name_en: "Food and welfare" },
  { id: "children", slug: "children-and-youth", name_en: "Children and youth" },
  { id: "education", slug: "education", name_en: "Education" },
  { id: "health", slug: "health", name_en: "Health" },
  { id: "elderly", slug: "elderly-care", name_en: "Elderly care" },
  { id: "animals", slug: "animals", name_en: "Animals" },
];
type Profile = {
  name_en: string; description_en: string | null; funds_use_en: string | null; thank_you_en: string | null; impact_en: string | null;
  suggested_amounts_cents: number[] | null; website: string | null; impact_unit_cents: number | null; impact_unit_one: string | null; impact_unit_many: string | null;
  categories: string[]; notify: boolean; logo: string | null; cover: string | null; savedAt: number;
};
const START_PROFILE: Profile = {
  name_en: "Sample Charity",
  description_en: "We run a weekly food programme and an after-school homework club for families in our area.",
  funds_use_en: "Donations buy food for the weekly parcels and pay for the homework club's teacher.",
  thank_you_en: "Thank you for standing with families in our community.",
  impact_en: null, suggested_amounts_cents: null, website: "https://samplecharity.example",
  impact_unit_cents: null, impact_unit_one: null, impact_unit_many: null,
  categories: ["food", "children"], notify: true, logo: null, cover: null, savedAt: 0,
};
const text = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v ? v : null;
};

/** A photo made small enough to keep in the browser (about 900 px across), as a JPEG data address. */
async function shrink(file: File, max = 900): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = url; });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function pictureFrom(f: FormData): Promise<{ ok: true; data: string } | { ok: false; state: FormState }> {
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, state: { ok: false, fieldErrors: { file: "Choose a photo first" } } };
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return { ok: false, state: { ok: false, fieldErrors: { file: "Choose a JPG, PNG or WebP photo" } } };
  if (file.size > 4 * 1024 * 1024) return { ok: false, state: { ok: false, fieldErrors: { file: "This photo is over 4 MB. Choose a smaller one" } } };
  try {
    return { ok: true, data: await shrink(file) };
  } catch {
    return { ok: false, state: { ok: false, fieldErrors: { file: "We couldn't open this photo. Try another one" } } };
  }
}

export function DemoProfile() {
  const [p, setP] = useDemo<Profile>("profile", START_PROFILE);
  const saveDetails = async (_: FormState, f: FormData): Promise<FormState> => {
    const name = text(f, "name_en");
    if (!name || name.length < 2) return { ok: false, message: "Some details need fixing. Nothing was saved yet.", fieldErrors: { name_en: "Enter your charity's name" } };
    await pause();
    // Suggested amounts: up to three whole Rand amounts, each at least the minimum gift.
    const amounts: number[] = [];
    for (const k of ["suggested_1", "suggested_2", "suggested_3"]) {
      const raw = String(f.get(k) ?? "").trim();
      if (!raw) continue;
      const cents = parseRandToCents(raw);
      if (cents === null || cents < platformConfig.minDonationCents || cents > platformConfig.maxDonationCents) {
        return { ok: false, message: "Some details need fixing. Nothing was saved yet.", fieldErrors: { [k]: `Enter Rand from ${formatRand(platformConfig.minDonationCents)}, for example 180` } };
      }
      amounts.push(cents);
    }
    const kept = setP({ ...p, suggested_amounts_cents: amounts.length ? amounts : null, name_en: name.slice(0, 120), description_en: text(f, "description_en"), funds_use_en: text(f, "funds_use_en"), thank_you_en: text(f, "thank_you_en"), impact_en: text(f, "impact_en"), website: text(f, "website"), categories: f.getAll("category_ids").map(String), savedAt: Date.now() });
    return { ok: true, message: `Saved. ${kept ? KEPT : "This browser won't keep it after you leave the page."}` };
  };
  const saveEmails = async (_: FormState, f: FormData): Promise<FormState> => {
    await pause(400);
    setP({ ...p, notify: f.get("notify_donations") === "on" });
    return { ok: true, message: `Saved. ${KEPT}` };
  };
  const upload = (which: "logo" | "cover") => async (_: FormState, f: FormData): Promise<FormState> => {
    const pic = await pictureFrom(f);
    if (!pic.ok) return pic.state;
    await pause(500);
    const kept = setP({ ...p, [which]: pic.data });
    return { ok: true, message: kept ? `Uploaded. ${KEPT}` : "Shown here, but this photo is too big for this browser to keep after you leave the page." };
  };
  return (
    <div className="space-y-5">
      <PageHeader title="Public profile" intro="What donors see on your page on the Givezy website and in the app. Changes show as soon as you save." />
      <Card title="Details">
        <ProfileForm action={saveDetails} charity={p} categories={CATEGORIES} selected={p.categories} />
      </Card>
      <Card title="Emails">
        <DonationEmailsForm action={saveEmails} on={p.notify} email="hello@samplecharity.example" />
      </Card>
      <Card title="Logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {p.logo ? <img src={p.logo} alt="" className="mb-3 h-20 w-20 rounded-card border-2 border-border object-cover" /> : null}
        <ImageForm action={upload("logo")} label="Square image works best" />
      </Card>
      <Card title="Cover image">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {p.cover ? <img src={p.cover} alt="" className="mb-3 aspect-[3/1] w-full rounded-card border-2 border-border object-cover" /> : null}
        <ImageForm action={upload("cover")} label="Wide image, about 3 times wider than tall" />
      </Card>
    </div>
  );
}

// Photos and updates -----------------------------------------------------------------------------------------

type Update = { id: string; body: string; at: string; photo?: string | null };
type Photo = { id: string; data: string; caption: string | null };
const START_UPDATES: Update[] = [{ id: "u1", body: "Our homework club started its third term this week, with two new volunteer tutors.", at: "28/10/2026 10:00" }];

export function DemoUpdates() {
  const [updates, setUpdates] = useDemo<Update[]>("updates", START_UPDATES);
  const [photos, setPhotos] = useDemo<Photo[]>("photos", []);
  const post = async (_: FormState, f: FormData): Promise<FormState> => {
    const body = String(f.get("body_en") ?? "").trim();
    if (body.length < 10) return { ok: false, fieldErrors: { body_en: "Write a few words about what you did" } };
    if (body.length > 500) return { ok: false, fieldErrors: { body_en: "Keep it to 500 characters or fewer" } };
    const file = f.get("file");
    let photo: string | null = null;
    if (file instanceof File && file.size > 0) {
      const pic = await pictureFrom(f);
      if (!pic.ok) return pic.state;
      photo = pic.data;
    }
    await pause();
    setUpdates([{ id: demoId(), body, at: demoNow(), photo }, ...updates]);
    return { ok: true, message: `Posted. In the real dashboard it shows on your page and in the app. ${KEPT}` };
  };
  const addPhoto = async (_: FormState, f: FormData): Promise<FormState> => {
    if (photos.length >= MAX_PHOTOS) return { ok: false, message: "Remove a photo to add another." };
    const pic = await pictureFrom(f);
    if (!pic.ok) return pic.state;
    await pause(500);
    const kept = setPhotos([...photos, { id: demoId(), data: pic.data, caption: text(f, "caption_en")?.slice(0, 120) ?? null }]);
    return { ok: true, message: kept ? `Added. ${KEPT}` : "Shown here, but this browser can't keep more photos after you leave the page." };
  };
  return (
    <div className="space-y-5">
      <PageHeader title="Photos and updates" intro="Show donors the real work. These appear on your page on the website and in the Givezy app. Only post photos you have permission to share, and never show a family who receives help without their consent." />
      <Card title="Post an update">
        <UpdateForm action={post} />
      </Card>
      {updates.length ? (
        <Card title="Your updates">
          <ul className="divide-y divide-border">
            {updates.map((u) => (
              <li key={u.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                <p className="text-xs font-semibold text-muted">{u.at.slice(0, 10)}</p>
                <p className="whitespace-pre-line text-[0.95rem] text-navy [overflow-wrap:anywhere]">{u.body}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {u.photo ? <img src={u.photo} alt="" className="aspect-[4/3] w-full max-w-sm rounded-card border-2 border-border object-cover" /> : null}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Link href={`${base}/email-donors`} className="inline-flex min-h-11 items-center text-sm font-semibold text-brand underline hover:text-indigo">Email this to your donors</Link>
                  <button type="button" className={secondaryAction} onClick={() => setUpdates(updates.filter((x) => x.id !== u.id))}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <Card title={`Photos (${photos.length} of ${MAX_PHOTOS})`}>
        {photos.length ? (
          <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((ph) => (
              <li key={ph.id} className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ph.data} alt={ph.caption ?? ""} className="aspect-square w-full rounded-card border-2 border-border object-cover" />
                {ph.caption ? <p className="text-xs text-muted [overflow-wrap:anywhere]">{ph.caption}</p> : null}
                <button type="button" className={secondaryAction} onClick={() => setPhotos(photos.filter((x) => x.id !== ph.id))}>Remove</button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mb-4">
            <EmptyState title="No photos yet">Photos of the work itself (parcels, a class, your building) mean the most to donors.</EmptyState>
          </div>
        )}
        {photos.length < MAX_PHOTOS ? <PhotoForm action={addPhoto} /> : <p className="text-sm text-muted">Remove a photo to add another.</p>}
      </Card>
    </div>
  );
}

// Record a gift and Import ------------------------------------------------------------------------------------

type Recorded = { id: string; date: string; amountCents: number; method: string; who: string; at: string; from: string | null };
const FIELDS: GiftField[] = ["date", "amount", "method", "donor_type", "first_name", "last_name", "organisation_name", "registration_number", "email", "phone", "wants_18a", "id_number", "tax_reference", "address_line1", "address_line2", "suburb", "city", "postal_code", "reference"];
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function RecordedList({ items, onRemove }: { items: Recorded[]; onRemove: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <Card title="Recorded in this demo">
      <ul className="divide-y divide-border text-sm">
        {items.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <span className="min-w-0">
              <span className="block font-semibold text-navy [overflow-wrap:anywhere]">{g.who}</span>
              <span className="block text-xs text-muted">{dmy(g.date)} · {RECORDED_METHODS[g.method as RecordedMethod] ?? "Recorded"}{g.from ? ` · from ${g.from}` : ""}</span>
            </span>
            <span className="flex items-center gap-3">
              <span className="font-semibold tabular-nums">{formatRand(g.amountCents)}</span>
              <button type="button" className={secondaryAction} onClick={() => onRemove(g.id)}>Remove</button>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function DemoRecordGift({ today, campaigns }: { today: string; campaigns: { value: string; label: string }[] }) {
  const [recorded, setRecorded] = useDemo<Recorded[]>("recorded", []);
  const record = async (_: FormState, f: FormData): Promise<FormState> => {
    const fields: GiftFields = {};
    for (const k of FIELDS) fields[k] = String(f.get(k) ?? "");
    fields.wants_18a = f.get("wants_18a") === "on" ? "yes" : "no";
    const checked = checkGift(fields, { today });
    if (!checked.ok) return { ok: false, message: "Some details need fixing. Nothing was recorded yet.", fieldErrors: checked.errors as Record<string, string> };
    const g = checked.gift;
    if (g.reference && recorded.some((r) => r.id === `ref:${g.reference}`)) return { ok: false, message: `You've already recorded a gift with the reference "${g.reference}". Nothing was recorded.` };
    await pause();
    const who = g.donorType === "individual" ? `${g.firstName ?? ""} ${g.lastName ?? ""}`.trim() || g.email : g.organisationName ?? g.email;
    setRecorded([{ id: g.reference ? `ref:${g.reference}` : demoId(), date: g.date, amountCents: g.amountCents, method: g.method, who, at: demoNow(), from: null }, ...recorded]);
    return { ok: true, message: `Recorded ${formatRand(g.amountCents)} from ${who}. In the real dashboard it counts in your totals and their history. ${KEPT}` };
  };
  return (
    <div className="space-y-5">
      <PageHeader
        back={<Link href={`${base}/donations`} className="text-muted hover:text-brand">← Donations</Link>}
        title="Record a gift"
        intro={<>For a gift that reached you another way: an EFT, cash, a debit order or another giving programme. It counts in your totals and the donor&apos;s history, and if they want one, it goes on their yearly s18A receipt with their other gifts to you. Many gifts at once? <Link href={`${base}/donations/import`} className="font-semibold text-brand underline">Import them from a file</Link>.</>}
      />
      <Notice>Only record money that has reached your bank account or your hands. You can remove a gift you recorded until it is on an s18A receipt.</Notice>
      <Card>
        <RecordGiftForm action={record} today={today} campaigns={campaigns} canReceipt />
      </Card>
      <RecordedList items={recorded} onRemove={(id) => setRecorded(recorded.filter((r) => r.id !== id))} />
    </div>
  );
}

/** A small, stable fingerprint of a file's text, so Import only records exactly what was checked. */
const fingerprint = (s: string) => `${s.length}:${[...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)}`;

export function DemoImport({ today }: { today: string }) {
  const [recorded, setRecorded] = useDemo<Recorded[]>("recorded", []);
  const check = async (_: ImportPreview, f: FormData): Promise<ImportPreview> => {
    const textIn = String(f.get("text") ?? "");
    if (!textIn.trim()) return { state: "refused", message: "Choose a CSV file first." };
    const method = String(f.get("method") ?? "");
    const file = checkFile(textIn, { today, fallbackMethod: Object.hasOwn(RECORDED_METHODS, method) ? (method as RecordedMethod) : null });
    if (!file.ok) return { state: "refused", message: file.message };
    await pause(500);
    const good = file.rows.filter((r) => r.check.ok);
    return {
      state: "checked",
      fingerprint: fingerprint(textIn),
      good: good.length,
      bad: file.rows.length - good.length,
      totalCents: good.reduce((t, r) => t + (r.check.ok ? r.check.gift.amountCents : 0), 0),
      problems: file.rows.filter((r) => !r.check.ok).slice(0, 100).map((r) => ({ line: r.line, messages: r.check.ok ? [] : Object.values(r.check.errors).filter((m): m is string => Boolean(m)) })),
      warnings: [],
      unknownColumns: file.unknownColumns,
    };
  };
  const importAction = async (_: FormState, f: FormData): Promise<FormState> => {
    const textIn = String(f.get("text") ?? "");
    if (fingerprint(textIn) !== String(f.get("fingerprint") ?? "")) return { ok: false, message: "The file changed since it was checked. Nothing was imported. Check it again first." };
    if (f.get("confirm") !== "on") return { ok: false, fieldErrors: { confirm: "Please confirm, so we know these gifts may be recorded and receipted through Givezy" } };
    const method = String(f.get("method") ?? "");
    const file = checkFile(textIn, { today, fallbackMethod: Object.hasOwn(RECORDED_METHODS, method) ? (method as RecordedMethod) : null });
    if (!file.ok) return { ok: false, message: file.message };
    await pause(800);
    const name = String(f.get("file_name") ?? "your file") || "your file";
    const gifts = file.rows.flatMap((r) => (r.check.ok ? [r.check.gift] : []));
    setRecorded([
      ...gifts.map((g) => ({ id: demoId(), date: g.date, amountCents: g.amountCents, method: g.method, who: (g.donorType === "individual" ? `${g.firstName ?? ""} ${g.lastName ?? ""}`.trim() : g.organisationName) || g.email, at: demoNow(), from: name })),
      ...recorded,
    ]);
    return { ok: true, message: `Imported ${gifts.length} ${gifts.length === 1 ? "gift" : "gifts"}. ${KEPT}` };
  };
  return (
    <div className="space-y-5">
      <PageHeader
        back={<Link href={`${base}/donations`} className="text-muted hover:text-brand">← Donations</Link>}
        title="Import gifts from a file"
        intro="For gifts that reached you another way, for example from a bank statement or another giving programme. Save your spreadsheet as CSV with one gift per row. We check every row first and show you what would be recorded. Nothing is saved until you press Import."
      />
      <Card title="What the file needs">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li><span className="font-medium">Date</span> (dd/mm/yyyy), <span className="font-medium">Amount</span> (1250 or 1250.00) and <span className="font-medium">Email</span> on every row.</li>
          <li>The donor&apos;s first name and surname, or the organisation&apos;s name.</li>
          <li>For an s18A receipt: <span className="font-medium">s18A</span> set to yes, their SA ID number (a company&apos;s CIPC number or a trust&apos;s number), and their address. The income tax number is optional.</li>
          <li>Optional: method, campaign (its exact title), phone, and a reference (the bank reference stops the same gift being imported twice).</li>
        </ul>
        <div className="mt-4">
          <ActionLink href={`${base}/donations/import/template`} download>Download the template (CSV)</ActionLink>
        </div>
      </Card>
      <Card title="Check and import">
        <ImportGiftsForm check={check} importAction={importAction} />
      </Card>
      <RecordedList items={recorded} onRemove={(id) => setRecorded(recorded.filter((r) => r.id !== id))} />
    </div>
  );
}
