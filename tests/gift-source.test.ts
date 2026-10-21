import { describe, expect, it } from "vitest";
import { cameFromOf, giftSourceLabel, sourceTag, tagOf, withSource } from "@/lib/donations/source";
import { donorGiving } from "@/lib/charity/donor-giving";
import { applyDonationFilters, filtersToQuery, parseDonationFilters } from "@/lib/charity/donation-filters";

describe("where a gift came from", () => {
  it("reads only the known tags from a link", () => {
    expect(sourceTag("whatsapp")).toBe("whatsapp");
    expect(sourceTag(["qr", "link"])).toBe("qr");
    for (const bad of ["", "WhatsApp", "recorded", "app", "website", "toString", "__proto__", undefined, 5]) expect(sourceTag(bad)).toBeNull();
  });
  it("the app always counts as the app; the website uses the link's tag, or none", () => {
    expect(cameFromOf({ fromApp: true, tag: "qr" })).toBe("app");
    expect(cameFromOf({ tag: "whatsapp" })).toBe("whatsapp");
    expect(cameFromOf({ tag: "link" })).toBe("share_link");
    expect(cameFromOf({ tag: "qr" })).toBe("qr");
    expect(cameFromOf({ tag: "recorded" })).toBe("website");
    expect(cameFromOf({ tag: null })).toBe("website");
  });
  it("a stored source gives back its tag, so trying again keeps it", () => {
    expect(tagOf("share_link")).toBe("link");
    expect(tagOf("whatsapp")).toBe("whatsapp");
    expect(tagOf("website")).toBeNull();
    expect(tagOf(null)).toBeNull();
  });
  it("adds the tag to a link with or without a query", () => {
    expect(withSource("/c/meals/donate", "qr")).toBe("/c/meals/donate?src=qr");
    expect(withSource("/c/meals/donate?campaign=x", "link")).toBe("/c/meals/donate?campaign=x&src=link");
    expect(withSource("/c/meals", null)).toBe("/c/meals");
  });
  it("names older gifts plainly", () => {
    expect(giftSourceLabel(null)).toBe("Not known");
    expect(giftSourceLabel("qr")).toBe("QR poster");
    expect(giftSourceLabel("nonsense")).toBe("Not known");
  });
});

describe("a donor's giving summed", () => {
  const titles = new Map([["c1", "Winter parcels"]]);
  const g = (id: string, cents: number, campaign: string | null, from: string | null, day: string) => ({ id, amount_cents: cents, campaign_id: campaign, came_from: from, paid_at: `${day}T10:00:00+02:00` });
  it("largest gift, by campaign and by source, in whole cents", () => {
    const r = donorGiving([g("a", 50_000, null, "website", "2026-01-01"), g("b", 125_050, "c1", "whatsapp", "2026-02-01"), g("c", 125_050, "c1", null, "2026-03-01"), g("d", 10_000, "gone", "qr", "2026-04-01")], titles);
    expect(r.largest?.id).toBe("b");
    expect(r.byCampaign).toEqual([
      { key: "c1", label: "Winter parcels", cents: 250_100, count: 2 },
      { key: "none", label: "No campaign", cents: 50_000, count: 1 },
      { key: "gone", label: "A campaign", cents: 10_000, count: 1 },
    ]);
    expect(r.bySource.map((l) => [l.label, l.cents])).toEqual([["Not known", 125_050], ["WhatsApp", 125_050], ["Website", 50_000], ["QR poster", 10_000]]);
  });
  it("no gifts, no largest", () => {
    expect(donorGiving([], titles)).toEqual({ largest: null, byCampaign: [], bySource: [] });
  });
});

describe("campaign and source filters on Donations", () => {
  const CAMP = "6F1C2A52-3B7E-4D0A-9C41-2F6E8D5B7A10";
  it("keeps a real campaign id, 'none' or nothing; a known source, 'unknown' or nothing", () => {
    expect(parseDonationFilters({ campaign: CAMP, source: "whatsapp" })).toMatchObject({ campaign: CAMP.toLowerCase(), source: "whatsapp" });
    expect(parseDonationFilters({ campaign: "none", source: "unknown" })).toMatchObject({ campaign: "none", source: "unknown" });
    expect(parseDonationFilters({ campaign: "x' or 1=1", source: "evil" })).toMatchObject({ campaign: "", source: "" });
  });
  it("travels in links and the CSV download", () => {
    expect(filtersToQuery(parseDonationFilters({ campaign: "none", source: "qr" }))).toBe("campaign=none&source=qr");
  });
  it("narrows the query", () => {
    const calls: string[] = [];
    const q = { eq: (c: string, v: string) => (calls.push(`eq ${c} ${v}`), q), gte: () => q, lt: () => q, or: () => q, is: (c: string, v: null) => (calls.push(`is ${c} ${v}`), q) };
    applyDonationFilters(q, parseDonationFilters({ campaign: CAMP, source: "unknown" }));
    applyDonationFilters(q, parseDonationFilters({ campaign: "none", source: "share_link" }));
    expect(calls).toEqual([`eq campaign_id ${CAMP.toLowerCase()}`, "is came_from null", "is campaign_id null", "eq came_from share_link"]);
  });
});
