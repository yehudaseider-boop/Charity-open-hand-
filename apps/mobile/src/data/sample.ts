/**
 * SAMPLE CONTENT. Fictional organisations and gifts for mock screens only.
 * No real charity names, logos or people.
 */
export type Cause = { id: string; label: string };

export const causes: Cause[] = [
  { id: "all", label: "All" },
  { id: "food", label: "Food and welfare" },
  { id: "torah", label: "Torah education" },
  { id: "shuls", label: "Shuls" },
  { id: "medical", label: "Medical" },
];

export type Charity = {
  slug: string;
  nameEn: string;
  nameHe: string;
  cause: string; // one line
  causeId: string;
  /** Suburb or area it serves. */
  area: string;
  photo: string; // placeholder subject
  issues18a: boolean;
  /** [what it does, how donations are used] */
  about: [string, string];
  featured?: boolean;
};

export const charities: Charity[] = [
  {
    slug: "northcliff-meals-fund",
    nameEn: "Northcliff Meals Fund",
    nameHe: "קרן ארוחות נורת'קליף",
    cause: "Weekly Shabbos parcels for families in need",
    causeId: "food",
    area: "Northcliff",
    photo: "food parcels being packed",
    issues18a: true,
    featured: true,
    about: [
      "Every Thursday, volunteers pack Shabbos food parcels for families across Northcliff and surrounds who are going through a hard time.",
      "Parcels are delivered quietly to the door, and families are referred by rabbonim and social workers who know them.",
    ],
  },
  {
    slug: "linksfield-torah-centre",
    nameEn: "Linksfield Torah Learning Centre",
    nameHe: "מרכז לימוד תורה לינקספילד",
    cause: "Evening shiurim and a kollel for working men",
    causeId: "torah",
    area: "Linksfield",
    photo: "a lit study hall",
    issues18a: true,
    about: [
      "Evening shiurim five nights a week, and a kollel for men who learn after work.",
      "Donations cover the stipends, the building and the seforim library.",
    ],
  },
  {
    slug: "glenhazel-shul-fund",
    nameEn: "Glenhazel Community Shul Fund",
    nameHe: "קרן בית הכנסת גלנהייזל",
    cause: "Upkeep of the shul building and grounds",
    causeId: "shuls",
    area: "Glenhazel",
    photo: "a shul entrance",
    issues18a: false,
    about: [
      "Keeps the shul building safe, warm and open, from the roof to the security at the gate.",
      "Members and visitors give towards repairs, cleaning and the yearly insurance.",
    ],
  },
  {
    slug: "sandton-bikur-cholim",
    nameEn: "Sandton Bikur Cholim",
    nameHe: "ביקור חולים סנדטון",
    cause: "Meals and visits for patients and their families",
    causeId: "medical",
    area: "Sandton",
    photo: "a hospital corridor",
    issues18a: true,
    about: [
      "Volunteers bring kosher meals to patients in Sandton hospitals and sit with families in long waits.",
      "The fund also covers transport to appointments for elderly members of the community.",
    ],
  },
];

export function findCharity(slug: string | undefined): Charity | undefined {
  return charities.find((c) => c.slug === slug);
}

/** Quick amounts, in cents. Multiples of chai (R18). */
