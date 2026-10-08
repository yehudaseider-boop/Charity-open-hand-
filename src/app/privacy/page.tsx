import type { Metadata } from "next";
import Link from "next/link";
import { DraftNotice, Section } from "@/components/legal";
import { legalConfig, show } from "@/config/legal";
import { platformConfig } from "@/config/platform";

export const metadata: Metadata = { title: "Privacy Policy" };

/**
 * POPIA notice (section 18): who we are, what we collect and why, who we share
 * it with, how long we keep it, and people's rights. DRAFT for Yosef's review.
 */
export default function PrivacyPage() {
  const name = platformConfig.appName;
  return (
    <article className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Privacy Policy</h1>
        <p className="text-xs text-muted">Version {legalConfig.policyVersion}</p>
        <DraftNotice />
      </div>

      <Section title="Who we are">
        <p>
          {name} is run by {show(legalConfig.companyName)}, registration number {show(legalConfig.registrationNumber)},{" "}
          {show(legalConfig.address)}. We are the responsible party for your personal information under the Protection of
          Personal Information Act (POPIA).
        </p>
        <p>
          Our Information Officer is {show(legalConfig.informationOfficer.name)}, reachable at{" "}
          {show(legalConfig.informationOfficer.email)}.
        </p>
      </Section>

      <Section title="What we collect">
        <p><strong>When you donate:</strong> your name (or your organisation&apos;s name and contact person), email address, and optionally your phone number and a message to the charity. If you ask for an s18A tax receipt, your SA ID number or income tax number (or your organisation&apos;s registration number).</p>
        <p><strong>Your giving records:</strong> each donation&apos;s amount, date and charity, any contribution to {name}, and whether you counted it as maaser, chomesh or general tzedaka.</p>
        <p><strong>When you sign in:</strong> your email address. Admins of charities and of {name} also set up an authenticator app.</p>
        <p><strong>When a charity applies:</strong> the organisation&apos;s registration details, contact person, bank account and supporting documents.</p>
        <p><strong>Technical:</strong> a sign-in cookie to keep you signed in, and, for about a day, your IP address to stop fraud. We use no advertising or tracking cookies and no analytics.</p>
        <p>We never see or store your card details: you enter them on our payment provider&apos;s secure page.</p>
      </Section>

      <Section title="Information about your religious practice">
        <p>
          Whether you count a donation as maaser, chomesh or general tzedaka may show your religious practice, which POPIA treats
          as special personal information. We keep it only because you give it to us for your own records, with your consent. Only
          you can see it: not the charity, and not other donors.
        </p>
      </Section>

      <Section title="Why we use it">
        <ul className="list-disc space-y-1 pl-5">
          <li>To process your donation and send you a confirmation (to carry out what you asked for).</li>
          <li>To issue your annual s18A receipt on the charity&apos;s behalf, and keep the tax records the law requires.</li>
          <li>To show you your giving history and your maaser and chomesh in the app (with your consent).</li>
          <li>To check charities before they are listed, and to stop fraud and misuse (our legitimate interest, and the law).</li>
        </ul>
        <p>We do not sell your information, and we do not send you marketing.</p>
      </Section>

      <Section title="Who we share it with">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>The charity you give to:</strong> your name, contact details, the amount, your message and whether you asked for an s18A receipt, so it can record your donation. It does not see your ID or tax number, your maaser or chomesh choice, or any contribution to {name}. Choosing &quot;anonymous&quot; hides your name from public pages, not from the charity.</li>
          <li><strong>Our payment provider:</strong> what it needs to take your payment. {show(null)} (to be named once chosen).</li>
          <li><strong>Our service providers</strong> who host our database and send our emails, under contracts that require them to protect it. {show(null)} (list to be confirmed).</li>
          <li><strong>The South African Revenue Service</strong>, or others, only where the law requires it.</li>
        </ul>
        <p>Some of these providers may store information outside South Africa. {show(null)} (where, and the safeguards in place, to be confirmed).</p>
      </Section>

      <Section title="How we protect it">
        <p>ID numbers, tax numbers and bank account numbers are encrypted. Access is limited to the people who need it, and admins must use an authenticator app. Every charity sees only its own donors.</p>
      </Section>

      <Section title="How long we keep it">
        <p>Donation and receipt records are kept for as long as tax law requires. {show(null)} (period to be confirmed). Other information is deleted or anonymised when it is no longer needed, or when you ask us to, unless the law requires us to keep it.</p>
      </Section>

      <Section title="Your rights">
        <p>
          You may ask what information we hold about you, ask us to correct or delete it, or object to how we use it. Signed-in
          donors can download their information and send a request from{" "}
          <Link href="/account/data" className="text-brand underline">Your information</Link>, or email{" "}
          {show(legalConfig.privacyEmail)}.
        </p>
        <p>
          If you are unhappy with how we handled your information, you may complain to the Information Regulator
          (inforegulator.org.za).
        </p>
      </Section>

      <Section title="Age">
        <p>You must be 18 or older to donate or open an account.</p>
      </Section>

      <Section title="Changes">
        <p>If we change this policy we will update the version above, and ask you to agree again the next time you sign in.</p>
      </Section>
    </article>
  );
}
