/**
 * The charity page and give page keep a charity's public details for a short while (24/11/2026), per charity.
 * What must hold: an edit shows up when the charity or an admin saves it; a suspended charity stops showing (at once
 * when an admin acts, and within PUBLIC_CHARITY_MAX_STALE_SECONDS at the very latest); one charity's edit never
 * touches another's; a campaign that passes its last day drops off without waiting; what is worked out per request
 * (the pause switch) is never inside the cache; and a failed read is never kept.
 *
 * Next's cache is replaced by a small in-memory one that honours the tags and records the options, so these tests
 * check our use of it (tags, the expiry we ask for, what is and isn't inside it), not Next's own storage.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// ---- a stand-in for Next's data cache ----
type Entry = { value: unknown; tags: string[] };
const store = new Map<string, Entry>();
const asked: { revalidate?: number | false; tags?: string[] }[] = [];
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: never[]) => Promise<unknown>, keyParts: string[], options: { revalidate?: number | false; tags?: string[] } = {}) =>
    async (...args: unknown[]) => {
      asked.push(options);
      const key = JSON.stringify([keyParts, args]);
      const hit = store.get(key);
      if (hit) return structuredClone(hit.value);
      const value = await fn(...(args as never[]));
      store.set(key, { value: structuredClone(value), tags: options.tags ?? [] });
      return value;
    },
  revalidateTag: (tag: string) => {
    for (const [k, e] of store) if (e.tags.includes(tag)) store.delete(k);
  },
}));

// ---- a stand-in for the database ----
type Row = Record<string, unknown>;
let charities: Row[];
let focusRows: Row[];
let readFails: boolean;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const filters: [string, unknown][] = [];
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => (filters.push([c, v]), q),
        maybeSingle: async () => {
          if (readFails) return { data: null, error: { message: "database down" } };
          const rows = table === "charities" ? charities : table === "charity_focus" ? focusRows : [];
          return { data: rows.find((r) => filters.every(([c, v]) => r[c] === v)) ?? null, error: null };
        },
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: () => ({}) }));
let campaigns: { id: string; title: string; status: "active" | "ended" | "draft"; endsAt: string | null }[];
vi.mock("@/lib/charity/campaign-queries", () => ({ loadCampaigns: async () => campaigns }));
vi.mock("@/lib/charity/queries", () => ({ loadStories: async () => ({ photos: [], updates: [] }) }));
vi.mock("@/lib/gateway", () => ({ getGateway: () => ({ name: "test", splitsPayments: false }) }));

const cache = await import("@/lib/charity/public-cache");

const charity = (o: Row = {}): Row => ({
  id: "c1", slug: "meals", name_en: "Meals for All", status: "approved", is_verified: true, is_s18a: false, mandate_signed_at: null,
  gateway: "test", gateway_subaccount_ref: null, suggested_amounts_cents: [5000], impact_unit_cents: null, impact_unit_one: null, impact_unit_many: null,
  description_en: "We cook.", ...o,
});

beforeEach(() => {
  store.clear();
  asked.length = 0;
  charities = [charity(), charity({ id: "c2", slug: "books", name_en: "Books for Kids" })];
  focusRows = [];
  campaigns = [];
  readFails = false;
  vi.unstubAllEnvs();
});

describe("an edit shows up", () => {
  it("is served from the cache until the charity's page is refreshed, then shows the edit", async () => {
    expect((await cache.loadListedCharity("meals"))?.name_en).toBe("Meals for All");
    charities[0].name_en = "Meals for Everyone";
    // Not refreshed yet: the cached copy is what a visitor sees (this is the "short while").
    expect((await cache.loadListedCharity("meals"))?.name_en).toBe("Meals for All");
    // The charity (or an admin) saved: the next visit reads the new details.
    await cache.revalidateCharityPages("c1");
    expect((await cache.loadListedCharity("meals"))?.name_en).toBe("Meals for Everyone");
  });

  it("refreshing one charity leaves every other charity's cache alone", async () => {
    await cache.loadListedCharity("meals");
    await cache.loadListedCharity("books");
    charities[1].name_en = "Books changed";
    await cache.revalidateCharityPages("c1");
    expect((await cache.loadListedCharity("books"))?.name_en).toBe("Books for Kids");
  });

  it("refreshes the profile, stories, campaigns and focus together (they share the charity's tag)", async () => {
    await cache.loadListedCharity("meals");
    await cache.loadPublicStories("meals", "c1");
    await cache.loadPublicAllCampaigns("meals", "c1");
    await cache.loadPublicFocusRow("meals", "c1");
    expect(store.size).toBe(4);
    cache.revalidateCharitySlugs("meals");
    expect(store.size).toBe(0);
  });

  it("a campaign started by the charity appears on the next visit after its save", async () => {
    expect(await cache.loadPublicOpenCampaigns("meals", "c1")).toEqual([]);
    campaigns = [{ id: "k1", title: "Winter", status: "active", endsAt: null }];
    expect(await cache.loadPublicOpenCampaigns("meals", "c1")).toEqual([]); // cached
    cache.revalidateCharitySlugs("meals");
    expect((await cache.loadPublicOpenCampaigns("meals", "c1")).map((c) => c.id)).toEqual(["k1"]);
  });
});

describe("a suspended or unlisted charity stops showing", () => {
  it("is gone on the next visit once an admin suspends it", async () => {
    expect(await cache.charityIsListed("meals")).toBe(true);
    charities[0].status = "suspended";
    await cache.revalidateCharityPages("c1");
    expect(await cache.charityIsListed("meals")).toBe(false);
    expect(await cache.loadPublicDonatable("meals")).toBeNull();
  });

  it("is reinstated the same way", async () => {
    charities[0].status = "suspended";
    expect(await cache.charityIsListed("meals")).toBe(false);
    charities[0].status = "approved";
    await cache.revalidateCharityPages("c1");
    expect(await cache.charityIsListed("meals")).toBe(true);
  });

  it("never keeps anything longer than the stated limit, even if a write forgot to refresh", () => {
    // Every cached read asks for an expiry of at most the limit, and the limit is the one decisions.md states.
    expect(cache.PUBLIC_CHARITY_MAX_STALE_SECONDS).toBe(60);
    return Promise.all([
      cache.loadListedCharity("meals"), cache.loadPublicStories("meals", "c1"), cache.loadPublicAllCampaigns("meals", "c1"), cache.loadPublicFocusRow("meals", "c1"),
    ]).then(() => {
      expect(asked).toHaveLength(4);
      for (const o of asked) {
        expect(o.revalidate).toBe(cache.PUBLIC_CHARITY_MAX_STALE_SECONDS);
        expect(o.tags).toEqual([cache.publicCharityTag("meals")]);
      }
    });
  });

  it("an entry older than the limit is never shown, even though Next would serve it once more while it refreshes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-11-24T10:00:00Z"));
      expect(await cache.charityIsListed("meals")).toBe(true);
      charities[0].status = "suspended"; // an admin acted, but nothing refreshed the cache (a missed write)
      vi.setSystemTime(new Date("2026-11-24T10:00:59Z"));
      expect(await cache.charityIsListed("meals")).toBe(true); // still inside the limit
      vi.setSystemTime(new Date("2026-11-24T10:01:01Z"));
      expect(await cache.charityIsListed("meals")).toBe(false); // past it: read live
    } finally {
      vi.useRealTimers();
    }
  });

  it("an address with no listed charity is not found, and a pending one is not listed", async () => {
    charities.push(charity({ id: "c3", slug: "new", status: "pending_review" }));
    expect(await cache.charityIsListed("nobody")).toBe(false);
    expect(await cache.charityIsListed("new")).toBe(false);
  });
});

describe("what is never inside the cache", () => {
  it("a failed read is not kept, and the layout treats it as listed so the page shows its own error", async () => {
    readFails = true;
    expect(await cache.charityIsListed("meals")).toBe(true);
    expect(store.size).toBe(0);
    readFails = false;
    expect((await cache.loadListedCharity("meals"))?.name_en).toBe("Meals for All");
  });

  it("the pause switch acts at once: it is worked out on each request, not read from the cache", async () => {
    await cache.loadPublicDonatable("meals"); // fills the cache
    vi.stubEnv("GIVING_PAUSED", "yes");
    expect((await cache.loadPublicDonatable("meals"))?.givingPaused).toBe(true);
    expect((await cache.loadPublicDonatable("meals"))?.acceptingPayments).toBe(false);
    vi.stubEnv("GIVING_PAUSED", "");
    expect((await cache.loadPublicDonatable("meals"))?.givingPaused).toBe(false);
  });

  it("a campaign past its last day drops off on the next request, with no refresh and no waiting for an expiry", async () => {
    campaigns = [{ id: "k1", title: "Winter", status: "active", endsAt: "2026-11-24T21:59:59Z" }];
    const before = new Date("2026-11-24T12:00:00Z");
    const after = new Date("2026-11-24T22:00:01Z");
    expect((await cache.loadPublicOpenCampaigns("meals", "c1", before)).map((c) => c.id)).toEqual(["k1"]);
    expect(await cache.loadPublicOpenCampaigns("meals", "c1", after)).toEqual([]);
    // ...and a give link to it then says it ended, which needs the campaign itself, still in the cached list.
    expect((await cache.loadPublicAllCampaigns("meals", "c1")).map((c) => c.id)).toEqual(["k1"]);
  });

  it("a focus outside its dates is not shown, whatever is cached", async () => {
    focusRows = [{ charity_id: "c1", campaign_id: null, title: "Winter drive", message: "Warm blankets", starts_on: "2026-11-20", ends_on: "2026-11-25" }];
    expect((await cache.loadPublicFocusToday("meals", "c1", "2026-11-24"))?.title).toBe("Winter drive");
    expect(await cache.loadPublicFocusToday("meals", "c1", "2026-11-26")).toBeNull();
    expect(await cache.loadPublicFocusToday("meals", "c1", "2026-11-19")).toBeNull();
  });
});

describe("the cache is only for the pages, never for money", () => {
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

  it("checkout and the give action read the charity live", () => {
    for (const p of ["src/lib/donations/checkout.ts", "src/app/c/[slug]/donate/actions.ts", "src/app/api/app/ready/route.ts", "src/app/api/app/quote/route.ts"]) {
      const src = read(p);
      expect(src, p).toContain("loadDonatableCharity");
      expect(src, p).not.toContain("public-cache");
    }
  });

  it("the give page keeps the signed-in donor and their saved ID out of the cache", () => {
    const page = read("src/app/c/[slug]/donate/give-page.tsx"); // the page's content, shared with its preview (27/11/2026)
    expect(page).toContain("getViewer()");
    expect(page).toContain("savedIdLast4(viewer.userId)");
    const lib = read("src/lib/charity/public-cache.ts");
    expect(lib).not.toMatch(/getViewer|cookies\(|headers\(|savedIdLast4|createClient\(\)/);
  });

  it("every place that saves what these pages show refreshes them", () => {
    for (const p of [
      "src/app/admin/charities/[id]/actions.ts", // approve, suspend, reinstate, s18A, payment connection, bank
      "src/app/charity-admin/[id]/profile/actions.ts", // text, logo, cover, video, categories, amounts
      "src/app/charity-admin/[id]/updates/actions.ts", // updates and photos
      "src/app/charity-admin/[id]/campaigns/actions.ts", // campaigns
      "src/lib/charity/charity-actions.ts", // Undo
      "src/lib/charity/profile-extras.ts", // the focus
    ]) {
      expect(read(p), p).toMatch(/revalidateCharity(Pages|Slugs)\(/);
    }
  });
});

describe("review fixes 24/11/2026", () => {
  it("a made-up address is refused before the cache or the database is touched", async () => {
    for (const bad of ["", "Meals", "a b", "-x", "x-", "a--b", "../etc", "x".repeat(65), "meals/../x", "%00"]) {
      expect(await cache.loadListedCharity(bad)).toBeNull();
    }
  });

  it("the image service endpoint has no allowed address unless the service is switched on", async () => {
    const mod = async (flag: string | undefined) => {
      vi.resetModules();
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
      if (flag === undefined) vi.stubEnv("CHARITY_IMAGE_SERVICE", ""); else vi.stubEnv("CHARITY_IMAGE_SERVICE", flag);
      return (await import("../next.config")).default;
    };
    expect((await mod(undefined)).images?.remotePatterns).toEqual([]);
    expect((await mod("no")).images?.remotePatterns).toEqual([]);
    expect((await mod("yes")).images?.remotePatterns).toHaveLength(1);
    vi.unstubAllEnvs();
  });
});
