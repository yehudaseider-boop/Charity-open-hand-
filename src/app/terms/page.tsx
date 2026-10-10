import type { Metadata } from "next";
import Link from "next/link";
import { DraftNotice, Section } from "@/components/legal";
import { legalConfig, show } from "@/config/legal";
import { platformConfig } from "@/config/platform";
import { formatRand } from "@/lib/money";

export const metadata: Metadata = { title: "Terms" };

/** Terms of use for donors and charities. DRAFT for Yosef's review. */
export default function TermsPage() {
  const name = platformConfig.appName;
  return (
    <article className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Terms</h1>
        <p className="text-xs text-muted">Version {legalConfig.policyVersion}</p>
        <DraftNotice />
      </div>

      <Section title="About these terms">
        <p>
          These terms apply to the {name} website and app, run by {show(legalConfig.companyName)}. By donating, signing in or
          listing a charity you agree to them and to our <Link href="/privacy" className="text-brand underline">Privacy Policy</Link>.
          South African law applies.
        </p>
      </Section>

      <Section title="Donating">
        <ul className="list-disc space-y-1 pl-5">
          <li>Your donation goes to the charity you choose. {name} does not charge a fee on donations.</li>
          <li>The minimum donation is {formatRand(platformConfig.minDonationCents)}.</li>
          <li>You may add a separate contribution to {name} (minimum {formatRand(platformConfig.minContributionCents)}). It is optional, is not a donation to the charity, and does not appear on any s18A receipt.</li>
          <li>Payments are taken by our payment provider on our website, never inside the app.</li>
          <li>Refunds: {show(null)} (policy to be confirmed).</li>
          <li>You must be 18 or older, and the details you give must be true. If you give for an organisation, you confirm you are allowed to.</li>
        </ul>
      </Section>

      <Section title="s18A tax receipts">
        <p>
          If a charity is approved under section 18A and has signed a receipting mandate with us, we issue one receipt per
          tax year on its behalf for donations where you asked for one. A receipt covers your donations only, never a
          contribution to {name}. Whether a donation is tax-deductible is between you and SARS.
        </p>
      </Section>

      <Section title="Charities">
        <p>A charity listed on {name} confirms that:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>the person applying is authorised to act for it, and its information and documents are true;</li>
          <li>it will use donations for the purposes it describes, and tell us at once if its registration, PBO or s18A status changes;</li>
          <li>it will use donors&apos; information only to record donations and thank donors, keep it secure under POPIA, and not sell or share it;</li>
          <li>it is responsible for any donor information it downloads from its dashboard.</li>
        </ul>
        <p>We may suspend or remove a charity that breaks these terms. {show(null)} (full charity agreement to be confirmed).</p>
      </Section>

      <Section title="Our responsibility">
        <p>
          {name} is a platform that connects donors with registered charities. The charity, not {name}, is responsible for how
          donations are used. {show(null)} (limits of liability to be confirmed).
        </p>
      </Section>

      <Section title="Contact">
        <p>{show(legalConfig.privacyEmail)}</p>
      </Section>
    </article>
  );
}
