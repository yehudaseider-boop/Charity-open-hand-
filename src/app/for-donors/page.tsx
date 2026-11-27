import type { Metadata } from "next";
import Link from "next/link";
import { AudienceSwitch } from "@/components/audience-switch";
import { CheckedPicture, GoalPicture, MonthlyPicture, PhonePicture, ReceiptPicture, SecurePagePicture, TributePicture, UpdatePicture } from "@/components/landing/pictures";
import { ArrowRight, BlueBlock, Chapter, Closing, PageHero, Questions, StepCards, arrowLink, orangeButton } from "@/components/landing/sections";
import { Illustration } from "@/components/illustration";
import { Key } from "@/components/marketing";
import { appLinks } from "@/config/app-links";
import { platformConfig } from "@/config/platform";
import { donorFaqs, withoutCostQuestions } from "@/lib/seo/faq";

// For donors (11/11/2026, Yehuda: "I give" opens a full page that walks people through everything). DRAFT WORDING for
// Yehuda to approve. Every claim is one the site does today (see lib/seo/faq.ts, approved 03/11/2026). Nothing about
// fees until they are settled (Yehuda, 11/11/2026). Pictures are labelled samples with made-up figures.

const { appName } = platformConfig;

export const metadata: Metadata = {
  title: "For donors",
  description: `Give to checked South African charities in a few taps, once or every month, and keep every gift and s18A receipt in one ${appName} account.`,
};

export default function ForDonorsPage() {
  return (
    <div className="full-bleed overflow-x-clip">
      <PageHero
        top={<AudienceSwitch current="give" />}
        title={<>Give in a few taps. <Key>Keep every receipt.</Key></>}
        lead={<>Find a checked South African charity, give once or every month, and keep every gift and s18A receipt in one {appName} account.</>}
        actions={
          <>
            <Link href="/charities" className={orangeButton}>Find a charity</Link>
            <a href="#how" className={arrowLink}>How it works<ArrowRight /></a>
          </>
        }
        picture={<PhonePicture />}
      />

      <StepCards
        id="how"
        title={<>From a cause you care about to a receipt in your account.</>}
        lead="Four steps, a minute or two. You can give as a guest or with an account."
        steps={[
          { icon: "search", title: "Find a charity", body: "Search by name, cause or area. Every charity is checked by a person before it can take a gift." },
          { icon: "heart", title: "Pick an amount", body: "Give once, or every month. Add someone's name if the gift is in their memory or honour." },
          { icon: "lock", title: "Pay on a secure page", body: `You type your card on the payment provider's own page. ${appName} never sees it.` },
          { icon: "receipt", title: "Keep the record", body: "Every gift lands in your account, with your s18A receipt once the tax year ends." },
        ]}
      />

      <Chapter
        title={<>Give the way that suits you.</>}
        body="A once-off gift when something moves you, or the same amount every month for a cause you stand behind. A monthly donation is always yours to change."
        points={[
          { icon: "repeat", title: "Pause, resume or stop", body: "From your account, whenever you like. Nobody to phone, no form to fill in." },
          { icon: "mail", title: "Told before anything goes wrong", body: "If a monthly card is declined, we tell you plainly what happened and what to do." },
        ]}
        picture={<MonthlyPicture />}
      />

      <Chapter
        flip
        title={<>A gift that means something.</>}
        body="Give in memory of someone, or in their honour. Or give quietly: choose to give anonymously and your name stays off public pages and live totals."
        picture={<TributePicture />}
      />

      <Chapter
        title={<>Tax time, without the hunt.</>}
        body="If a charity is approved to issue s18A receipts, tick “I'd like an s18A receipt” when you give. You get one receipt for all your gifts to that charity each tax year (1 March to the end of February), kept in your account for your tax return."
        points={[
          { icon: "receipt", title: "One receipt a year from each charity", body: "Not a pile of slips. One clear receipt per charity, per tax year." },
          { icon: "download", title: "Ready when you need it", body: "Download it from your account, any time after the tax year ends." },
        ]}
        picture={<ReceiptPicture />}
      />

      <BlueBlock
        id="safe"
        title={<>Private by design.</>}
        body={`You pay on the payment provider's secure page. ${appName} never sees your card and never holds your money.`}
        points={[
          { icon: "lock", title: "Your card stays private", body: `You type it on the provider's own page. ${appName} never sees or stores it.` },
          { icon: "eye", title: "Charities see only what they need", body: "Enough to thank you and record your gift. They don't see your ID number, except in the SARS return the law requires." },
          { icon: "user", title: "Give anonymously", body: "Your name then won't appear on public pages, campaign lists or live totals." },
          { icon: "shield", title: "Your information is yours", body: "See and download everything we hold about you, and ask us to correct or delete it." },
        ]}
      >
        <div className="max-w-[24rem]"><SecurePagePicture /></div>
      </BlueBlock>

      <Chapter
        title={<>Every charity is checked by a person.</>}
        body="Before a charity can take a gift on Givezy, a person looks at its registration documents and bank details. On every charity's page you can see that it's verified, and whether it issues s18A receipts."
        points={[
          { icon: "building", title: "Registered South African organisations", body: "NPOs and PBOs, with their registration documents checked." },
          { icon: "bank", title: "Paid to the charity's own bank account", body: "Bank details are checked against a bank confirmation letter." },
        ]}
        picture={<CheckedPicture />}
      >
        <Link href="/charities" className={arrowLink}>See who&apos;s on {appName}<ArrowRight /></Link>
      </Chapter>

      <Chapter
        flip
        title={<>See what your giving does.</>}
        body="Charities thank you in their own words, post updates (some with a video), and run campaigns with a goal you can watch fill up."
        picture={<UpdatePicture />}
      />

      <Chapter
        title={<>Your giving, in your pocket.</>}
        body={appLinks.launchMonth ? `The ${appName} app is coming to the App Store and Google Play in ${appLinks.launchMonth}. Until then, you can give on the website.` : `The ${appName} app is coming to the App Store and Google Play. Until then, you can give on the website.`}
        points={[
          { icon: "heart", title: "Causes you care about first", body: "Tell it what matters to you, and those charities show first." },
          { icon: "chart", title: "A goal for the tax year", body: "Set one if you like, and watch your giving add up. Skip it if you don't." },
          { icon: "receipt", title: "Every gift and receipt", body: "The same account as the website, so nothing is in two places." },
        ]}
        picture={<GoalPicture />}
      />

      <Questions
        title={<>Good to know.</>}
        faqs={withoutCostQuestions(donorFaqs)}
        more={<Link href="/faq" className={arrowLink}>All questions<ArrowRight /></Link>}
      />

      <Closing
        title={<>Ready when you are.</>}
        body="Find a charity you believe in, and give in a few taps. Your gift and your s18A receipt stay together in one place."
        action={
          <>
            <Link href="/charities" className={orangeButton}>Find a charity</Link>
            <Link href="/for-charities" className={arrowLink}>Run a charity?<ArrowRight /></Link>
          </>
        }
        side={<Illustration name="loveIt" sparkle="hearts" className="mx-auto w-full max-w-[16rem]" />}
      />
    </div>
  );
}
