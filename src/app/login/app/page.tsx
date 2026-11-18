import type { Metadata } from "next";
import Link from "next/link";
import { Splash } from "@/components/splash";
import { ClearSignInHash } from "./clear-hash";

export const metadata: Metadata = { title: "Back to the app", robots: { index: false, follow: false } };

/**
 * Where the link in a sign-in email lands when the person asked for it in the Givezy app (18/11/2026).
 * The app signs in with the 6‑digit code from the same email, so this page only says that, plainly.
 * It signs nobody in on the website: the website's own sign-in uses /auth/callback.
 */
export default function BackToAppPage() {
  return (
    <div className="relative mx-auto flex max-w-md flex-col items-center px-4 pb-16 pt-6 sm:pt-12">
      <ClearSignInHash />
      <Splash className="pop-in relative z-10 -mb-6 h-auto w-28 sm:w-32" />
      <div className="w-full rounded-[1.75rem] border-2 border-border bg-surface p-6 sm:p-8">
        <h1 className="text-[2rem] leading-tight">Go back to the app</h1>
        <p className="mt-3 text-[15px] text-muted">
          You asked to sign in from the Givezy app. Open the app and type the 6‑digit code from the same email.
          Nothing else is needed on this page.
        </p>
        <p className="mt-4 text-sm text-muted">
          Code expired or not working? In the app, tap Send a new code.
        </p>
        <p className="mt-4 text-sm">
          Meant to sign in on the website instead? <Link href="/login" className="text-brand underline">Sign in here</Link>.
        </p>
      </div>
    </div>
  );
}
