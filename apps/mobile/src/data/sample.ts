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
  /** Database id (live charities only). */
  id?: string;
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
  /** Live charities can be in several causes. */
  causeIds?: string[];
  /** Real images from the charity, once it has uploaded them. */
  coverUrl?: string | null;
  photos?: CharityPhoto[];
  updates?: CharityUpdate[];
};

export type CharityPhoto = { id: string; url: string; caption: string | null };
export type CharityUpdate = { id: string; date: Date; body: string; photoUrl: string | null };

/**
 * DUMMY PHOTOS, made with an image generator, so the sample charities look as
 * they will with real pictures. Replace with each charity's own photographs.
 */
const photo = (file: string) => `https://d8j0ntlcm91z4.cloudfront.net/user_3JMbY89afWySU23FksuSQhKkNXQ/${file}.png`;
const dummy = {
  meals: [photo("hf_20261011_002939_f36bd191-cf6e-4347-a046-ffb5def7c7af"), photo("hf_20261011_002939_9ce51b70-d481-40a2-9fce-7e0cdef4d455"), photo("hf_20261011_002939_dd537826-017f-4a64-9d4a-e60b81154878")],
  torah: [photo("hf_20261011_002938_88dd6881-670a-4e28-a662-11820e95899d"), photo("hf_20261011_002939_99389e3d-0f2c-41a5-aa8b-051c3e53d069"), photo("hf_20261011_002939_d8475a72-978e-4025-9173-93db0dc6afac")],
  shul: [photo("hf_20261011_002938_e5a9e68f-7b9d-4d0c-a7ae-9604f1c8ff31"), photo("hf_20261011_002940_11c2d9f2-7530-494b-9a60-9ab39a23969c"), photo("hf_20261011_003001_37eaa619-19e7-48fa-aaa7-74d048065550")],
  cholim: [photo("hf_20261011_003001_241ed450-eab3-4f98-ab62-cd5dc930bf49"), photo("hf_20261011_003002_378081f3-914c-4b04-96e8-d2314e88ea3e"), photo("hf_20261011_003001_5ec0d37f-d2e5-4240-b819-a3efd8cb76b1")],
};
const gallery = (urls: string[], captions: string[]) => urls.slice(1).map((url, i) => ({ id: `p${i}`, url, caption: captions[i] }));

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
    coverUrl: dummy.meals[0],
    photos: gallery(dummy.meals, ["Fresh challah in every parcel", "Sorting fruit and vegetables on a Thursday night"]),
    updates: [
      { id: "u1", date: new Date(2026, 9, 2), body: "Thursday night packing went late this week. Thank you to everyone who came to help.", photoUrl: dummy.meals[2] },
      { id: "u2", date: new Date(2026, 8, 18), body: "Yom Tov parcels went out before Sukkos. Every family on our list received one.", photoUrl: null },
    ],
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
    coverUrl: dummy.torah[0],
    photos: gallery(dummy.torah, ["The seforim library", "Evening shiur seating"]),
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
    coverUrl: dummy.shul[0],
    photos: gallery(dummy.shul, ["Shabbos table at the shul", "The entrance on a Sunday morning"]),
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
    coverUrl: dummy.cholim[0],
    photos: gallery(dummy.cholim, ["A care package ready to go", "Meal delivery on the ward"]),
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
