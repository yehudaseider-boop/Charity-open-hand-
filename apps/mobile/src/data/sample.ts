/**
 * SAMPLE CONTENT. Fictional organisations and gifts for mock screens only.
 * No real charity names, logos or people.
 */
export type Cause = { id: string; label: string };

export const causes: Cause[] = [
  { id: "all", label: "All" },
  { id: "food", label: "Food and welfare" },
  { id: "education", label: "Education" },
  { id: "health", label: "Health" },
  { id: "animals", label: "Animals" },
  { id: "faith", label: "Faith communities" },
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
  /** Active campaigns with their running totals. */
  campaigns?: Campaign[];
};

/** A charity's campaign: a goal in Rand and what has been given to it so far (paid gifts only). */
export type Campaign = { id: string; title: string; description: string | null; targetCents: number | null; raisedCents: number; giftCount: number; endsAt: Date | null };

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
    cause: "Weekly food parcels for families in need",
    causeId: "food",
    area: "Northcliff",
    photo: "food parcels being packed",
    issues18a: true,
    featured: true,
    coverUrl: dummy.meals[0],
    photos: gallery(dummy.meals, ["Fresh bread in every parcel", "Sorting fruit and vegetables on a Thursday night"]),
    // Sample figures for the design preview only.
    campaigns: [
      { id: "c-pesach", title: "Winter food parcels", description: "A full winter parcel, with blankets, for every family on our list.", targetCents: 5_000_000, raisedCents: 3_140_000, giftCount: 86, endsAt: new Date(2027, 6, 31) },
    ],
    updates: [
      { id: "u1", date: new Date(2026, 9, 2), body: "Thursday night packing went late this week. Thank you to everyone who came to help.", photoUrl: dummy.meals[2] },
      { id: "u2", date: new Date(2026, 8, 18), body: "Month-end parcels went out on Friday. Every family on our list received one.", photoUrl: null },
    ],
    about: [
      "Every Thursday, volunteers pack food parcels for families across Northcliff and surrounds who are going through a hard time.",
      "Parcels are delivered quietly to the door, and families are referred by social workers and community leaders who know them.",
    ],
  },
  {
    slug: "linksfield-learning-centre",
    nameEn: "Linksfield Evening Learning Centre",
    nameHe: "",
    cause: "Evening classes and study groups for working adults",
    causeId: "education",
    area: "Linksfield",
    photo: "a lit study hall",
    issues18a: true,
    coverUrl: dummy.torah[0],
    photos: gallery(dummy.torah, ["The library", "Evening class seating"]),
    about: [
      "Evening classes five nights a week for adults who want to keep learning after work.",
      "Donations cover the teachers, the building and the library.",
    ],
  },
  {
    slug: "glenhazel-shul-fund",
    nameEn: "Glenhazel Community Shul Fund",
    nameHe: "קרן בית הכנסת גלנהייזל",
    cause: "Upkeep of the shul building and grounds",
    causeId: "faith",
    area: "Glenhazel",
    photo: "a shul entrance",
    issues18a: false,
    coverUrl: dummy.shul[0],
    photos: gallery(dummy.shul, ["A community lunch in the hall", "The entrance on a Sunday morning"]),
    about: [
      "Keeps the shul building safe, warm and open, from the roof to the security at the gate.",
      "Members and visitors give towards repairs, cleaning and the yearly insurance.",
    ],
  },
  {
    slug: "sandton-patient-care",
    nameEn: "Sandton Patient Care Volunteers",
    nameHe: "",
    cause: "Meals and visits for patients and their families",
    causeId: "health",
    area: "Sandton",
    photo: "a hospital corridor",
    issues18a: true,
    coverUrl: dummy.cholim[0],
    photos: gallery(dummy.cholim, ["A care package ready to go", "Meal delivery on the ward"]),
    about: [
      "Volunteers bring meals to patients in Sandton hospitals and sit with families in long waits.",
      "The fund also covers transport to appointments for elderly people in the area.",
    ],
  },
  {
    slug: "randburg-animal-rescue",
    nameEn: "Randburg Animal Rescue",
    nameHe: "",
    cause: "Rescue, vet care and new homes for dogs and cats",
    causeId: "animals",
    area: "Randburg",
    photo: "a rescued dog",
    issues18a: true,
    about: [
      "Takes in abandoned and injured dogs and cats, gets them to the vet, and finds them loving homes.",
      "Donations pay for food, vaccinations and sterilisation.",
    ],
  },
];

export function findCharity(slug: string | undefined): Charity | undefined {
  return charities.find((c) => c.slug === slug);
}

