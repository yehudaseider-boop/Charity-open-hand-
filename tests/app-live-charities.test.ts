import { describe, expect, it } from "vitest";
import { imageUrl, inCause, mergeSaved, savedCharities, oneLiner, toCauses, toCharity, toPhotos, toUpdates, type CharityRow } from "../apps/mobile/src/lib/live-charities";

const base = "https://example.supabase.co";
const row = (o: Partial<CharityRow> = {}): CharityRow => ({
  id: "c1",
  slug: "meals",
  name_en: "Meals Fund",
  description_en: "Weekly Shabbos parcels for families. We started in 2010.",
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
  it("maps a charity row, with the website's 18A rule", () => {
    const c = toCharity(row(), base);
    expect(c).toMatchObject({ slug: "meals", area: "Northcliff, Johannesburg", cause: "Weekly Shabbos parcels for families.", issues18a: true, causeIds: ["food", "medical"] });
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
    expect(toCauses([{ id: "food", name_en: "Food" }, { id: "shuls", name_en: "Shuls" }, { id: "medical", name_en: "Medical" }], list).map((c) => c.id)).toEqual(["all", "food", "medical"]);
    expect(inCause(list[0], "medical")).toBe(true);
    expect(inCause(list[0], "shuls")).toBe(false);
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
