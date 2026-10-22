/**
 * The demo's made-up data: charities, about a hundred donors, two tax years of gifts, monthly donors,
 * campaigns, recorded EFT gifts, donor notes, tags, follow-ups, saved lists, emails to donors, deposits
 * and the cause of the week. Every name is invented and every address ends in .test (never deliverable).
 *
 * Pure: no database and no clock. The same "today" always gives the same data, and dates are counted
 * back from today, so the demo looks fresh every day (new donors are new, lapsed donors are lapsed).
 * Money is integer cents. No fee is invented: processing and deposit fees are zero (the gateway's rates
 * are not set yet, see src/config/platform.ts); a contribution is a donor's own choice, so some have one.
 */
import { taxYearFor } from "@/lib/dates";

export type Row = Record<string, unknown>;

/** The four people you can sign in as, and the Linksfield owner (no demo sign-in: approves its receipts). */
export type DemoUsers = { owner: string; admin: string; givezy: string; donor: string; torahOwner: string };

export type DemoData = {
  /** Tables in the order they are loaded (each only refers to tables before it). */
  tables: [string, Row[]][];
  /** Rows changed after loading, by id (profiles are made by the sign-in service; a monthly gift's first payment). */
  updates: [string, Row[]][];
  /** Donors to receipt for the last closed tax year (Meals), and the run waiting for sign-off (Torah). */
  meals: string;
  torah: string;
  lastClosedTaxYear: number;
};

/** A small, repeatable random number source (mulberry32): the same seed gives the same demo. */
function random(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)],
    chance: (p: number) => next() < p,
  };
}

/** A uuid made from a counter, so ids are stable within one run and never collide. */
function ids(prefix: number) {
  let n = 0;
  return () => {
    n += 1;
    const hex = (prefix * 0x1000000 + n).toString(16).padStart(12, "0");
    return `de300000-0000-4000-8000-${hex.slice(-12)}`;
  };
}

const FIRST = ["Naledi", "Pieter", "Ayesha", "Bongani", "Chantal", "Dov", "Esther", "Farouk", "Gugu", "Hannah", "Itumeleng", "Jacques", "Karabo", "Leah", "Mandla", "Nomvula", "Oren", "Precious", "Rivka", "Sibusiso", "Tamar", "Thabo", "Uri", "Vusi", "Willem", "Yael", "Zanele", "Anele", "Brian", "Caroline", "Dineo", "Elan", "Fatima", "Gerhard", "Hadassah", "Imran", "Jabu", "Keren", "Lindiwe", "Moshe", "Nadia", "Ofentse", "Palesa", "Rafi", "Shira", "Tshepo", "Ruth", "Kagiso", "Miriam", "Neo"];
const LAST = ["Mabaso", "van der Berg", "Patel", "Khumalo", "Fourie", "Rosen", "Shapiro", "Essop", "Zulu", "Kaplan", "Molefe", "du Plessis", "Sithole", "Bernstein", "Nkosi", "Dlamini", "Goldberg", "Mahlangu", "Friedman", "Ntuli", "Cohen", "Pretorius", "Levitt", "Mthembu", "Botha", "Segal", "Radebe", "Naidoo", "Marais", "Abrahams"];
const SUBURBS = ["Northcliff", "Linksfield", "Glenhazel", "Sandringham", "Houghton", "Melville", "Parkhurst", "Fourways", "Rosebank", "Greenside", "Emmarentia", "Orange Grove"];
const SOURCES = ["website", "app", "app", "whatsapp", "share_link", "qr"] as const;
const ONCE_AMOUNTS = [10_000, 18_000, 25_000, 36_000, 50_000, 50_000, 100_000, 100_000, 180_000, 250_000, 500_000];
const MONTHLY_AMOUNTS = [10_000, 18_000, 25_000, 36_000, 50_000, 100_000];
const CONTRIBUTIONS = [2_000, 3_000, 5_000];
/** The well-known sample ID number used in South African examples, so no real person's number is ever stored. */
export const SAMPLE_ID_NUMBER = "8001015009087";

const DAY = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

type Donor = {
  id: string;
  type: "individual" | "company" | "trust";
  first: string | null;
  last: string | null;
  org: string | null;
  reg: string | null;
  contact: string | null;
  email: string;
  phone: string;
  suburb: string;
  wants18a: boolean;
  userId: string | null;
};

