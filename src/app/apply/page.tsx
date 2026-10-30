import type { Metadata } from "next";
import Link from "next/link";
import { Illustration } from "@/components/illustration";
import { Bubbles, Icon, Key, Steps, type IconName } from "@/components/marketing";
import { platformConfig } from "@/config/platform";
import { getViewer } from "@/lib/auth";
import { findOpenInvite, isInviteToken } from "@/lib/charity/invites";
import { reviewWithin } from "@/lib/charity/review-time";
import { sendLoginLink } from "@/app/login/actions";
import { StartForm } from "./start-form";

export const metadata: Metadata = { title: "List your charity" };

/**
 * The way in for charities (reworked 30/10/2026, Yehuda chose "rework the whole path"): the For charities look,
 * what each document is in plain words, and what happens after they submit. Signed out, the name and email go
 * in one form: the email gets a sign-in code and the name comes back filled in, so signing in is part of
 * starting rather than a stop before it. DRAFT WORDING for Yehuda to approve.
 */

const papers: { icon: IconName; title: string; body: string; when?: string }[] = [
  { icon: "building", title: "NPO or PBO number", body: "From your NPO registration certificate (it looks like 123-456 NPO) or your PBO approval letter from SARS. Either one, or both." },
  { icon: "bank", title: "Bank confirmation letter", body: "A letter from your bank showing the account is in the organisation's name, with the account number and branch code. Donations are paid into this account." },
  { icon: "user", title: "A contact person", body: "Who we email about your application and your page. You can change it later." },
  { icon: "shield", title: "PBO approval letter", body: "The SARS letter confirming your PBO status.", when: "If you have PBO status" },
  { icon: "receipt", title: "s18A approval and our mandate", body: "The SARS letter that lets you issue s18A receipts, and our receipting mandate, signed. The mandate lets us issue receipts in your name.", when: "Only for s18A receipts" },
];

