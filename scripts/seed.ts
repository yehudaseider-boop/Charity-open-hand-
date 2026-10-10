/**
 * Seed data for local development and demos. All names are fictional.
 * Run with: npm run db:reset   (wipes the local database, then seeds)
 *
 * Never run against production.
 */
import { createClient } from "@supabase/supabase-js";
import { platformConfig } from "../src/config/platform";
import { percentToPpm } from "../src/lib/money";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const secret = process.env.SUPABASE_SECRET_KEY!;
if (!url?.includes("127.0.0.1") && !url?.includes("localhost")) {
  throw new Error("Refusing to seed a non-local database.");
}
const db = createClient(url, secret, { auth: { persistSession: false } });

async function must<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw error;
  return data as NonNullable<T>;
}

async function createUser(email: string, fullName: string) {
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  await must(db.from("profiles").update({ full_name: fullName }).eq("id", data.user.id));
  return data.user.id;
}

async function main() {
  // Legacy fee row (no longer read by checkout: there is no platform fee).
  await must(
    db.from("fee_settings").insert({
      charity_id: null,
      platform_fee_ppm: 0,
      gateway_percent_ppm: platformConfig.fees.gatewayPercent
        ? percentToPpm(platformConfig.fees.gatewayPercent)
        : null,
      gateway_fixed_cents: platformConfig.fees.gatewayFixedCents,
      gateway_rates_include_vat: platformConfig.fees.gatewayRatesIncludeVat,
      min_donation_cents: platformConfig.minDonationCents,
      vat_enabled: platformConfig.vat.enabled,
      vat_rate_ppm: percentToPpm(platformConfig.vat.ratePercent),
    }),
  );

  const categories = await must(
    db.from("categories").insert([
      { slug: "food-welfare", name_en: "Food and welfare", name_he: "מזון ורווחה", sort_order: 1 },
      { slug: "torah-education", name_en: "Torah education", name_he: "חינוך תורני", sort_order: 2 },
      { slug: "shuls", name_en: "Shuls", name_he: "בתי כנסת", sort_order: 3 },
      { slug: "medical", name_en: "Medical support", name_he: "עזרה רפואית", sort_order: 4 },
      { slug: "chesed", name_en: "Chesed", name_he: "חסד", sort_order: 5 },
    ]).select("id, slug"),
  );
  const cat = (slug: string) => categories.find((c) => c.slug === slug)!.id;

  const now = new Date().toISOString();
  const charities = await must(
    db.from("charities").insert([
      {
        slug: "northcliff-meals-fund",
        quickgive_code: "meals",
        name_en: "Northcliff Meals Fund (Test)",
        name_he: "קרן ארוחות נורת'קליף",
        legal_name_en: "Northcliff Meals Fund NPC (Test)",
        legal_name_he: "קרן ארוחות נורת'קליף",
        description_en: "Weekly Shabbos food parcels for families in need. Fictional test charity.",
        description_he: "חבילות מזון לשבת למשפחות נזקקות. ארגון בדיוני לבדיקה.",
        npo_number: "TEST-NPO-0001",
        pbo_number: "TEST-PBO-0001",
        s18a_reference: "TEST-PBO-0001",
        address_line1: "1 Test Street",
        suburb: "Northcliff",
        city: "Johannesburg",
        postal_code: "2195",
        status: "approved",
        is_verified: true,
        verified_at: now,
        is_s18a: true,
        s18a_confirmed_at: now,
        mandate_signed_at: now,
        approved_at: now,
      },
      {
        slug: "linksfield-torah-centre",
        quickgive_code: "torah",
        name_en: "Linksfield Torah Learning Centre (Test)",
        name_he: "מרכז לימוד תורה לינקספילד",
        legal_name_en: "Linksfield Torah Learning Centre NPC (Test)",
        legal_name_he: "מרכז לימוד תורה לינקספילד",
        description_en: "Evening shiurim and a kollel for working men. Fictional test charity.",
        npo_number: "TEST-NPO-0002",
        pbo_number: "TEST-PBO-0002",
        s18a_reference: "TEST-PBO-0002",
        address_line1: "2 Test Avenue",
        suburb: "Linksfield",
        city: "Johannesburg",
        postal_code: "2192",
        status: "approved",
        is_verified: true,
        verified_at: now,
        is_s18a: true,
        s18a_confirmed_at: now,
        mandate_signed_at: now,
        approved_at: now,
      },
      {
        slug: "glenhazel-shul-fund",
        quickgive_code: "shul",
        name_en: "Glenhazel Community Shul Fund (Test)",
        name_he: "קרן בית הכנסת גלנהייזל",
        legal_name_en: "Glenhazel Community Shul Fund (Test)",
        description_en: "Upkeep of the shul building. Not s18A-approved. Fictional test charity.",
        npo_number: "TEST-NPO-0003",
        address_line1: "3 Test Road",
        suburb: "Glenhazel",
        city: "Johannesburg",
        postal_code: "2192",
        status: "approved",
        is_verified: true,
        verified_at: now,
        is_s18a: false,
        approved_at: now,
      },
    ]).select("id, slug"),
  );
  const charity = (slug: string) => charities.find((c) => c.slug === slug)!.id;

  // Connect the seed charities to the local test gateway.
  for (const c of charities) {
    await must(
      db.from("charities").update({ gateway: "test", gateway_subaccount_ref: `test_acct_${c.id.slice(0, 8)}` }).eq("id", c.id),
    );
  }

  await must(
    db.from("charity_categories").insert([
      { charity_id: charity("northcliff-meals-fund"), category_id: cat("food-welfare") },
      { charity_id: charity("northcliff-meals-fund"), category_id: cat("chesed") },
      { charity_id: charity("linksfield-torah-centre"), category_id: cat("torah-education") },
      { charity_id: charity("glenhazel-shul-fund"), category_id: cat("shuls") },
    ]),
  );

  await must(
    db.from("charity_private").insert(
      charities.map((c, i) => ({
        charity_id: c.id,
        contact_name: `Test Contact ${i + 1}`,
        contact_email: `contact${i + 1}@nedivlev.test`,
      })),
    ),
  );

  // People
  const adminId = await createUser("admin@nedivlev.test", "Test Platform Admin");
  await must(db.from("profiles").update({ role: "platform_admin" }).eq("id", adminId));

  const mealsAdmin = await createUser("meals.admin@nedivlev.test", "Test Meals Admin");
  const shulAdmin = await createUser("shul.admin@nedivlev.test", "Test Shul Admin");
  await must(
    db.from("charity_admins").insert([
      { charity_id: charity("northcliff-meals-fund"), user_id: mealsAdmin, role: "owner" },
      { charity_id: charity("glenhazel-shul-fund"), user_id: shulAdmin, role: "owner" },
    ]),
  );

  // Donor 1: account holder, individual
  const donorUser = await createUser("donor@nedivlev.test", "Test Donor");
  await must(
    db.from("donors").insert({
      user_id: donorUser,
      email: "donor@nedivlev.test",
      email_verified_at: now,
      donor_type: "individual",
      first_name: "Test",
      last_name: "Donor",
      city: "Johannesburg",
      age_confirmed_18_at: now,
      popia_consent_at: now,
    }),
  );

  // Donor 2: guest company (no account)
  await must(
    db.from("donors").insert({
      email: "accounts@testtrading.test",
      donor_type: "company",
      organisation_name: "Test Trading (Pty) Ltd",
      registration_number: "TEST/2020/000001/07",
      contact_person: "Test Bookkeeper",
      city: "Johannesburg",
      age_confirmed_18_at: now,
      popia_consent_at: now,
    }),
  );

  console.log("Seeded: 3 charities (1 non-s18A), 5 categories, 2 donors, 4 users.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
