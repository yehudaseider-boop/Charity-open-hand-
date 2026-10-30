import { describe, expect, it } from "vitest";
import { campaignPercent, givenBefore, imageUrl, toCampaigns, inCause, mergeSaved, savedCharities, oneLiner, toCauses, toCharity, toPhotos, toUpdates, type CharityRow } from "../apps/mobile/src/lib/live-charities";

const base = "https://example.supabase.co";
const row = (o: Partial<CharityRow> = {}): CharityRow => ({
  id: "c1",
  slug: "meals",
  name_en: "Meals Fund",
  description_en: "Weekly food parcels for families. We started in 2010.",
  funds_use_en: "Food.",
  cover_path: "c1/cover-a.jpg",
  suburb: "Northcliff",
  city: "Johannesburg",
  is_s18a: true,
  mandate_signed_at: "2026-01-01",
  charity_categories: [{ category_id: "food" }, { category_id: "medical" }],
  ...o,
});

describe("live charity directory in the app", () => {
  it("maps a charity row, with the website's s18A rule", () => {
    const c = toCharity(row(), base);
    expect(c).toMatchObject({ slug: "meals", area: "Northcliff, Johannesburg", cause: "Weekly food parcels for families.", issues18a: true, causeIds: ["food", "medical"] });
    expect(c.coverUrl).toBe(`${base}/storage/v1/object/public/charity-public/c1/cover-a.jpg`);
    expect(toCharity(row({ mandate_signed_at: null }), base).issues18a).toBe(false);
    expect(toCharity(row({ cover_path: null, suburb: null }), base)).toMatchObject({ coverUrl: null, area: "Johannesburg" });
  });

  it("never builds an image link that climbs out of the folder", () => {
    expect(imageUrl(base, "c1/../x.jpg")).toBeNull();
    expect(imageUrl(base, null)).toBeNull();
    expect(imageUrl(base + "/", "c1/a b.jpg")).toBe(`${base}/storage/v1/object/public/charity-public/c1/a%20b.jpg`);
  });

  it("shortens long descriptions for the card", () => {
    expect(oneLiner("x".repeat(200))).toHaveLength(90);
    expect(oneLiner(null)).toBe("");
  });

  it("only shows causes that have a charity, and filters by any of a charity's causes", () => {
    const list = [toCharity(row(), base)];
    expect(toCauses([{ id: "food", name_en: "Food" }, { id: "sport", name_en: "Sport" }, { id: "medical", name_en: "Medical" }], list).map((c) => c.id)).toEqual(["all", "food", "medical"]);
    expect(inCause(list[0], "medical")).toBe(true);
    expect(inCause(list[0], "sport")).toBe(false);
    expect(inCause(list[0], "all")).toBe(true);
  });

  it("maps photos and updates", () => {
    expect(toPhotos([{ id: "p", storage_path: "c1/photos/a.jpg", caption_en: "Packing" }, { id: "bad", storage_path: "../x", caption_en: null }], base)).toHaveLength(1);
    const [u] = toUpdates([{ id: "u", body_en: "Hello", photo_path: null, created_at: "2026-10-01T08:00:00Z" }], base);
    expect(u).toMatchObject({ body: "Hello", photoUrl: null });
    expect(u.date.toISOString()).toBe("2026-10-01T08:00:00.000Z");
  });
});

describe("saved charities", () => {
  it("joins the phone's list to the account's, newest first, without repeats", () => {
    expect(mergeSaved(["a", "b"], ["c", "a"])).toEqual(["c", "a", "b"]);
    expect(mergeSaved([], [])).toEqual([]);
  });

  it("keeps the saved order and drops charities no longer listed", () => {
    const list = [toCharity(row({ slug: "x" }), base), toCharity(row({ slug: "y" }), base)];
    expect(savedCharities(["y", "gone", "x"], list).map((c) => c.slug)).toEqual(["y", "x"]);
  });
});

describe("givenBefore", () => {
  const c = (slug: string) => ({ slug, nameEn: slug }) as never;
  const list = [c("a"), c("b"), c("c")];
  const g = (slug: string, day: number) => ({ charitySlug: slug, date: new Date(2026, 9, day) });
  it("lists each charity once, most recent gift first, skipping charities no longer listed", () => {
    expect(givenBefore([g("a", 1), g("b", 5), g("a", 9), g("gone", 10)], list).map((x: { slug: string }) => x.slug)).toEqual(["a", "b"]);
  });
  it("stops at the limit", () => {
    expect(givenBefore([g("a", 1), g("b", 2), g("c", 3)], list, 2)).toHaveLength(2);
  });
});

describe("campaigns in the app", () => {
  const row = (id: string, ends: string | null) => ({ id, title: "Pesach", description: null, target_cents: "5000000", ends_at: ends });
  it("adds each campaign's paid total and leaves out any past its last day", () => {
    const now = new Date("2026-10-16T10:00:00Z");
    const out = toCampaigns([row("a", null), row("b", "2026-10-15T21:59:59Z")], [{ campaign_id: "a", raised_cents: "1250000", gift_count: 7 }], now);
    expect(out).toEqual([{ id: "a", title: "Pesach", description: null, targetCents: 5_000_000, raisedCents: 1_250_000, giftCount: 7, endsAt: null }]);
  });
  it("starts at zero with no gifts, and the bar never passes 100", () => {
    expect(toCampaigns([row("a", null)], [])[0].raisedCents).toBe(0);
    expect(campaignPercent({ raisedCents: 9, targetCents: 5 })).toBe(100);
    expect(campaignPercent({ raisedCents: 9, targetCents: null })).toBe(0);
  });
});
