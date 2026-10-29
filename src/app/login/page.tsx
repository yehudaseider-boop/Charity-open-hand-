import type { Metadata } from "next";
import Link from "next/link";
import { TermsAndPrivacyLinks } from "@/components/legal";
import { getViewer } from "@/lib/auth";
import { sendLoginLink, verifyLoginCode } from "./actions";
import { PendingButton } from "@/components/forms/pending-button";
import { safeNextPath } from "@/lib/safe-path";
import { Splash } from "@/components/splash";
import { Illustration } from "@/components/illustration";
import { Bubbles } from "@/components/marketing";

export const metadata: Metadata = { title: "Sign in" };

const errors: Record<string, string> = {
  email: "Please enter a valid email address.",
  send: "We couldn't send the link. Please try again in a minute.",
  link: "That sign-in link didn't work. It only opens in the browser you asked for it from. Ask for a new one and type the code from the email instead.",
  code: "That code didn't work. Check it, or ask for a new email and use the newest code.",
  busy: "We've sent several links to this address in the last hour. Please use the latest one, or try again later.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const sent = params.sent === "1";
  const error = typeof params.error === "string" ? errors[params.error] : undefined;
  const next = typeof params.next === "string" ? params.next : "/account";
  const email = typeof params.email === "string" ? params.email.slice(0, 200) : "";
  const viewer = await getViewer();

  return (
    <div className="full-bleed relative overflow-x-clip pb-16">
    <Bubbles
      items={[
        { c: "-left-24 top-10 h-72 w-72 bg-honey-soft" },
        { c: "-right-20 top-40 h-64 w-64 bg-peach" },
        { c: "left-[14%] top-[60%] h-6 w-6 bg-coral", anim: "bob" },
        { c: "right-[16%] top-24 h-10 w-10 border-[4px] border-brand", anim: "bob-slow" },
        { c: "right-[24%] bottom-24 h-4 w-4 bg-brand", anim: "bob" },
      ]}
    />
    <div className="relative mx-auto flex max-w-md flex-col items-center px-4 pt-6 sm:pt-12">
    <Illustration name={sent ? "mailSent" : "login"} sparkle={sent ? "hearts" : "stars"} className="absolute -left-72 top-24 hidden w-60 xl:block" />
    <Splash className="pop-in relative z-10 -mb-6 h-auto w-28 sm:w-32" />
    <div className="w-full rounded-[1.75rem] border-2 border-border bg-surface p-6 shadow-[0_24px_48px_rgba(9,37,119,0.08)] sm:p-8">
      <h1 className="text-[2rem] leading-tight">{sent ? "Check your email" : "Sign in"}</h1>
      {viewer && !sent ? (
        <p className="mt-3 text-sm">
          You&apos;re signed in{viewer.email ? ` as ${viewer.email}` : ""}. <Link href={safeNextPath(next)} className="text-brand underline">{safeNextPath(next) === "/account" ? "Go to your account" : "Carry on"}</Link>.
        </p>
      ) : sent ? (
        <div className="mt-3 space-y-4">
          <p className="text-[15px] text-muted">We sent a link{email ? <> to <span className="font-semibold text-navy">{email}</span></> : ""}. Tap it, or type the code from the email here.</p>
          {email ? (
            <form action={verifyLoginCode} className="space-y-3">
              <input type="hidden" name="email" value={email} />
              <input type="hidden" name="next" value={next} />
              <label className="block text-sm font-medium" htmlFor="code">Code from the email</label>
              <input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                className="w-full rounded-control border-2 border-border bg-surface px-4 py-3 text-center font-display text-2xl tracking-[0.3em] text-navy outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"
              />
              {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
              <PendingButton pendingLabel="Signing in…" className="pressable w-full rounded-control bg-coral px-4 py-3.5 text-[17px] font-bold text-navy disabled:opacity-60">Sign in</PendingButton>
            </form>
          ) : null}
          <p className="text-xs text-muted">
            Nothing arrived? Check spam, or <Link href={`/login?next=${encodeURIComponent(next)}`} className="-my-3.5 inline-block py-3.5 text-brand underline">ask for a new email</Link>.
          </p>
        </div>
      ) : (
        <form action={sendLoginLink} className="mt-4 space-y-3">
          <p className="text-[15px] text-muted">
            No password needed. We&apos;ll email you a sign-in link. You don&apos;t need an account to give.
          </p>
          <input type="hidden" name="next" value={next} />
          <label className="block text-sm font-medium" htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={email}
            className="w-full rounded-control border-2 border-border bg-surface px-4 py-3 text-[17px] outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"
          />
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          <PendingButton pendingLabel="Sending…" className="pressable w-full rounded-control bg-coral px-4 py-3.5 text-[17px] font-bold text-navy disabled:opacity-60">
            Email me a sign-in link
          </PendingButton>
          <p className="text-xs text-muted">
            The first time you sign in you&apos;ll be asked to agree to <TermsAndPrivacyLinks />.
          </p>
        </form>
      )}
    </div>
    </div>
    </div>
  );
}
