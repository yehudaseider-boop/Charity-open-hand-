import { platformConfig } from "@/config/platform";
import { formatRand } from "@/lib/money";

/**
 * The questions people ask about Givezy, answered from facts we can back today. One list for the
 * FAQ page, its structured data (what search engines and chatbots read) and llms.txt.
 * Wording approved by Yehuda, 03/11/2026. Change it only with his OK.
 */
export type Faq = { q: string; a: string };

const { appName } = platformConfig;
const min = formatRand(platformConfig.minDonationCents);
const max = formatRand(platformConfig.maxDonationCents);
const minContribution = formatRand(platformConfig.minContributionCents);
const defaultContribution = formatRand(platformConfig.contributionDefaultCents);
const reviewDays = platformConfig.applicationReviewWorkingDays;

export const donorFaqs: Faq[] = [
  {
    q: `What is ${appName}?`,
    a: `${appName} is a South African website and app for giving to registered charities. Find a charity, give once or every month, and keep every gift and s18A receipt in one account.`,
  },
  {
    q: `Is ${appName} safe?`,
    a: `A person looks at each charity's registration documents and bank details before it can take a gift. You pay on the payment provider's secure page: ${appName} never sees your card and never holds your money.`,
  },
  {
    q: "What do I pay?",
    a: `Your gift, and anything you choose to add. The give form also offers a separate contribution to ${appName}, which keeps it running: ${defaultContribution} is preselected, you can type your own amount from ${minContribution}, or choose No thanks to give nothing extra. The total shows every line before you pay.`,
  },
  {
    q: "How much can I give?",
    a: `From ${min} per gift, up to ${max} online.`,
  },
  {
    q: "Can I give every month?",
    a: "Yes. Choose to give every month when you give. You can pause, resume or cancel a monthly donation from your account.",
  },
  {
    q: "How do s18A receipts work?",
    a: "If the charity is approved to issue s18A receipts, tick \"I want an s18A receipt\" when you give. You get one s18A receipt for all your donations to that charity each tax year (1 March to the end of February), kept in your account for your tax return.",
  },
  {
    q: "Who sees my details?",
    a: `The charity sees what it needs to thank you and record your gift. The rest stays between you and ${appName}. Charities never see your ID number. You can also give anonymously: your name then won't appear on public pages, campaign lists or live totals.`,
  },
];

export const charityFaqs: Faq[] = [
  {
    q: `How does a charity join ${appName}?`,
    a: `Apply online in one sitting, or save and come back. We check every application by hand within ${reviewDays} working days and email you the outcome.`,
  },
];

export const allFaqs: Faq[] = [...donorFaqs, ...charityFaqs];

/**
 * The questions without any that talk about cost or fees (Yehuda, 11/11/2026: say nothing about fees on the For donors,
 * For charities and home pages until the fees are settled). The cost questions themselves were taken out the same day.
 */
export function withoutCostQuestions(faqs: Faq[]): Faq[] {
  return faqs.filter((f) => !/\b(cost|costs|fee|fees|free)\b/i.test(`${f.q} ${f.a}`));
}
