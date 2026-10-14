/**
 * The three fictional demo charities. Every name, number and person here is made up.
 * Registration numbers use a "DEMO" marker so they can never be mistaken for real ones.
 */
import type { CampaignStatus, DemoCharity, TeamMember } from "./types";

export type CampaignSpec = {
  id: string;
  name: string;
  summary: string;
  startDate: string;
  endDate: string | null;
  status: CampaignStatus;
  /** Relative pull on donations while the campaign runs (the general fund is 1). */
  weight: number;
  /** How far the campaign got: the goal is set from what it raised, so progress looks real. */
  fundedRatio: number;
  /** For drafts, which raise nothing yet. */
  draftGoalCents?: number;
};

export type CharitySpec = {
  charity: DemoCharity;
  seed: number;
  refCode: string;
  /** Once-off donations in an average month. */
  monthlyVolume: number;
  /** Monthly-donation sign-ups over the 12 months. */
  recurringStarts: number;
  /** Chance that a once-off donation comes from someone new. */
  newDonorChance: number;
  /** Amount buckets in Rand with weights, for once-off donations. */
  amounts: [rand: number, weight: number][];
  recurringAmounts: [rand: number, weight: number][];
  /** Month multipliers, January first. */
  seasonality: number[];
  cities: string[];
  campaigns: CampaignSpec[];
  team: TeamMember[];
};

