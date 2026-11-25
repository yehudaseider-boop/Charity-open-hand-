import type { Metadata } from "next";
import Link from "next/link";
import { DraftNotice, Section } from "@/components/legal";
import { legalConfig } from "@/config/legal";
import { CANT_UNDO, DELETED_LIST, KEPT_LIST, KEPT_WHY, TAKES_HOW_LONG } from "@/lib/delete-account";
import { whatsAppChat } from "@/lib/whatsapp";

export const metadata: Metadata = {
  title: "Delete your Givezy account",
  description: "How to delete your Givezy account and the information that identifies you, in the app or by contacting us, what we delete, what we keep and why.",
};

/**
 * How to delete your account and data, public and working signed out (25/11/2026). Google Play asks for a web page like
 * this in the store listing; Apple wants the deletion inside the app (Account, Delete my account). It stays reachable on
 * the coming-soon address too (src/lib/coming-soon.ts). All wording is DRAFT for Yosef (src/lib/delete-account.ts).
 */
export default function DeleteAccountInfoPage() {
  const email = legalConfig.supportEmail;
  const chat = whatsAppChat(legalConfig.supportWhatsApp);
  return (
    <article className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-display text-2xl text-indigo">Delete your Givezy account</h1>
        <p className="text-sm text-muted">You can delete your account and the information that identifies you whenever you like.</p>
        <DraftNotice />
      </div>

      <Section title="In the app">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Open the Givezy app and tap Account.</li>
          <li>Under Your information, tap Delete my account.</li>
          <li>Read what is deleted and what is kept, then type DELETE to confirm.</li>
        </ol>
        <p>{TAKES_HOW_LONG} If you signed in more than ten minutes ago, we first email you a new code, to make sure it is you.</p>
      </Section>

      <Section title="Without the app">
        <p>
          If you can&apos;t open the app, send us a message from the email address you use with Givezy
          {email ? (
            <>
              {" "}at <a className="text-brand underline" href={`mailto:${email}?subject=${encodeURIComponent("Delete my Givezy account")}`}>{email}</a>
            </>
          ) : null}
          {chat && legalConfig.supportWhatsApp ? (
            <>
              , or on WhatsApp on <a className="text-brand underline" href={chat} rel="noopener">{legalConfig.supportWhatsApp}</a>
            </>
          ) : null}
          . Say that you want your account deleted. We check that the message is from you, then delete it and email you to confirm. We aim to reply within 5 working days.
        </p>
        <p>
          If you can sign in on this website, you can also ask from <Link href="/account/data/delete" className="text-brand underline">Your information</Link>.
        </p>
      </Section>

      <Section title="What we delete">
        <ul className="list-disc space-y-1 pl-5">
          {DELETED_LIST.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Section>

      <Section title="What we keep, and why">
        <ul className="list-disc space-y-1 pl-5">
          {KEPT_LIST.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p>{KEPT_WHY}</p>
      </Section>

      <Section title="Good to know">
        <ul className="list-disc space-y-1 pl-5">
          <li>{CANT_UNDO}</li>
          <li>Your monthly donations are cancelled before anything is deleted, so you are never charged after deleting.</li>
          <li>If you manage a charity on Givezy, hand it over to someone else first. Get in touch and we will help.</li>
          <li>Your card details are kept by our payment partner, never by Givezy. Deleting your account removes the saved card from us.</li>
        </ul>
      </Section>

      <p className="text-xs text-muted">
        Questions about your information? See our <Link href="/privacy" className="text-brand underline">Privacy Policy</Link>
        {legalConfig.privacyEmail ? <> or write to {legalConfig.privacyEmail}</> : null}.
      </p>
    </article>
  );
}