export function buildDemoData(args: {
  now: Date;
  users: DemoUsers;
  /** encrypt() from src/lib/crypto: ID numbers are stored encrypted, as on the real site. */
  encrypt: (s: string) => string;
  /** receiptIdentity() from src/lib/crypto. */
  identity: (v: { donorType: string; idNumber?: string; registrationNumber?: string }) => string;
  policyVersion: string;
}): DemoData {
  const { now, users, encrypt } = args;
  const r = random(20261022);
  const id = ids(1);
  const ago = (days: number, hour = 10) => new Date(now.getTime() - days * DAY - (now.getUTCHours() - hour) * 3_600_000);
  const idEncrypted = encrypt(SAMPLE_ID_NUMBER);
  const lastClosedTaxYear = taxYearFor(now) - 1;

  // ---- Causes and charities --------------------------------------------------------------------
  const causes = [
    ["food-welfare", "Food and welfare", "מזון ורווחה"],
    ["children-youth", "Children and youth", null],
    ["education", "Education", "חינוך"],
    ["health", "Health", null],
    ["elderly-care", "Elderly care", null],
    ["faith-communities", "Faith communities", "קהילות"],
  ].map(([slug, en, he], i) => ({ id: id(), slug, name_en: en, name_he: he, sort_order: i + 1 }));
  const cause = (slug: string) => causes.find((c) => c.slug === slug)!.id as string;

  const meals = id();
  const torah = id();
  const shul = id();
  const pending = id();
  const approved = { status: "approved", is_verified: true, verified_at: ago(700), approved_at: ago(700), gateway: "test" };
  const charities: Row[] = [
    {
      id: meals, slug: "northcliff-meals-fund", quickgive_code: "meals", ...approved,
      name_en: "Northcliff Meals Fund", name_he: "קרן ארוחות נורת'קליף", legal_name_en: "Northcliff Meals Fund NPC",
      description_en: "Weekly food parcels and hot meals for families in need in the northern suburbs. A made-up demo charity.",
      funds_use_en: "Food parcels, a weekly hot meal and school lunch packs.",
      thank_you_en: "Thank you. Your gift puts food on a family's table this week.",
      npo_number: "DEMO-NPO-0001", pbo_number: "DEMO-PBO-0001", s18a_reference: "DEMO-PBO-0001",
      address_line1: "1 Demo Street", suburb: "Northcliff", city: "Johannesburg", postal_code: "2195",
      is_s18a: true, s18a_confirmed_at: ago(700), mandate_signed_at: ago(700), gateway_subaccount_ref: "test_acct_meals",
      suggested_amounts_cents: [18_000, 36_000, 100_000],
    },
    {
      id: torah, slug: "linksfield-torah-centre", quickgive_code: "torah", ...approved,
      name_en: "Linksfield Torah Learning Centre", name_he: "מרכז לימוד תורה לינקספילד", legal_name_en: "Linksfield Torah Learning Centre NPC",
      description_en: "Evening classes and a study hall for working adults. A made-up demo charity.",
      npo_number: "DEMO-NPO-0002", pbo_number: "DEMO-PBO-0002", s18a_reference: "DEMO-PBO-0002",
      address_line1: "2 Demo Avenue", suburb: "Linksfield", city: "Johannesburg", postal_code: "2192",
      is_s18a: true, s18a_confirmed_at: ago(700), mandate_signed_at: ago(700), gateway_subaccount_ref: "test_acct_torah",
    },
    {
      id: shul, slug: "glenhazel-shul-fund", quickgive_code: "shul", ...approved,
      name_en: "Glenhazel Community Shul Fund", legal_name_en: "Glenhazel Community Shul Fund",
      description_en: "Upkeep of the community building. Not s18A-approved. A made-up demo charity.",
      npo_number: "DEMO-NPO-0003", address_line1: "3 Demo Road", suburb: "Glenhazel", city: "Johannesburg", postal_code: "2192",
      is_s18a: false, gateway_subaccount_ref: "test_acct_shul",
    },
    {
      id: pending, slug: "orange-grove-soup-kitchen", quickgive_code: "soup", status: "pending_review", gateway: null,
      name_en: "Orange Grove Soup Kitchen", legal_name_en: "Orange Grove Soup Kitchen NPC",
      description_en: "A soup kitchen open five nights a week. A made-up application waiting for Givezy's check.",
      npo_number: "DEMO-NPO-0004", address_line1: "4 Demo Lane", suburb: "Orange Grove", city: "Johannesburg", postal_code: "2192",
      is_s18a: false,
    },
  ];
  const charityCategories = [
    { charity_id: meals, category_id: cause("food-welfare") },
    { charity_id: meals, category_id: cause("children-youth") },
    { charity_id: torah, category_id: cause("education") },
    { charity_id: torah, category_id: cause("faith-communities") },
    { charity_id: shul, category_id: cause("faith-communities") },
    { charity_id: pending, category_id: cause("food-welfare") },
  ];
  const charityPrivate = [meals, torah, shul, pending].map((c, i) => ({
    charity_id: c,
    contact_name: ["Thandi Mokoena", "Avi Rubin", "Joseph Mendel", "Grace Mokoena"][i],
    contact_email: `contact${i + 1}@givezy-demo.test`,
    bank_name: "Demo Bank",
    bank_account_holder: "Demo account (made up)",
    bank_account_last4: String(1001 + i),
    bank_verified_at: i < 3 ? ago(690) : null,
  }));

  const profilesUpdate = [
    { id: users.owner, full_name: "Thandi Mokoena" },
    { id: users.admin, full_name: "Sipho Ndlovu" },
    { id: users.givezy, full_name: "Lerato Dube", role: "platform_admin" },
    { id: users.donor, full_name: "David Levin", giver_type: "regular" },
    { id: users.torahOwner, full_name: "Avi Rubin" },
  ];
  const charityAdmins = [
    { charity_id: meals, user_id: users.owner, role: "owner" },
    { charity_id: meals, user_id: users.admin, role: "admin" },
    { charity_id: torah, user_id: users.torahOwner, role: "owner" },
  ];
  const consents = Object.values(users).map((u) => ({ kind: "account", policy_version: args.policyVersion, user_id: u, accepted_at: ago(400) }));

  // ---- Donors ----------------------------------------------------------------------------------
  const donors: Donor[] = [];
  const used = new Set<string>();
  const person = (): Donor => {
    let first = r.pick(FIRST), last = r.pick(LAST);
    while (used.has(`${first} ${last}`)) [first, last] = [r.pick(FIRST), r.pick(LAST)];
    used.add(`${first} ${last}`);
    const slug = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, "");
    return {
      id: id(), type: "individual", first, last, org: null, reg: null, contact: null,
      email: `${slug}@donor.givezy-demo.test`, phone: `+27 82 000 ${String(donors.length).padStart(4, "0")}`,
      suburb: r.pick(SUBURBS), wants18a: r.chance(0.65), userId: null,
    };
  };
  const david: Donor = {
    id: id(), type: "individual", first: "David", last: "Levin", org: null, reg: null, contact: null,
    email: "david.donor@givezy-demo.test", phone: "+27 82 000 9999", suburb: "Glenhazel", wants18a: true, userId: users.donor,
  };
  donors.push(david);
  for (let i = 0; i < 100; i++) donors.push(person());
  const companies: [string, string][] = [
    ["Highveld Demo Traders (Pty) Ltd", "company"],
    ["Rosebank Demo Pharmacy (Pty) Ltd", "company"],
    ["The Kaplan Demo Family Trust", "trust"],
    ["Northern Demo Builders CC", "company"],
    ["Melville Demo Bakery (Pty) Ltd", "company"],
  ];
  companies.forEach(([name, type], i) => {
    donors.push({
      id: id(), type: type as Donor["type"], first: null, last: null, org: name, reg: `DEMO/2019/00000${i + 1}/07`, contact: r.pick(FIRST) + " " + r.pick(LAST),
      email: `accounts${i + 1}@company.givezy-demo.test`, phone: `+27 11 000 ${String(i).padStart(4, "0")}`, suburb: r.pick(SUBURBS), wants18a: true, userId: null,
    });
  });

  const donorRows = donors.map((d) => ({
    id: d.id, user_id: d.userId, email: d.email, email_verified_at: d.userId ? ago(400) : null, donor_type: d.type,
    first_name: d.first, last_name: d.last, phone: d.phone, organisation_name: d.org, registration_number: d.reg, contact_person: d.contact,
    id_number_encrypted: d.type === "individual" && d.wants18a ? idEncrypted : null,
    id_number_last4: d.type === "individual" && d.wants18a ? SAMPLE_ID_NUMBER.slice(-4) : null,
    address_line1: `${r.int(1, 99)} Demo Road`, suburb: d.suburb, city: "Johannesburg", postal_code: "2192",
    age_confirmed_18_at: ago(600), popia_consent_at: ago(600), created_at: ago(600),
  }));

  // ---- Gifts -------------------------------------------------------------------------------------
  const donations: Row[] = [];
  const details: Row[] = [];
  const kinds: Row[] = [];
  const recurring: Row[] = [];

  const campaigns: Row[] = [];
  const winter = id(), pesach = id(), siyum = id(), roof = id();
  campaigns.push(
    { id: winter, charity_id: meals, slug: "winter-food-parcels", title: "Winter food parcels", description: "Help us pack 1 500 food parcels for the cold months. A made-up demo campaign.", target_cents: 15_000_000, starts_at: ago(80), ends_at: new Date(now.getTime() + 40 * DAY), status: "active", custom_question: "Which school or shul should we tell about your gift? (optional)" },
    { id: pesach, charity_id: meals, slug: "pesach-hampers", title: "Pesach hampers", description: "Festival hampers for 300 families. A made-up demo campaign.", target_cents: 5_000_000, starts_at: ago(250), ends_at: ago(190), status: "ended" },
    { id: siyum, charity_id: torah, slug: "study-hall-fund", title: "New study hall chairs", description: "Sixty new chairs for the study hall. A made-up demo campaign.", target_cents: 2_500_000, starts_at: ago(45), ends_at: new Date(now.getTime() + 60 * DAY), status: "active" },
    { id: roof, charity_id: shul, slug: "roof-repairs", title: "Roof repairs", description: "Fixing the roof before the summer rains. A made-up demo campaign.", target_cents: 30_000_000, starts_at: ago(20), ends_at: null, status: "active" },
  );

  const give = (d: Donor, charity: string, paidAt: Date, amount: number, extra: Partial<Row> = {}) => {
    const donationId = id();
    const status = (extra.status as string | undefined) ?? "paid";
    const contribution = extra.gateway === "recorded" ? 0 : (extra.contribution_cents as number | undefined) ?? (r.chance(0.3) ? r.pick(CONTRIBUTIONS) : 0);
    const wants18a = d.wants18a && charity !== shul;
    donations.push({
      id: donationId, donor_id: d.id, charity_id: charity, campaign_id: null, recurring_id: null,
      amount_cents: amount, platform_fee_cents: 0, fee_vat_cents: 0, processing_charge_cents: 0, contribution_cents: contribution,
      total_charged_cents: amount + contribution, currency: "ZAR", funding_source: "card", status,
      gateway: "test", gateway_ref: `test_${donationId.slice(-12)}`, wants_18a: wants18a, is_anonymous: r.chance(0.05),
      tax_year: status === "failed" ? null : taxYearFor(paidAt), paid_at: status === "failed" ? null : paidAt.toISOString(),
      failed_at: status === "failed" ? paidAt.toISOString() : null, created_at: new Date(paidAt.getTime() - 60_000).toISOString(),
      popia_consent_at: paidAt.toISOString(), age_confirmed_at: paidAt.toISOString(), came_from: r.pick(SOURCES),
      ...extra,
      ...(extra.gateway === "recorded" ? { contribution_cents: 0, total_charged_cents: amount, came_from: "recorded", gateway_ref: null } : {}),
    });
    details.push({
      donation_id: donationId, donor_type: d.type, email: d.email, first_name: d.first, last_name: d.last,
      organisation_name: d.org, registration_number: d.reg, contact_person: d.contact, phone: d.phone,
      id_number_encrypted: d.type === "individual" && wants18a ? idEncrypted : null,
      id_number_last4: d.type === "individual" && wants18a ? SAMPLE_ID_NUMBER.slice(-4) : null,
      address_line1: "12 Demo Road", suburb: d.suburb, city: "Johannesburg", postal_code: "2192",
      receipt_identity: wants18a ? args.identity(d.type === "individual" ? { donorType: d.type, idNumber: SAMPLE_ID_NUMBER } : { donorType: d.type, registrationNumber: d.reg ?? "" }) : null,
      created_at: paidAt.toISOString(),
    });
    return donationId;
  };

  const monthly = (d: Donor, charity: string, amount: number, startedDaysAgo: number, how: "active" | "paused" | "cancelled" | "failed", campaignId: string | null = null) => {
    const recId = id();
    const chargeDay = r.int(1, 28);
    const contribution = r.chance(0.4) ? r.pick(CONTRIBUTIONS) : 0;
    let first: string | null = null;
    let lastPeriod: string | null = null;
    const stopAfter = how === "cancelled" ? Math.max(30, startedDaysAgo - r.int(60, 200)) : how === "failed" ? 25 : how === "paused" ? 50 : 0;
    for (let days = startedDaysAgo; days >= stopAfter; days -= 30) {
      const at = ago(days, 8);
      const donationId = give(d, charity, at, amount, { recurring_id: recId, contribution_cents: contribution, campaign_id: campaignId, came_from: "app" });
      first ??= donationId;
      lastPeriod = at.toISOString().slice(0, 7);
    }
    if (how === "failed") give(d, charity, ago(r.int(1, 4), 8), amount, { recurring_id: recId, status: "failed", contribution_cents: contribution, came_from: "app" });
    const next = new Date(now.getTime() + r.int(2, 28) * DAY);
    recurring.push({
      id: recId, donor_id: d.id, charity_id: charity, campaign_id: campaignId, amount_cents: amount, contribution_cents: contribution, status: how,
      wants_18a: d.wants18a, gateway: "test", charge_day: chargeDay, next_charge_at: how === "active" ? next.toISOString() : null,
      paused_at: how === "paused" ? ago(40).toISOString() : null, cancelled_at: how === "cancelled" ? ago(stopAfter - 5).toISOString() : null,
      ended_reason: how === "cancelled" ? "donor_cancelled" : null, failed_attempts: how === "failed" ? 2 : 0, last_attempt_at: how === "failed" ? ago(2).toISOString() : null,
      card_brand: r.pick(["visa", "mastercard"]), card_last4: String(r.int(1000, 9999)), card_exp: "12/28",
      first_donation_id: first, last_paid_period: lastPeriod, created_at: ago(startedDaysAgo).toISOString(),
    });
  };

  const people = donors.slice(1, 101);
  const orgs = donors.slice(101);
  // Monthly donors: 22 active, 3 paused, 4 cancelled, 2 whose card keeps failing.
  people.slice(0, 31).forEach((d, i) => {
    const how = i < 22 ? "active" : i < 25 ? "paused" : i < 29 ? "cancelled" : "failed";
    monthly(d, i % 7 === 6 ? torah : meals, r.pick(MONTHLY_AMOUNTS), r.int(90, 560), how, i === 3 ? winter : null);
  });
  // Regulars: three to eight gifts each over the two tax years.
  people.slice(31, 61).forEach((d) => {
    const n = r.int(3, 8);
    for (let k = 0; k < n; k++) give(d, r.chance(0.75) ? meals : r.pick([torah, shul]), ago(r.int(5, 590), r.int(7, 20)), r.pick(ONCE_AMOUNTS));
  });
  // Lapsed: gave a year or more ago, nothing since.
  people.slice(61, 81).forEach((d) => {
    const n = r.int(1, 3);
    for (let k = 0; k < n; k++) give(d, meals, ago(r.int(200, 590), r.int(7, 20)), r.pick(ONCE_AMOUNTS));
  });
  // New this month.
  people.slice(81, 96).forEach((d) => give(d, r.chance(0.8) ? meals : torah, ago(r.int(0, 25), r.int(7, 20)), r.pick(ONCE_AMOUNTS)));
  // Once, a few months ago.
  people.slice(96).forEach((d) => give(d, meals, ago(r.int(40, 150), 12), r.pick(ONCE_AMOUNTS)));
  // Companies and trusts give bigger gifts, often at the tax year end.
  orgs.forEach((d, i) => {
    give(d, meals, ago(r.int(230, 240), 11), r.pick([500_000, 1_000_000, 2_500_000]));
    if (i % 2 === 0) give(d, meals, ago(r.int(10, 60), 11), r.pick([500_000, 1_000_000]));
    if (i === 2) give(d, torah, ago(r.int(220, 260), 11), 1_800_000);
  });

  // Campaign gifts.
  const winterGivers = people.slice(31, 96).filter(() => r.chance(0.5));
  for (const d of winterGivers) give(d, meals, ago(r.int(1, 78), r.int(7, 20)), r.pick([25_000, 50_000, 100_000, 180_000, 250_000, 500_000]), { campaign_id: winter, campaign_answer: r.chance(0.3) ? "Our shul" : null });
  for (const d of people.slice(40, 80).filter(() => r.chance(0.4))) give(d, meals, ago(r.int(192, 248), 12), r.pick([18_000, 36_000, 50_000, 100_000]), { campaign_id: pesach });
  for (const d of people.slice(20, 70).filter(() => r.chance(0.25))) give(d, torah, ago(r.int(1, 44), 19), r.pick([18_000, 36_000, 50_000]), { campaign_id: siyum });
  for (const d of people.slice(50, 95).filter(() => r.chance(0.2))) give(d, shul, ago(r.int(1, 19), 9), r.pick([50_000, 100_000, 250_000]), { campaign_id: roof });

  // A few in honour or in memory, a refund and a declined card.
  donations.slice(0, 400).filter(() => r.chance(0.04)).forEach((g, i) => {
    g.dedication_kind = i % 2 ? "memory" : "honour";
    g.dedication_name = i % 2 ? "Bubbe Sarah" : "Moshe and Leah's wedding";
  });
  give(people[45], meals, ago(33, 14), 50_000, { status: "refunded", refunded_at: ago(31).toISOString() });
  give(people[46], meals, ago(3, 15), 100_000, { status: "failed" });

  // David, the donor you can sign in as: monthly to Meals, gifts to everyone, giving kinds.
  monthly(david, meals, 36_000, 540, "active");
  for (const [days, c, amount] of [[500, torah, 180_000], [400, shul, 100_000], [330, meals, 250_000], [250, torah, 50_000], [120, shul, 36_000], [60, meals, 100_000], [9, torah, 18_000]] as const) {
    const g = give(david, c, ago(days, 18), amount, { contribution_cents: 3_000 });
    kinds.push({ donation_id: g, kind: r.pick(["maaser", "tzedaka"]), label: null });
  }

  // Recorded gifts: EFTs the charity typed in, and one spreadsheet import.
  const imp = id();
  const recordedBy = users.owner;
  people.slice(55, 75).forEach((d, i) => give(d, meals, ago(r.int(5, 400), 9), r.pick([50_000, 100_000, 200_000, 300_000]), {
    gateway: "recorded", recorded_method: i % 5 === 0 ? "cash" : "eft", recorded_by: recordedBy, external_ref: `EFT ${d.last?.toUpperCase().slice(0, 8)} ${i + 1}`, import_id: i < 8 ? imp : null,
  }));
  const importTotal = donations.filter((g) => g.import_id === imp).reduce((s, g) => s + (g.amount_cents as number), 0);
  const giftImports = [{ id: imp, charity_id: meals, file_name: "bank-statement-gifts.csv", gifts: 8, total_cents: importTotal, created_by: recordedBy, confirmed_at: ago(30).toISOString(), created_at: ago(30).toISOString() }];

  // ---- Deposits (payouts): every two weeks, the card gifts paid in the fortnight before -------------
  const payouts: Row[] = [];
  const payoutLines: Row[] = [];
  const cardPaid = donations.filter((g) => g.charity_id === meals && g.gateway === "test" && (g.status === "paid" || g.status === "refunded") && g.paid_at);
  for (let k = 1; k <= 8; k++) {
    const end = now.getTime() - (k * 14 - 12) * DAY, start = end - 14 * DAY;
    const lines = cardPaid.filter((g) => {
      const t = Date.parse(g.paid_at as string);
      return t >= start && t < end;
    });
    if (!lines.length) continue;
    const payoutId = id();
    // No fee is invented: the gateway's rates are not set, so deposits show the gifts in full.
    const amount = lines.reduce((s, g) => s + (g.amount_cents as number), 0);
    payouts.push({ id: payoutId, charity_id: meals, gateway: "test", gateway_payout_ref: `demo_payout_${k}`, paid_out_on: isoDay(new Date(end + 2 * DAY)), amount_cents: amount, status: k === 1 ? "pending" : "paid", first_seen_at: new Date(end).toISOString() });
    lines.forEach((g, n) => payoutLines.push({ id: id(), payout_id: payoutId, donation_id: g.id, gateway_reference: g.gateway_ref, kind: "payment", gross_cents: g.amount_cents, fee_cents: 0, net_cents: g.amount_cents, line_no: n + 1 }));
  }

  // ---- Donor care: tags, notes, follow-ups, saved lists, lapsed period ------------------------------
  const tagRows = ["Board member", "Volunteer", "Major donor", "Shul committee", "Prefers WhatsApp"].map((name) => ({ id: id(), charity_id: meals, name, created_at: ago(300).toISOString() }));
  const tag = (name: string) => tagRows.find((t) => t.name === name)!.id;
  const donorTags: Row[] = [];
  people.slice(0, 6).forEach((d) => donorTags.push({ tag_id: tag("Board member"), charity_id: meals, donor_id: d.id }));
  people.slice(31, 45).filter((_, i) => i % 2 === 0).forEach((d) => donorTags.push({ tag_id: tag("Volunteer"), charity_id: meals, donor_id: d.id }));
  orgs.forEach((d) => donorTags.push({ tag_id: tag("Major donor"), charity_id: meals, donor_id: d.id }));
  people.slice(8, 12).forEach((d) => donorTags.push({ tag_id: tag("Prefers WhatsApp"), charity_id: meals, donor_id: d.id }));

  const noteTexts = [
    "Met at the Sukkos fair. Keen to volunteer on packing days.",
    "Asked for their s18A receipt to go to their bookkeeper as well.",
    "Phoned to say thank you for the winter parcels update. Lovely chat.",
    "Gives every year before Rosh Hashana. Send a personal thank-you.",
    "Prefers not to be phoned. Email only.",
    "Company matches staff giving: ask about it next year.",
  ];
  const notes = [...people.slice(0, 8), ...orgs.slice(0, 3)].map((d, i) => ({ id: id(), charity_id: meals, donor_id: d.id, body: noteTexts[i % noteTexts.length], created_by: i % 3 ? users.admin : users.owner, created_at: ago(r.int(3, 200)).toISOString() }));
  const reminders = [
    { what: "Phone to thank for the Pesach gift", due: -3, done: false },
    { what: "Send the winter parcels photos", due: 2, done: false },
    { what: "Ask about matching staff gifts", due: 10, done: false },
    { what: "Invite to the volunteer evening", due: 21, done: false },
    { what: "Thank for the year-end gift", due: -40, done: true },
  ].map((x, i) => ({
    id: id(), charity_id: meals, donor_id: (i === 2 ? orgs[0] : people[i + 2]).id, what: x.what, due_on: isoDay(new Date(now.getTime() + x.due * DAY)),
    created_by: users.owner, created_at: ago(60).toISOString(), done_at: x.done ? ago(39).toISOString() : null, done_by: x.done ? users.admin : null,
  }));
  const segments = [
    { id: id(), charity_id: meals, name: "Lapsed donors to win back", filters: { group: "lapsed" }, created_by: users.owner, created_at: ago(90).toISOString() },
    { id: id(), charity_id: meals, name: "Major donors", filters: { tag: tag("Major donor") }, created_by: users.owner, created_at: ago(80).toISOString() },
    { id: id(), charity_id: meals, name: "Volunteers who give", filters: { tag: tag("Volunteer"), group: "repeat" }, created_by: users.admin, created_at: ago(20).toISOString() },
  ];
  const donorSettings = [{ charity_id: meals, lapsed_after_days: 180 }];

  // ---- Emails to donors (recorded as sent; the demo itself never sends one) -------------------------
  const appeals: Row[] = [];
  const recipients: Row[] = [];
  const gaveOnline = (c: string) => [...new Set(donations.filter((g) => g.charity_id === c && g.gateway === "test" && g.status === "paid").map((g) => g.donor_id as string))];
  const appeal = (subject: string, body: string, audience: Row, label: string, daysAgo: number, to: string[]) => {
    const appealId = id();
    appeals.push({ id: appealId, charity_id: meals, subject, body, audience, audience_label: label, created_by: users.owner, created_at: ago(daysAgo).toISOString() });
    to.forEach((donorId) => recipients.push({ appeal_id: appealId, charity_id: meals, donor_id: donorId, status: "sent", claimed_at: ago(daysAgo).toISOString(), sent_at: ago(daysAgo).toISOString() }));
  };
  const online = gaveOnline(meals);
  appeal("Winter is coming: help us pack 1 500 parcels", "Dear friend,\n\nThe cold months are the hardest for the families we feed. This winter we want to pack 1 500 food parcels, and every R250 fills one.\n\nThank you for standing with us.\n\nThandi and the Northcliff Meals Fund team", { kind: "all" }, "All your donors", 75, online);
  appeal("We miss you", "Dear friend,\n\nIt's been a while, and we wanted to say thank you for your past support. Here is what your gifts did this year: hot meals every Thursday and school lunch packs for 120 children.\n\nWarm regards,\nThandi", { kind: "group", group: "lapsed" }, "Lapsed", 20, online.filter((x) => people.slice(61, 81).some((p) => p.id === x)));

  const thankYous = [{ id: id(), charity_id: meals, period_month: `${isoDay(ago(35)).slice(0, 7)}-01`, body: "Thank you to every one of our monthly donors. Last month you funded 410 hot meals.", sent_by: users.owner, sent_at: ago(28).toISOString(), recipient_count: 22 }];
  const monday = (d: Date) => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    return x;
  };
  const thisWeek = monday(new Date(now.getTime() + 2 * 3_600_000));
  const donorThanks = people.slice(81, 86).map((d) => ({ id: id(), charity_id: meals, donor_id: d.id, week_start: isoDay(thisWeek), body: "Thank you for your first gift to Northcliff Meals Fund. It means a lot to us.", sent_by: users.admin, sent_at: ago(1).toISOString() }));

  // ---- Cause of the week, updates, favourites ------------------------------------------------------
  const featured = [meals, torah, shul, meals].map((c, i) => ({ id: id(), charity_id: c, week_start: isoDay(new Date(thisWeek.getTime() - i * 7 * DAY)), created_by: users.givezy, created_at: ago(i * 7 + 2).toISOString() }));
  const updates = [
    { id: id(), charity_id: meals, body_en: "We packed 380 parcels this week with 25 volunteers. Thank you to everyone who came.", posted_by: users.owner, created_at: ago(6).toISOString() },
    { id: id(), charity_id: meals, body_en: "Our Thursday hot meal now feeds 140 people. The new urn helped.", posted_by: users.admin, created_at: ago(30).toISOString() },
    { id: id(), charity_id: torah, body_en: "The new evening class on Tuesdays is full. A second group starts next month.", posted_by: null, created_at: ago(12).toISOString() },
  ];
  const favourites = [meals, torah].map((c) => ({ user_id: users.donor, charity_id: c, created_at: ago(300).toISOString() }));
  const external = [{ id: id(), user_id: users.donor, amount_cents: 50_000, entry_date: isoDay(ago(70)), recipient_text: "Collection at a friend's simcha", kind: "tzedaka", created_at: ago(70).toISOString() }];

  return {
    tables: [
      ["categories", causes],
      ["charities", charities],
      ["charity_categories", charityCategories],
      ["charity_private", charityPrivate],
      ["charity_admins", charityAdmins],
      ["consents", consents],
      ["donors", donorRows],
      ["campaigns", campaigns],
      ["gift_imports", giftImports],
      ["recurring_donations", recurring.map((x) => ({ ...x, first_donation_id: null }))],
      ["donations", donations],
      ["donation_checkout_details", details],
      ["donation_giving_kinds", kinds],
      ["payouts", payouts],
      ["payout_lines", payoutLines],
      ["charity_tags", tagRows],
      ["charity_donor_tags", donorTags],
      ["charity_donor_notes", notes],
      ["charity_donor_reminders", reminders],
      ["charity_segments", segments],
      ["charity_donor_settings", donorSettings],
      ["charity_appeals", appeals],
      ["charity_appeal_recipients", recipients],
      ["charity_thank_yous", thankYous],
      ["charity_donor_thanks", donorThanks],
      ["featured_charities", featured],
      ["charity_updates", updates],
      ["favourites", favourites],
      ["external_giving_entries", external],
    ],
    updates: [
      ["profiles", profilesUpdate],
      ["recurring_donations", recurring.map((x) => ({ id: x.id, first_donation_id: x.first_donation_id }))],
    ],
    meals,
    torah,
    lastClosedTaxYear,
  };
}
