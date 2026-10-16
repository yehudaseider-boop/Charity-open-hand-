import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChallengeRing } from "@/components/challenge-ring";
import { CopyLink } from "@/components/copy-link";
import { loadChallenge } from "@/lib/challenges/queries";
import { challengeOpen, challengeShareText, milestone } from "@/lib/challenges/rules";
import { formatDate } from "@/lib/dates";
import { formatRand } from "@/lib/money";

const site = () => (process.env.SITE_URL ?? "").replace(/\/+$/, "");

/** A shared challenge link shows the challenge, its goal and the charity in WhatsApp's preview. */
export async function generateMetadata({ params }: PageProps<"/g/[slug]">): Promise<Metadata> {
  const c = await loadChallenge((await params).slug);
  if (!c) return { title: "Challenge" };
  const title = `${c.title}: for ${c.charityName}`;
  const description = `${formatRand(c.raisedCents)} of ${formatRand(c.targetCents)} raised. Started by ${c.starterName} on Givezy.`;
  return { title: c.title, description, openGraph: { title, description, siteName: "Givezy", locale: "en_ZA", type: "website", images: [{ url: "/logo.png" }] } };
}

/**
 * A group challenge: one ring showing how full it is, why it was started, and one button to give.
 * Never who gave or how much each person gave.
 */
export default async function ChallengePage({ params, searchParams }: PageProps<"/g/[slug]">) {
  const { slug } = await params;
  const c = await loadChallenge(slug);
  if (!c) notFound();
  const sp = await searchParams;
  const open = challengeOpen(c);
  const url = `${site()}/g/${c.slug}`;
  const share = `https://wa.me/?text=${encodeURIComponent(challengeShareText(c, url, formatRand))}`;
  const reached = milestone(c.raisedCents, c.targetCents);

  return (
    <article className="mx-auto max-w-md space-y-0">
      <header className="relative overflow-hidden rounded-t-card bg-brand px-6 pb-24 pt-7 text-white">
        <span aria-hidden className="blob absolute -right-14 -top-16 h-36 w-36 bg-coral" />
        <span aria-hidden className="blob absolute -bottom-10 -left-12 h-24 w-32 -rotate-12 bg-honey" />
        <div className="relative">
          <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-honey-soft">Group challenge</span>
          <h1 className="mt-3 text-3xl leading-tight text-white!">{c.title}</h1>
          <p className="mt-1 text-honey-soft">Started by {c.starterName}, for <Link href={`/c/${c.charitySlug}`} className="underline">{c.charityName}</Link></p>
        </div>
      </header>

      <div className="relative -mt-16 space-y-4 px-4 pb-2">
        <section className="grid justify-items-center gap-3 rounded-card border-[1.5px] border-border bg-surface p-5">
          <ChallengeRing raisedCents={c.raisedCents} targetCents={c.targetCents} />
          <div className="flex flex-wrap justify-center gap-2 text-sm font-semibold">
            <span className="rounded-full bg-honey-soft px-3 py-1.5">{c.people} {c.people === 1 ? "person has" : "people have"} given</span>
            {c.endsAt ? <span className="rounded-full bg-honey-soft px-3 py-1.5">{open ? "Ends" : "Ended"} {formatDate(c.endsAt)}</span> : null}
          </div>
        </section>

        {sp.started ? (
          <p role="status" className="rounded-card bg-peach p-4 text-sm">
            <span className="font-semibold">Your challenge is live.</span> Share the link below with your friends, family or colleagues. {c.charityName} has been told about it.
          </p>
        ) : null}

        {c.reason ? (
          <section className="rounded-card bg-honey-soft p-4">
            <p className="text-xs font-bold text-brand">Why {c.starterName} started it</p>
            <p className="mt-1 whitespace-pre-line">{c.reason}</p>
          </section>
        ) : null}

        {open ? (
          <>
            <Link href={`/c/${c.charitySlug}/donate?challenge=${c.slug}`} className="pressable block rounded-control bg-coral px-4 py-3.5 text-center text-lg font-bold text-navy">
              Give to this challenge
            </Link>
            <a href={share} target="_blank" rel="noopener noreferrer" className="block rounded-control border-2 border-brand px-4 py-3 text-center font-bold text-brand">
              Share on WhatsApp
            </a>
            <CopyLink url={url} />
            <p className="text-xs text-muted">Your gift goes straight to {c.charityName}. Nobody sees how much you give.</p>
          </>
        ) : (
          <p className="rounded-card bg-honey-soft p-4 text-sm">
            {c.status === "stopped" ? "This challenge has been stopped." : "This challenge has ended."} You can still{" "}
            <Link href={`/c/${c.charitySlug}`} className="font-semibold text-brand underline">give to {c.charityName}</Link>.
          </p>
        )}

        {reached ? (
          <p className="flex items-center gap-2 text-sm">
            <span aria-hidden className="h-3 w-3 rounded-full bg-coral" />
            <span className="font-semibold">{reached === "goal" ? "Goal reached" : "Halfway there"}</span>
          </p>
        ) : null}

        <Link href={`/c/${c.charitySlug}`} className="flex items-center gap-3 rounded-card border-[1.5px] border-border p-3">
          <span aria-hidden className="grid h-11 w-11 shrink-0 place-content-center rounded-control bg-brand font-display text-xl text-white">{c.charityName.slice(0, 1)}</span>
          <span className="min-w-0">
            <span className="block font-semibold">{c.charityName}</span>
            <span className="block text-sm text-muted">See their page</span>
          </span>
        </Link>
        <p className="pb-4 text-xs text-muted">
          A challenge is started by a supporter, not by {c.charityName}. {c.charityName} can stop it if it isn&apos;t right for them.
        </p>
      </div>
    </article>
  );
}
