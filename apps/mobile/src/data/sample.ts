import type { ImpactUnit } from "@shared/charity/impact";
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
  { id: "community", label: "Community" },
];

export type Charity = {
  /** Database id (live charities only). */
  id?: string;
  slug: string;
  nameEn: string;
  /** Kept in the data for the website; the app never shows it. */
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
  /** The charity's own impact line ("R180 feeds a family for a week"). Only ever from the charity. */
  impact?: string | null;
  /** What one gift pays for, in the charity's own figure ("R12 pays for one school breakfast"). Only ever from the charity. */
  impactUnit?: ImpactUnit | null;
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
  care: [photo("hf_20261011_003001_241ed450-eab3-4f98-ab62-cd5dc930bf49"), photo("hf_20261011_003002_378081f3-914c-4b04-96e8-d2314e88ea3e"), photo("hf_20261011_003001_5ec0d37f-d2e5-4240-b819-a3efd8cb76b1")],
};
const gallery = (urls: string[], captions: string[]) => urls.slice(1).map((url, i) => ({ id: `p${i}`, url, caption: captions[i] }));

export const charities: Charity[] = [
  {
    slug: "northcliff-meals-fund",
    impact: null, // no invented impact line: only ever the charity's own words
    nameEn: "Northcliff Meals Fund",
    nameHe: "",
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
      { id: "c-winter", title: "Winter food parcels", description: "A full winter parcel, with blankets, for every family on our list.", targetCents: 5_000_000, raisedCents: 3_140_000, giftCount: 86, endsAt: new Date(2027, 6, 31) },
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
    about: [
      "Evening classes five nights a week for adults who want to keep learning after work.",
      "Donations cover the teachers, the building and the library.",
    ],
  },
  {
    slug: "melville-community-hall",
    nameEn: "Melville Community Hall Trust",
    nameHe: "",
    cause: "Upkeep of a hall used by local groups",
    causeId: "community",
    area: "Melville",
    photo: "a community hall entrance",
    issues18a: false,
    about: [
      "Keeps the hall safe, warm and open for local clubs, classes and meetings, from the roof to the security at the gate.",
      "The groups who use it and their neighbours give towards repairs, cleaning and the yearly insurance.",
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
    coverUrl: dummy.care[0],
    photos: gallery(dummy.care, ["A care package ready to go", "Meal delivery on the ward"]),
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

