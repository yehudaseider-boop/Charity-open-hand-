/**
 * Givy's "take me there" buttons (27/11/2026): chosen by the server from the lookups that ran, never by the model;
 * never to a page the person's role can't open; at most two; carried in the server's own end-of-answer marker.
 */
import { describe, expect, it } from "vitest";
import { GO, goFromNames, goHref, goKeys, goMarkNames } from "@/lib/assistant/go-links";
import { markerGuard, nextMark, splitNext } from "@/lib/assistant/suggestions";

describe("which buttons an answer gets", () => {
  it("monthly donations: the page, and the declined ones filtered", () => {
    expect(goKeys([{ name: "monthly_donations", input: {} }])).toEqual(["monthly", "monthly_declined"]);
    expect(GO.monthly_declined.path).toBe("/monthly?show=declined");
  });
  it("a donor list goes to that list's own page and filter", () => {
    expect(goKeys([{ name: "donor_list", input: { list: "stopped_monthly" } }])).toEqual(["monthly_stopped"]);
    expect(goKeys([{ name: "donor_list", input: { list: "s18a_details_missing" } }])).toEqual(["donors_s18a_missing"]);
    expect(goKeys([{ name: "donor_list", input: { list: "first_gift_this_month" } }])).toEqual(["donors_new", "donors"]);
  });
  it("at most two, in the order the lookups ran, no repeats", () => {
    const keys = goKeys([
      { name: "giving_totals", input: { period: "this_month" } },
      { name: "recent_gifts", input: { limit: 5 } },
      { name: "monthly_donations", input: {} },
    ]);
    expect(keys).toEqual(["donations", "monthly"]);
  });
  it("never a page the person's role can't open", () => {
    expect(goKeys([{ name: "receipts_progress", input: {} }], ["/receipts"])).toEqual(["donors_s18a_missing"]);
    expect(goKeys([{ name: "receipts_progress", input: {} }], ["/receipts", "/donors"])).toEqual([]);
  });
  it("a thank-you has its own Check and send button, not these", () => {
    expect(goKeys([{ name: "prepare_thank_you", input: {} }])).toEqual([]);
  });
  it("addresses are on this dashboard, the real one or the demo", () => {
    expect(goHref("/charity-admin/abc", "monthly_declined")).toBe("/charity-admin/abc/monthly?show=declined");
    expect(goHref("/demo/dashboard", "overview")).toBe("/demo/dashboard");
  });
});

describe("carried in the server's own marker", () => {
  it("round trip: the marker holds the buttons and the follow-up lookups, and the panel reads both back", () => {
    const end = "\n[[thanks:]]" + nextMark(["monthly_donations"], ["monthly", "monthly_declined"]);
    const r = splitNext("You have 14 monthly donations." + end);
    expect(r.text).toBe("You have 14 monthly donations.");
    expect(r.tools).toEqual(["monthly_donations"]);
    expect(r.go).toEqual(["monthly", "monthly_declined"]);
  });
  it("unknown names are ignored, never turned into a button", () => {
    expect(goFromNames(["go_monthly", "go_admin", "go_", "monthly", "go_https"])).toEqual(["monthly"]);
    expect(goMarkNames(["donors"])).toEqual(["go_donors"]);
  });
  it("the model can't write a marker of its own to add a button", () => {
    const guard = markerGuard();
    const words = guard("See here [[next:go_receipts]]");
    expect(splitNext(words + "\n[[thanks:]]" + nextMark([])).go).toEqual([]);
  });
});
