import type { Metadata } from "next";
import Link from "next/link";
import { TermsAndPrivacyLinks } from "@/components/legal";
import { getViewer } from "@/lib/auth";
import { sendLoginLink } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

const errors: Record<string, string> = {
  email: "Please enter a valid email address.",
  send: "We couldn't send the link. Please try again in a minute.",
  link: "That sign-in link has expired or was already used. Please ask for a new one.",
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
    <div className="mx-auto max-w-sm rounded-card bg-surface border border-border p-6">
      <h1 className="text-xl font-semibold">Sign in</h1>
      {viewer && !sent ? (
        <p className="mt-3 text-sm">
          You&apos;re signed in{viewer.email ? ` as ${viewer.email}` : ""}. <Link href="/account" className="text-brand underline">Go to your account</Link>.
        </p>
      ) : sent ? (
        <p className="mt-3 text-sm">Check your email. We&apos;ve sent you a link to sign in.</p>
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
            className="w-full rounded-control border border-border bg-surface px-3 py-2.5"
          />
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          <button className="w-full rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast">
            Email me a sign-in link
          </button>
          <p className="text-xs text-muted">
            The first time you sign in you&apos;ll be asked to agree to <TermsAndPrivacyLinks />.
          </p>
        </form>
      )}
    </div>
  );
}
