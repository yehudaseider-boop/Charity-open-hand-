import { platformConfig } from "@/config/platform";
import { charityFaqs, donorFaqs, type Faq } from "@/lib/seo/faq";
import { ORGANISATION_DESCRIPTION } from "@/lib/seo/structured-data";

/**
 * llms.txt: a plain guide to Givezy for AI chatbots and assistants (the llmstxt.org format: a title,
 * a one-line summary, then sections of links). The same facts as the FAQ page, nothing more.
 */
export function llmsText(origin: string, charities: { slug: string; name_en: string }[]): string {
  const base = origin.replace(/\/+$/, "");
  const faq = (list: Faq[]) => list.map((f) => `- **${f.q}** ${f.a}`).join("\n");
  const listed = charities
    .filter((c) => /^[a-z0-9-]+$/.test(c.slug))
    .map((c) => `- [${c.name_en.replace(/[\[\]\n]/g, " ").trim()}](${base}/c/${c.slug})`)
    .join("\n");
  return [
    `# ${platformConfig.appName}`,
    "",
    `> ${ORGANISATION_DESCRIPTION} Not to be confused with similarly named companies outside South Africa.`,
    "",
    "## Key pages",
    "",
    `- [Home](${base}/): what ${platformConfig.appName} is and how giving works`,
    `- [Find a charity](${base}/charities): every listed charity, by name, cause or area`,
    `- [For donors](${base}/for-donors): how giving works, monthly gifts, s18A receipts and card privacy`,
    `- [For charities](${base}/for-charities): how a South African charity joins`,
    `- [Questions](${base}/faq): costs, safety, s18A receipts and privacy`,
    `- [Privacy Policy](${base}/privacy) and [Terms](${base}/terms)`,
    "",
    "## For donors",
    "",
    faq(donorFaqs),
    "",
    "## For charities",
    "",
    faq(charityFaqs),
    "",
    "## Charities on Givezy",
    "",
    listed || "The first charities are joining now.",
    "",
  ].join("\n");
}
