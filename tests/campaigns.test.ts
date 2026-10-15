import { describe, expect, it } from "vitest";
import { campaignSlug, checkCampaign, progressPercent } from "@/lib/charity/campaigns";

describe("a charity's new campaign", () => {
  const today = "2026-10-16";
  it("needs a name and a goal in Rand; the end date is optional and ends that day, Johannesburg time", () => {
    const ok = checkCampaign({ title: "Pesach food parcels", target: "50 000", ends_on: "2027-04-01" }, today);
    expect(ok).toEqual({ ok: true, value: { title: "Pesach food parcels", description: null, targetCents: 5_000_000, endsAt: "2027-04-01T23:59:59+02:00" } });
    const bad = checkCampaign({ title: "P", target: "lots", ends_on: "2026-10-15" }, today);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.fieldErrors).sort()).toEqual(["ends_on", "target", "title"]);
  });
  it("accepts today as the last day", () => {
    expect(checkCampaign({ title: "Chanukah", target: "1000", ends_on: today }, today).ok).toBe(true);
  });
  it("makes a tidy, unique web address", () => {
    expect(campaignSlug("Pesach Food Parcels 5787!", "AB12-cd34")).toBe("pesach-food-parcels-5787-ab12cd");
    expect(campaignSlug("!!!", "x9")).toBe("campaign-x9");
  });
  it("shows progress as a whole percentage, capped at 100", () => {
    expect(progressPercent(2_500_000, 5_000_000)).toBe(50);
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(9_000_000, 5_000_000)).toBe(100);
    expect(progressPercent(100, null)).toBe(0);
  });
});
