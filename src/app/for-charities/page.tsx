import type { Metadata } from "next";
import Link from "next/link";
import { platformConfig } from "@/config/platform";

export const metadata: Metadata = {
  title: "For charities",
  description: "List your charity on Givezy for free. Donations go straight to your bank account, and we issue s18A receipts for you.",
};

// DRAFT WORDING for Yehuda to approve. Every claim here must stay true: no fee figures until the
// payment provider's rates are confirmed (see docs/go-live-checklist.md).
const reasons = [
  { title: "Free to list", body: "There is no sign-up fee and no monthly fee to be on Givezy." },
  { title: "Straight to your bank", body: "Each donation is paid into your own bank account by our payment provider. Givezy never holds your money. The provider's card fee comes off each donation." },
  { title: "s18A receipts, done for you", body: "If you have s18A approval and sign our receipting mandate, we issue your donors' receipts in your name once a year. No spreadsheets at tax time." },
  { title: "Monthly donors", body: "Donors can give the same amount every month until they cancel. You see who gives monthly and how much comes in." },
  { title: "Campaigns with a goal", body: "Raising for Pesach parcels or a new Sefer Torah? Start a campaign with a goal and donors watch it fill up." },
  { title: "Your own dashboard", body: "See every donation, your donors, monthly totals and how your campaigns are doing. Download it all when you need to." },
];

const steps = [
  { title: "Apply online", body: "Your registration details, bank account and a bank confirmation letter. Save and come back any time." },
  { title: "We check it", body: "We review every application by hand, then email you when it's approved or if something needs fixing." },
  { title: "Start receiving", body: "Add a photo and a few words about your work, share your page, and donations start coming in." },
];

export default function ForCharitiesPage() {
  return (
    <div className="space-y-8">
      <section className="rounded-card border border-border bg-gradient-to-br from-brand-soft to-surface p-6 sm:p-8">
        <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">Let your community give to you in a few taps</h1>
        <p className="mt-3">
          {platformConfig.appName} helps donors find local charities, give from their phone, and keep track of their maaser and chomesh.
          Listing your organisation is free.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/apply" className="rounded-control bg-brand px-5 py-3 font-semibold text-brand-contrast">List your charity</Link>
          <Link href="/charities" className="rounded-control border border-border bg-surface px-5 py-3 font-medium">See who&apos;s on {platformConfig.appName}</Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Why charities use {platformConfig.appName}</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {reasons.map((r) => (
            <li key={r.title} className="rounded-card border border-border bg-surface p-5">
              <h3 className="font-semibold">{r.title}</h3>
              <p className="mt-1 text-sm text-muted">{r.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">How to join</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-card border border-border bg-surface p-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-contrast">{i + 1}</span>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-card border border-border bg-surface p-6">
        <h2 className="text-xl font-bold">What you&apos;ll need</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          <li>Your registered name, and NPO or PBO reference number</li>
          <li>Registered address and a contact person</li>
          <li>Your bank account, with a bank confirmation letter</li>
          <li>Your PBO approval letter, if you have PBO status</li>
          <li>For s18A receipts: your s18A approval and our signed receipting mandate</li>
        </ul>
        <p className="mt-3 text-sm text-muted">No s18A approval? You&apos;re still welcome. Donors can give; they just don&apos;t get a tax receipt.</p>
        <Link href="/apply" className="mt-4 inline-block rounded-control bg-brand px-5 py-3 font-semibold text-brand-contrast">Start your application</Link>
      </section>
    </div>
  );
}