export default async function ApplyPage({ searchParams }: PageProps<"/apply">) {
  const viewer = await getViewer();
  const sp = (await searchParams) as { invite?: string; name?: string };
  const token = isInviteToken(sp.invite) ? sp.invite : undefined;
  const invite = await findOpenInvite(token);
  const typedName = typeof sp.name === "string" ? sp.name.slice(0, 120) : "";
  const startName = invite?.charityName ?? typedName;
  const back = (name: string) => `/apply?${new URLSearchParams({ ...(token ? { invite: token } : {}), ...(name ? { name } : {}) }).toString()}`;

  return (
    <div className="full-bleed overflow-x-clip">
      <section className="relative">
        <Bubbles
          items={[
            { c: "-left-40 -top-40 h-[24rem] w-[24rem] bg-honey-soft" },
            { c: "-right-32 top-32 h-72 w-72 bg-peach" },
            { c: "left-[10%] top-24 h-5 w-5 bg-coral", anim: "bob" },
            { c: "right-[12%] top-14 h-8 w-8 bg-brand", anim: "bob-slow" },
            { c: "right-[22%] top-72 h-12 w-12 border-[5px] border-honey", anim: "bob" },
          ]}
        />
        <div className="relative mx-auto grid max-w-[75rem] gap-10 px-4 pb-16 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-center">
          <div className="space-y-5">
            <p className="inline-block rounded-full bg-honey-soft px-4 py-1.5 text-[14px] font-bold text-brand">For charities</p>
            <h1 className="max-w-[36rem] text-[clamp(2.25rem,4.4vw,3.25rem)] font-bold! leading-[1.1] text-balance">
              List your charity on {platformConfig.appName}. <Key>It&apos;s free</Key>.
            </h1>
            <p className="max-w-[34rem] text-[17px] leading-relaxed text-muted">
              Apply in one sitting or save and come back any time. We check every application by hand and review it within {reviewWithin()}.
            </p>
            <Illustration name="checklist" sparkle="stars" className="hidden w-full max-w-[22rem] lg:block" />
          </div>

          {/* The one place to start: signed out, name and email together; signed in, straight in. */}
          <div className="rounded-[1.75rem] border-2 border-border bg-surface p-6 shadow-[0_18px_50px_rgba(14,27,61,0.08)] sm:p-7">
            {invite ? (
              <p className="mb-4 rounded-control bg-brand-soft p-3 text-sm">You&apos;ve been invited to list <span className="font-semibold">{invite.charityName}</span>. Its name is filled in.</p>
            ) : token ? (
              <p className="mb-4 rounded-control bg-honey-soft p-3 text-sm text-muted">This invitation link has expired or was already used. You can still start an application here.</p>
            ) : null}
            {viewer ? (
              <div className="space-y-4">
                <h2 className="font-display text-2xl font-bold">Start your application</h2>
                {viewer.managedCharityIds.length ? (
                  <p className="rounded-control bg-honey-soft p-3 text-sm">
                    You already have a charity on {platformConfig.appName}.{" "}
                    <Link href="/charity-admin" className="font-semibold text-brand underline">Continue there</Link>, or start another below.
                  </p>
                ) : null}
                <StartForm defaultName={startName || undefined} invite={invite ? token : undefined} />
                <p className="text-sm text-muted">Signed in as {viewer.email}. Everything saves as you go.</p>
              </div>
            ) : (
              <form action={sendLoginLink} className="space-y-4">
                <h2 className="font-display text-2xl font-bold">Start your application</h2>
                <p className="text-sm text-muted">We&apos;ll email you a code, so you can come back to your application from any device. No password needed.</p>
                {/* No surprises: the two short stops before the first step (agreement, then the second step that keeps donors' details safe). */}
                <ol className="space-y-1 rounded-control bg-honey-soft p-3 text-sm text-navy">
                  <li>1. Type the code from the email</li>
                  <li>2. Agree to our terms</li>
                  <li>3. Set up an authenticator app on your phone (about two minutes). It keeps your donors&apos; details safe.</li>
                </ol>
                <div className="space-y-1.5">
                  <label htmlFor="apply-name" className="block text-sm font-semibold">Organisation name</label>
                  <input id="apply-name" name="apply_name" required minLength={2} maxLength={120} defaultValue={startName} autoComplete="organization" className="min-h-12 w-full rounded-control border-2 border-border bg-surface px-3 focus:border-brand" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="apply-email" className="block text-sm font-semibold">Your email</label>
                  <input id="apply-email" name="email" type="email" required maxLength={200} autoComplete="email" className="min-h-12 w-full rounded-control border-2 border-border bg-surface px-3 focus:border-brand" />
                </div>
                <input type="hidden" name="next" value={back(startName)} />
                <button className="pressable w-full rounded-control bg-coral px-6 py-3.5 font-bold text-navy">Email me a code</button>
                <p className="text-sm text-muted">Already applied? <Link href={`/login?next=${encodeURIComponent("/charity-admin")}`} className="font-semibold text-brand underline">Sign in to carry on</Link>.</p>
              </form>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[75rem] space-y-6 px-4 pb-16 sm:px-6">
        <div className="max-w-[40rem] space-y-2">
          <h2 className="text-[clamp(1.75rem,3vw,2.25rem)] font-bold! leading-tight">What you&apos;ll <Key>need</Key></h2>
          <p className="text-muted">Have these ready as PDFs or clear photos (up to 4 MB each). You can upload from your phone.</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {papers.map((p) => (
            <li key={p.title} className="flex gap-4 rounded-[1.25rem] border-2 border-border bg-surface p-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-honey-soft"><Icon name={p.icon} /></span>
              <div className="min-w-0 space-y-1">
                <p className="font-bold text-navy">{p.title}</p>
                {p.when ? <p className="inline-block rounded-full bg-peach px-2.5 py-0.5 text-xs font-semibold text-navy">{p.when}</p> : null}
                <p className="text-sm leading-relaxed text-muted">{p.body}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted">Organisations without s18A approval are welcome. Donors can still give; no tax receipts are issued.</p>
      </section>

      <section className="mx-auto max-w-[75rem] px-4 pb-24 sm:px-6">
        <div className="mb-6 max-w-[40rem]">
          <h2 className="text-[clamp(1.75rem,3vw,2.25rem)] font-bold! leading-tight">What happens <Key>next</Key></h2>
        </div>
        <Steps
          steps={[
            { icon: "building", title: "You apply", body: "Six short steps: your organisation, address, contact person, bank account, documents, then submit." },
            { icon: "shield", title: `We check it within ${reviewWithin()}`, body: "A person checks your registration, bank letter and approvals, then emails you. If something needs fixing, we say exactly what." },
            { icon: "heart", title: "You go live", body: "Add a photo and a few words about your work, share your page, and donations start coming in." },
          ]}
        />
      </section>
    </div>
  );
}