export const CHARITY_SPECS: CharitySpec[] = [
  {
    seed: 1101,
    refCode: "ST",
    charity: {
      id: "sunrise-table",
      name: "Sunrise Table Community Kitchen",
      shortName: "Sunrise Table",
      size: "small",
      cause: "Community meals",
      city: "Johannesburg",
      tagline: "Hot meals, five nights a week, for anyone who walks in.",
      npoNumber: "DEMO-NPO-104-221",
      pboNumber: null,
      s18a: false,
      verification: "in_review",
      publicSlug: "sunrise-table",
      contactEmail: "hello@sunrisetable.example.org",
      contactPhone: "011 555 0142",
      bankName: "Demo Bank",
      bankLast4: "4417",
      initials: "ST",
    },
    monthlyVolume: 38,
    recurringStarts: 26,
    newDonorChance: 0.42,
    amounts: [[50, 14], [100, 22], [150, 10], [200, 14], [250, 9], [300, 6], [500, 10], [1000, 4], [2000, 1]],
    recurringAmounts: [[50, 4], [100, 8], [150, 3], [200, 4], [250, 2], [500, 1]],
    seasonality: [0.8, 0.75, 0.85, 0.9, 1.05, 1.35, 1.45, 1.25, 1.1, 1.0, 0.95, 1.3],
    cities: ["Johannesburg", "Yeoville", "Observatory", "Bezuidenhout Valley", "Kensington", "Orange Grove", "Randburg"],
    campaigns: [
      { id: "st-winter", name: "Winter soup drive 2026", summary: "Soup, bread and blankets through the cold months.", startDate: "2026-05-01", endDate: "2026-08-31", status: "ended", weight: 2.4, fundedRatio: 1.08 },
      { id: "st-fridge", name: "New walk-in fridge", summary: "Replace the 15-year-old fridge so we can store donated food safely.", startDate: "2026-08-15", endDate: "2026-12-15", status: "active", weight: 1.6, fundedRatio: 0.58 },
      { id: "st-festive", name: "Festive season meals 2025", summary: "Christmas and New Year meals for 400 guests.", startDate: "2025-11-15", endDate: "2026-01-10", status: "ended", weight: 2.0, fundedRatio: 0.92 },
      { id: "st-volunteers", name: "Volunteer aprons and gear", summary: "Aprons, gloves and hairnets for 60 volunteers.", startDate: "2026-11-01", endDate: null, status: "draft", weight: 0, fundedRatio: 0, draftGoalCents: 1_200_000 },
    ],
    team: [
      { id: "tm-st-1", name: "Nomvula Dube", email: "nomvula@sunrisetable.example.org", role: "owner", status: "active", lastActive: "2026-10-14T07:42:00Z", twoStep: true },
      { id: "tm-st-2", name: "Craig Petersen", email: "craig@sunrisetable.example.org", role: "finance", status: "active", lastActive: "2026-10-10T13:05:00Z", twoStep: true },
    ],
  },
  {
    seed: 2202,
    refCode: "BF",
    charity: {
      id: "bright-futures",
      name: "Bright Futures Learning Trust",
      shortName: "Bright Futures",
      size: "medium",
      cause: "Education",
      city: "Cape Town",
      tagline: "Tutoring, school shoes and bursaries for learners in Khayelitsha and Mitchells Plain.",
      npoNumber: "DEMO-NPO-187-554",
      pboNumber: "DEMO-PBO-930-071",
      s18a: true,
      verification: "verified",
      publicSlug: "bright-futures",
      contactEmail: "office@brightfutures.example.org",
      contactPhone: "021 555 0198",
      bankName: "Demo Bank",
      bankLast4: "8812",
      initials: "BF",
    },
    monthlyVolume: 165,
    recurringStarts: 150,
    newDonorChance: 0.36,
    amounts: [[100, 12], [200, 18], [250, 12], [300, 8], [500, 20], [750, 5], [1000, 12], [1500, 3], [2500, 5], [5000, 3], [10000, 1]],
    recurringAmounts: [[100, 6], [200, 9], [250, 6], [300, 4], [500, 7], [1000, 3]],
    seasonality: [1.45, 1.05, 0.9, 0.85, 0.9, 0.95, 0.9, 1.0, 0.95, 1.0, 1.1, 1.35],
    cities: ["Cape Town", "Rondebosch", "Claremont", "Sea Point", "Durbanville", "Stellenbosch", "Bellville", "Gardens", "Observatory"],
    campaigns: [
      { id: "bf-maths", name: "Matric maths tutoring 2026", summary: "Saturday maths classes for 180 matric learners.", startDate: "2026-02-01", endDate: "2026-11-30", status: "active", weight: 1.7, fundedRatio: 0.83 },
      { id: "bf-shoes", name: "School shoes for 300 learners", summary: "A new pair of school shoes for every learner on our list.", startDate: "2025-12-01", endDate: "2026-02-28", status: "ended", weight: 2.2, fundedRatio: 1.16 },
      { id: "bf-library", name: "Reading corner build", summary: "Shelves, books and beanbags for four primary schools.", startDate: "2026-06-01", endDate: "2026-12-31", status: "active", weight: 1.1, fundedRatio: 0.47 },
      { id: "bf-bursary", name: "Bursary fund 2027", summary: "First-year university fees for 12 learners.", startDate: "2026-09-01", endDate: "2027-01-31", status: "active", weight: 1.8, fundedRatio: 0.31 },
      { id: "bf-stationery", name: "Back-to-school stationery", summary: "Stationery packs for the start of the school year.", startDate: "2025-11-01", endDate: "2026-01-31", status: "ended", weight: 1.3, fundedRatio: 0.88 },
      { id: "bf-teachers", name: "Teacher training weekend", summary: "A two-day maths teaching workshop for 40 teachers.", startDate: "2026-07-01", endDate: "2026-12-31", status: "paused", weight: 0.6, fundedRatio: 0.22 },
      { id: "bf-laptops", name: "Laptops for matrics 2027", summary: "Refurbished laptops for next year's matric class.", startDate: "2027-01-15", endDate: null, status: "draft", weight: 0, fundedRatio: 0, draftGoalCents: 18_000_000 },
    ],
    team: [
      { id: "tm-bf-1", name: "Ayesha Abrahams", email: "ayesha@brightfutures.example.org", role: "owner", status: "active", lastActive: "2026-10-14T08:15:00Z", twoStep: true },
      { id: "tm-bf-2", name: "Lwazi Mthembu", email: "lwazi@brightfutures.example.org", role: "admin", status: "active", lastActive: "2026-10-13T16:40:00Z", twoStep: true },
      { id: "tm-bf-3", name: "Karen Fourie", email: "karen@brightfutures.example.org", role: "finance", status: "active", lastActive: "2026-10-09T10:22:00Z", twoStep: true },
      { id: "tm-bf-4", name: "Sam Daniels", email: "sam@brightfutures.example.org", role: "viewer", status: "invited", lastActive: null, twoStep: false },
    ],
  },
  {
    seed: 3303,
    refCode: "EM",
    charity: {
      id: "ezra-medical",
      name: "Ezra Medical Assistance Fund",
      shortName: "Ezra Medical",
      size: "large",
      cause: "Medical assistance",
      city: "Johannesburg",
      tagline: "Paying for surgery, medicine and transport when medical aid runs out.",
      npoNumber: "DEMO-NPO-055-318",
      pboNumber: "DEMO-PBO-930-412",
      s18a: true,
      verification: "verified",
      publicSlug: "ezra-medical",
      contactEmail: "finance@ezramedical.example.org",
      contactPhone: "011 555 0177",
      bankName: "Demo Bank",
      bankLast4: "2093",
      initials: "EM",
    },
    monthlyVolume: 470,
    recurringStarts: 430,
    newDonorChance: 0.3,
    amounts: [[100, 8], [180, 10], [250, 10], [360, 12], [500, 16], [1000, 14], [1800, 9], [2500, 6], [5000, 6], [10000, 3], [25000, 1], [50000, 0.4]],
    recurringAmounts: [[100, 4], [180, 5], [250, 5], [360, 6], [500, 7], [1000, 5], [1800, 2], [2500, 1]],
    seasonality: [0.95, 0.9, 1.0, 1.05, 0.95, 1.1, 1.15, 1.0, 1.4, 1.2, 1.0, 1.25],
    cities: ["Johannesburg", "Sandton", "Glenhazel", "Houghton", "Sydenham", "Linksfield", "Rosebank", "Pretoria", "Durban", "Cape Town", "Fourways", "Randburg"],
    campaigns: [
      { id: "em-surgery", name: "Emergency surgery fund", summary: "Covers the gap when a patient needs surgery now and medical aid says no.", startDate: "2025-10-15", endDate: null, status: "active", weight: 2.2, fundedRatio: 0.74 },
      { id: "em-chemo", name: "Chemo transport", summary: "Lifts to and from chemotherapy for patients without a car.", startDate: "2026-01-15", endDate: null, status: "active", weight: 1.2, fundedRatio: 0.69 },
      { id: "em-dialysis", name: "Dialysis support 2026", summary: "Dialysis sessions for six patients waiting for transplants.", startDate: "2026-03-01", endDate: "2026-12-31", status: "active", weight: 1.5, fundedRatio: 0.81 },
      { id: "em-hearing", name: "Hearing aids for children", summary: "Hearing aids and fittings for 25 children.", startDate: "2025-11-01", endDate: "2026-04-30", status: "ended", weight: 1.3, fundedRatio: 1.21 },
      { id: "em-winter", name: "Winter medicine drive", summary: "Flu vaccines and chronic medicine for elderly patients.", startDate: "2026-05-01", endDate: "2026-08-31", status: "ended", weight: 1.6, fundedRatio: 0.97 },
      { id: "em-yomtov", name: "Yom Tov medical appeal", summary: "Our yearly appeal over the Yamim Noraim.", startDate: "2026-09-01", endDate: "2026-10-31", status: "active", weight: 2.6, fundedRatio: 0.66 },
      { id: "em-wheelchairs", name: "Wheelchairs and walkers", summary: "Mobility aids for patients leaving hospital.", startDate: "2026-04-01", endDate: "2026-09-30", status: "paused", weight: 0.7, fundedRatio: 0.62 },
      { id: "em-mri", name: "MRI scan fund", summary: "Private MRI scans when public waiting lists are months long.", startDate: "2027-01-01", endDate: null, status: "draft", weight: 0, fundedRatio: 0, draftGoalCents: 50_000_000 },
    ],
    team: [
      { id: "tm-em-1", name: "Rivka Sacks", email: "rivka@ezramedical.example.org", role: "owner", status: "active", lastActive: "2026-10-14T06:55:00Z", twoStep: true },
      { id: "tm-em-2", name: "Thabo Molefe", email: "thabo@ezramedical.example.org", role: "admin", status: "active", lastActive: "2026-10-14T09:31:00Z", twoStep: true },
      { id: "tm-em-3", name: "Deborah Klein", email: "deborah@ezramedical.example.org", role: "finance", status: "active", lastActive: "2026-10-12T11:02:00Z", twoStep: true },
      { id: "tm-em-4", name: "Pieter Botha", email: "pieter@ezramedical.example.org", role: "finance", status: "active", lastActive: "2026-10-07T14:48:00Z", twoStep: false },
      { id: "tm-em-5", name: "Lerato Nkosi", email: "lerato@ezramedical.example.org", role: "viewer", status: "active", lastActive: "2026-09-30T08:10:00Z", twoStep: true },
    ],
  },
];

export const DEMO_CHARITIES = CHARITY_SPECS.map((s) => s.charity);
