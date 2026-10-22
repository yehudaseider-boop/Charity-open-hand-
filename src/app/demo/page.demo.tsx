import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { platformConfig } from "@/config/platform";
import { DEMO_PEOPLE, demoModeOn } from "@/lib/demo/mode";
import { DemoSignInForm } from "./demo-button";

export const metadata: Metadata = { title: "Try the demo", robots: { index: false, follow: false } };

const errors: Record<string, string> = {
  who: "We didn't recognise that button. Please pick one of the people below.",
  busy: "Lots of sign-ins from here in the last few minutes. Wait a minute, then try again.",
  not_set_up: "The demo data is being reset right now. Wait a minute, then try again.",
  failed: "That sign-in didn't go through. Nothing was changed. Please try again.",
};

/**
 * The demo's front door: one button per made-up person. Only built when DEMO_MODE=yes, and
 * "not found" at run time unless demo mode is on.
 */
export default async function DemoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!demoModeOn()) notFound();
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? errors[sp.error] : undefined;

  return (
    <div className="space-y-6">
      <section className="rounded-card bg-brand p-6 text-brand-contrast sm:p-8">
        <h1 className="text-3xl leading-tight text-white!">Try {platformConfig.appName}</h1>
        <p className="mt-3">
          Pick a person and you&apos;re straight in, no email or phone needed. Every charity, donor and rand here is made up,
          so click anything you like.
        </p>
      </section>
      {error ? <p role="alert" className="rounded-card bg-danger-soft p-4 text-sm text-danger">{error}</p> : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {DEMO_PEOPLE.map((p) => (
          <li key={p.key} className="flex flex-col rounded-card border border-border bg-surface p-5">
            <h2 className="font-display text-xl font-semibold text-indigo">{p.label}</h2>
            <p className="mt-1 text-sm font-medium">{p.name}</p>
            <p className="mt-1 flex-1 text-sm text-muted">{p.about}</p>
            <DemoSignInForm who={p.key} label={`Sign in as ${p.name.split(" ")[0]}`} />
          </li>
        ))}
      </ul>
      <section className="rounded-card bg-honey-soft p-5 text-sm">
        <h2 className="font-semibold">Good to know</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Nothing is charged. Card payments go to a pretend payment page where you choose &quot;paid&quot; or &quot;declined&quot;.</li>
          <li>No emails are sent. Where the real site would email someone, the demo only notes it.</li>
          <li>Everyone sees the same demo, and it goes back to how it started every night.</li>
          <li>You can also browse as a visitor: <a href="/charities" className="text-brand underline">see the charities</a>.</li>
        </ul>
      </section>
    </div>
  );
}
