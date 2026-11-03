/** What search engines, chatbots and link previews read about Givezy: true facts, safe markup, the test site hidden. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { platformConfig } from "@/config/platform";
import { formatRand } from "@/lib/money";
import { allFaqs } from "@/lib/seo/faq";
import { siteIndexable } from "@/lib/seo/indexing";
import { llmsText } from "@/lib/seo/llms";
import { headlineSize, headlineText } from "@/lib/seo/share-image";
import { charityData, faqData, jsonLdString, organisationData } from "@/lib/seo/structured-data";

const charity = {
  slug: "meals-fund",
  name: "Northcliff Meals Fund",
  legalName: "Northcliff Meals Fund NPC",
  description: "Food parcels every Friday.",
  website: "https://meals.example",
  npoNumber: "123-456 NPO",
  pboNumber: null,
  suburb: "Northcliff",
  city: "Johannesburg",
  logoUrl: "https://img.example/logo.png",
  coverUrl: null,
  acceptingGifts: true,
};

describe("the test site stays out of search results", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is hidden unless SITE_INDEXING is exactly yes", () => {
    vi.stubEnv("SITE_INDEXING", "");
    expect(siteIndexable()).toBe(false);
    vi.stubEnv("SITE_INDEXING", "true");
    expect(siteIndexable()).toBe(false);
    vi.stubEnv("SITE_INDEXING", "yes");
    expect(siteIndexable()).toBe(true);
  });
});

describe("structured data", () => {
  it("describes Givezy as a South African organisation, with the site's search", () => {
    const [org, site] = organisationData("https://givezy.test/");
    expect(org).toMatchObject({ "@type": "Organization", name: "Givezy", url: "https://givezy.test/", logo: "https://givezy.test/logo.png" });
    expect(org.areaServed).toEqual({ "@type": "Country", name: "South Africa" });
    expect(JSON.stringify(site)).toContain("https://givezy.test/charities?q={search_term_string}");
  });

  it("describes a charity with its numbers, area and where to give", () => {
    const d = charityData("https://givezy.test", charity);
    expect(d).toMatchObject({ "@type": "NGO", name: "Northcliff Meals Fund", legalName: "Northcliff Meals Fund NPC", url: "https://givezy.test/c/meals-fund", sameAs: ["https://meals.example"] });
    expect(d.identifier).toEqual([{ "@type": "PropertyValue", propertyID: "NPO number", value: "123-456 NPO" }]);
    expect(d.address).toEqual({ "@type": "PostalAddress", addressLocality: "Northcliff", addressRegion: "Johannesburg", addressCountry: "ZA" });
    expect(d.potentialAction).toMatchObject({ "@type": "DonateAction", target: "https://givezy.test/c/meals-fund/donate" });
  });

  it("leaves out what a charity hasn't given, and the give link when it can't take gifts", () => {
    const d = charityData("https://givezy.test", { ...charity, legalName: "Northcliff Meals Fund", website: "javascript:alert(1)", npoNumber: null, suburb: null, city: null, acceptingGifts: false });
    for (const k of ["legalName", "sameAs", "identifier", "address", "potentialAction"]) expect(d).not.toHaveProperty(k);
  });

  it("can't be broken out of its script tag by a charity's own words", () => {
    const s = jsonLdString(charityData("https://givezy.test", { ...charity, description: "</script><script>alert(1)</script>" }));
    expect(s).not.toContain("<");
    expect(JSON.parse(s).description).toBe("</script><script>alert(1)</script>");
  });

  it("lists every FAQ question with its answer", () => {
    const d = faqData(allFaqs) as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
    expect(d.mainEntity).toHaveLength(allFaqs.length);
    expect(d.mainEntity[0]).toEqual({ "@type": "Question", name: allFaqs[0].q, acceptedAnswer: { "@type": "Answer", text: allFaqs[0].a } });
  });
});

describe("the FAQ answers", () => {
  const text = allFaqs.map((f) => `${f.q} ${f.a}`).join(" ");

  it("take amounts from the platform settings, never typed in", () => {
    expect(text).toContain(formatRand(platformConfig.minDonationCents));
    expect(text).toContain(formatRand(platformConfig.maxDonationCents));
    expect(text).toContain(formatRand(platformConfig.minContributionCents));
    expect(text).toContain(`${platformConfig.applicationReviewWorkingDays} working days`);
  });

  it("follow the house style", () => {
    expect(text).not.toMatch(/[!—]/);
    expect(text).not.toMatch(/S18A|section 18A/);
  });
});

describe("llms.txt", () => {
  it("names Givezy, links the key pages and lists the charities", () => {
    const t = llmsText("https://givezy.test/", [{ slug: "meals-fund", name_en: "Northcliff [Meals] Fund" }, { slug: "x/../admin", name_en: "Bad" }]);
    expect(t.startsWith("# Givezy\n\n> ")).toBe(true);
    expect(t).toContain("(https://givezy.test/faq)");
    expect(t).toContain("- [Northcliff  Meals  Fund](https://givezy.test/c/meals-fund)");
    expect(t).not.toContain("admin");
  });

  it("says so when no charity is listed yet", () => {
    expect(llmsText("https://givezy.test", [])).toContain("The first charities are joining now.");
  });
});

describe("share pictures", () => {
  it("shrink the headline for long charity names", () => {
    expect(headlineSize("Give to Meals")).toBe(76);
    expect(headlineSize("Give to the Northcliff Community Meals Fund")).toBe(64);
    expect(headlineSize("Give to " + "a".repeat(80))).toBe(46);
  });

  it("read the headline as one line of text, blue words included", () => {
    expect(headlineText(["Give to", { blue: " Northcliff  Meals Fund " }])).toBe("Give to Northcliff Meals Fund");
  });
});
