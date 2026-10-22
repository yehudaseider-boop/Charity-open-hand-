import type { Metadata } from "next";
import Link from "next/link";
import { TermsAndPrivacyLinks } from "@/components/legal";
import { getViewer } from "@/lib/auth";
import { sendLoginLink, verifyLoginCode } from "./actions";
import { PendingButton } from "@/components/forms/pending-button";
import { safeNextPath } from "@/lib/safe-path";

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
    <div className="mx-auto max-w-md rounded-card border-2 border-border bg-surface p-6 sm:p-8">
      <h1 className="font-display text-2xl text-indigo">Sign in</h1>
      {viewer && !sent ? (
        <p className="mt-3 text-sm">
          You&apos;re signed in{viewer.email ? ` as ${viewer.email}` : ""}. <Link href={safeNextPath(next)} className="text-brand underline">{safeNextPath(next) === "/account" ? "Go to your account" : "Carry on"}</Link>.
        </p>
      ) : sent ? (
        <div className="mt-3 space-y-4">
          <p className="text-sm">Check your email{email ? ` (${email})` : ""}. Tap the link in it, or type the code from it here.</p>
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
                className="w-full rounded-control border-2 border-border bg-surface px-3 py-2.5 text-lg tracking-widest"
              />
              {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
              <PendingButton pendingLabel="Signing in…" className="pressable w-full rounded-control bg-coral px-4 py-3 font-bold text-navy">Sign in</PendingButton>
            </form>
          ) : null}
          <p className="text-xs text-muted">
            Nothing arrived? Check spam, or <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-brand underline">ask for a new email</Link>.
          </p>
        </div>
      ) : (
        <form action={sendLoginLink} className="mt-4 space-y-3">
          <p className="text-sm text-muted">
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
            className="w-full rounded-control border-2 border-border bg-surface px-3 py-2.5"
          />
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          <PendingButton pendingLabel="Sending…" className="pressable w-full rounded-control bg-coral px-4 py-3 font-bold text-navy">
            Email me a sign-in link
          </PendingButton>
          <p className="text-xs text-muted">
            The first time you sign in you&apos;ll be asked to agree to <TermsAndPrivacyLinks />.
          </p>
        </form>
      )}
    </div>
  );
}
