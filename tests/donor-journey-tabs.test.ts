/**
 * The "Donor journeys" area (23/11/2026, Yehuda's meeting): one menu item for Journeys, Keeping donors, Thank donors
 * and Email donors, with a tab row on each page. Donors stays its own item. Each role sees only what it can use.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { hiddenPages } from "@/lib/charity/permissions";
import { DONOR_JOURNEY_PAGES, donorJourneyTabItems, donorJourneysHref, inDonorJourneys } from "@/lib/charity/donor-journey-tabs";

const path = vi.hoisted(() => ({ current: "/charity-admin/c1/keeping" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.current }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/charity/team", () => ({ viewerRole: async () => "owner" }));
vi.mock("@/components/use-current-tab-in-view", () => ({ useCurrentTabInView: () => ({ current: null }) }));
const { CharityNav } = await import("@/components/charity-nav");
const { DonorJourneyTabsView } = await import("@/components/donor-journey-tabs");

const nav = (hidden: string[], at: string) => {
  path.current = at;
  return renderToStaticMarkup(createElement(CharityNav, { id: "c1", hidden }));
};

describe("the Donor journeys area", () => {
  it("holds the four pages, in order, and keeps their addresses", () => {
    expect(DONOR_JOURNEY_PAGES.map((p) => p.href)).toEqual(["/journey", "/keeping", "/thank-donors", "/email-donors"]);
    expect(DONOR_JOURNEY_PAGES.map((p) => p.label)).toEqual(["Journeys", "Keeping donors", "Thank donors", "Email donors"]);
  });

  it("opens the first page each role can use", () => {
    for (const role of ["owner", "admin", "fundraiser"] as const) expect(donorJourneysHref(hiddenPages(role))).toBe("/journey");
    // Finance and viewers can't email donors, so the area opens on Keeping donors for them.
    for (const role of ["finance", "viewer"] as const) expect(donorJourneysHref(hiddenPages(role))).toBe("/keeping");
    // The demo leaves out journeys and keeping.
    expect(donorJourneysHref(["/keeping", "/journey", "/activity"])).toBe("/thank-donors");
    expect(donorJourneysHref(["/journey", "/keeping", "/thank-donors", "/email-donors"])).toBeNull();
  });

  it("counts the pages under it as part of it, and nothing else", () => {
    for (const p of ["/journey", "/journey/winback", "/keeping", "/thank-donors", "/email-donors"]) expect(inDonorJourneys(p)).toBe(true);
    for (const p of ["/donors", "/donors/d1", "/journeys", "", "/campaigns"]) expect(inDonorJourneys(p)).toBe(false);
  });

  it("marks the page you're on in the tab row, and shows only pages the role can use", () => {
    expect(donorJourneyTabItems("/charity-admin/c1", "/thank-donors", hiddenPages("owner"))).toEqual([
      { href: "/charity-admin/c1/journey", label: "Journeys", active: false },
      { href: "/charity-admin/c1/keeping", label: "Keeping donors", active: false },
      { href: "/charity-admin/c1/thank-donors", label: "Thank donors", active: true },
      { href: "/charity-admin/c1/email-donors", label: "Email donors", active: false },
    ]);
    // A single page is no row of tabs.
    expect(renderToStaticMarkup(createElement(DonorJourneyTabsView, { base: "/charity-admin/c1", current: "/keeping", hidden: hiddenPages("viewer") }))).toBe("");
  });

  it("replaces the four menu items with one, next to Donors", () => {
    const html = nav(hiddenPages("owner"), "/charity-admin/c1/keeping");
    expect(html).toContain(">Donors<");
    expect(html).toContain('href="/charity-admin/c1/journey"');
    for (const old of [">Keeping donors<", ">Thank donors<", ">Donor journey<", ">Email donors<"]) expect(html).not.toContain(old);
    // Marked as where you are on any of its pages (once in the phone row, once in the laptop list).
    expect(html.match(/aria-current="page"[^>]*>Donor journeys</g)).toHaveLength(2);
  });

  it("opens Keeping donors for a viewer, and isn't marked on other pages", () => {
    const html = nav(hiddenPages("viewer"), "/charity-admin/c1/donors");
    expect(html).toContain('href="/charity-admin/c1/keeping"');
    expect(html).not.toMatch(/aria-current="page"[^>]*>Donor journeys</);
  });
});
