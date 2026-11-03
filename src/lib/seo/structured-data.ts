import { platformConfig } from "@/config/platform";
import type { Faq } from "@/lib/seo/faq";

/**
 * Structured data (schema.org JSON-LD): the labels search engines and chatbots read to know that
 * Givezy is an organisation, a page is a charity, and a link is where to give. Only facts we can
 * back; nothing is filled in by guess.
 */
type Json = Record<string, unknown>;

const strip = (origin: string) => origin.replace(/\/+$/, "");

export const ORGANISATION_DESCRIPTION =
  "Givezy is a South African giving platform. Find a registered, checked charity, give once or every month, and keep every gift and s18A receipt in one place.";

/** Givezy itself, and the site's search (Google can show a search box for it). */
export function organisationData(origin: string): Json[] {
  const base = strip(origin);
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${base}/#organisation`,
      name: platformConfig.appName,
      url: `${base}/`,
      logo: `${base}/logo.png`,
      description: ORGANISATION_DESCRIPTION,
      areaServed: { "@type": "Country", name: "South Africa" },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${base}/#website`,
      name: platformConfig.appName,
      url: `${base}/`,
      inLanguage: "en-ZA",
      publisher: { "@id": `${base}/#organisation` },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${base}/charities?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
  ];
}

export type CharityFacts = {
  slug: string;
  name: string;
  legalName: string | null;
  description: string | null;
  website: string | null;
  npoNumber: string | null;
  pboNumber: string | null;
  suburb: string | null;
  city: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  acceptingGifts: boolean;
};

/** A charity's page: who it is, where, its registration numbers, and where to give. */
export function charityData(origin: string, c: CharityFacts): Json {
  const base = strip(origin);
  const url = `${base}/c/${c.slug}`;
  const ids = [
    c.npoNumber ? { "@type": "PropertyValue", propertyID: "NPO number", value: c.npoNumber } : null,
    c.pboNumber ? { "@type": "PropertyValue", propertyID: "PBO number", value: c.pboNumber } : null,
  ].filter(Boolean);
  const data: Json = {
    "@context": "https://schema.org",
    "@type": "NGO",
    "@id": `${url}#charity`,
    name: c.name,
    url,
  };
  if (c.legalName && c.legalName !== c.name) data.legalName = c.legalName;
  if (c.description) data.description = c.description.slice(0, 500);
  if (c.logoUrl) data.logo = c.logoUrl;
  if (c.coverUrl ?? c.logoUrl) data.image = c.coverUrl ?? c.logoUrl;
  if (c.website && /^https?:\/\//.test(c.website)) data.sameAs = [c.website];
  if (ids.length) data.identifier = ids;
  if (c.suburb || c.city) {
    data.address = {
      "@type": "PostalAddress",
      ...(c.suburb ? { addressLocality: c.suburb } : {}),
      ...(c.city ? { addressRegion: c.city } : {}),
      addressCountry: "ZA",
    };
  }
  if (c.acceptingGifts) {
    data.potentialAction = { "@type": "DonateAction", name: `Give to ${c.name}`, target: `${url}/donate`, recipient: { "@id": `${url}#charity` } };
  }
  return data;
}

/** The FAQ page's questions and answers. */
export function faqData(faqs: Faq[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

/** Safe to put inside a <script> tag: no "<" can close it early. */
export function jsonLdString(data: Json | Json[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
