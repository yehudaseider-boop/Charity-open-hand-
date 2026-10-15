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

import { averageCents, repeatPercent } from "@/lib/charity/dashboard";

describe("charity insights figures", () => {
  it("averages in whole cents, rounding half up, without floats", () => {
    expect(averageCents(100_00, 3)).toBe(3_333);
    expect(averageCents(5, 2)).toBe(3);
    expect(averageCents(0, 0)).toBe(0);
  });
  it("gives the repeat share as a whole percentage", () => {
    expect(repeatPercent(1, 3)).toBe(33);
    expect(repeatPercent(0, 0)).toBe(0);
  });
});

import { applicationSteps, currentStep } from "@/lib/charity/checklist";

describe("guided application", () => {
  const items = [
    { key: "organisation", label: "", done: true },
    { key: "address", label: "", done: true },
    { key: "contact", label: "", done: false },
    { key: "bank", label: "", done: true },
    { key: "bank_confirmation", label: "", done: true },
    { key: "s18a_approval", label: "", done: false },
  ];
  it("groups the checklist into steps; documents are done only when every document is", () => {
    const steps = applicationSteps(items);
    expect(steps.map((s) => [s.key, s.done])).toEqual([["organisation", true], ["address", true], ["contact", false], ["bank", true], ["documents", false], ["submit", false]]);
  });
  it("lands on the step asked for, else the first one not done", () => {
    const steps = applicationSteps(items);
    expect(currentStep(steps, undefined).key).toBe("contact");
    expect(currentStep(steps, "bank").key).toBe("bank");
    expect(currentStep(steps, "nonsense").key).toBe("contact");
    expect(currentStep(applicationSteps(items.map((i) => ({ ...i, done: true }))), undefined).key).toBe("submit");
  });
});

import { gettingStarted } from "@/lib/charity/checklist";

describe("getting started after approval", () => {
  it("ticks itself off from what the charity has done", () => {
    const none = gettingStarted({ cover_path: null, description_en: null, funds_use_en: " ", gateway_subaccount_ref: null }, { updates: 0, campaigns: 0 }, "/c-a/1");
    expect(none.every((i) => !i.done)).toBe(true);
    expect(none.find((i) => i.key === "payments")?.href).toBeNull();
    const all = gettingStarted({ cover_path: "1/cover.jpg", description_en: "We feed families", funds_use_en: "Food", gateway_subaccount_ref: "ACCT_1" }, { updates: 2, campaigns: 1 }, "/c-a/1");
    expect(all.every((i) => i.done)).toBe(true);
  });
});
