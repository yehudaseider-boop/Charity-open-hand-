import { describe, expect, it } from "vitest";
import { dashboardLinks } from "@/lib/dashboard-link";

describe("Work areas in the site header", () => {
  it("are not shown to visitors or plain donors", () => {
    expect(dashboardLinks(null)).toEqual([]);
    expect(dashboardLinks({ managedCharityIds: [], isPlatformAdmin: false })).toEqual([]);
  });
  it("go straight to the charity when the person manages one", () => {
    expect(dashboardLinks({ managedCharityIds: ["c1"], isPlatformAdmin: false })).toEqual([{ href: "/charity-admin/c1", label: "Charity dashboard", short: "Dashboard" }]);
  });
  it("go to the list when they manage several", () => {
    expect(dashboardLinks({ managedCharityIds: ["c1", "c2"], isPlatformAdmin: false })).toEqual([{ href: "/charity-admin", label: "Charity dashboard", short: "Dashboard" }]);
  });
  it("give Givezy staff their own area, named differently, next to any charity they manage", () => {
    expect(dashboardLinks({ managedCharityIds: [], isPlatformAdmin: true })).toEqual([{ href: "/admin", label: "Givezy admin", short: "Admin" }]);
    expect(dashboardLinks({ managedCharityIds: ["c1"], isPlatformAdmin: true }).map((d) => d.label)).toEqual(["Charity dashboard", "Givezy admin"]);
  });
});

import { canonicalRedirect } from "@/lib/canonical-host";

describe("one address for the whole site", () => {
  const site = "https://charity-open-hand.vercel.app";
  const at = (u: string) => new URL(u);
  it("moves a page visit on another address to SITE_URL, keeping the path and query", () => {
    expect(canonicalRedirect(at("https://test.givezy.co.za/login?next=%2Fadmin"), "GET", site, true)).toBe("https://charity-open-hand.vercel.app/login?next=%2Fadmin");
  });
  it("leaves the right address, payment messages, the app's calls and sent forms alone", () => {
    expect(canonicalRedirect(at(`${site}/login`), "GET", site, true)).toBeNull();
    expect(canonicalRedirect(at("https://test.givezy.co.za/api/webhooks/paystack"), "POST", site, true)).toBeNull();
    expect(canonicalRedirect(at("https://test.givezy.co.za/api/health"), "GET", site, true)).toBeNull();
    expect(canonicalRedirect(at("https://test.givezy.co.za/admin"), "POST", site, true)).toBeNull();
  });
  it("does nothing on a computer, without SITE_URL, or with a broken one", () => {
    expect(canonicalRedirect(at("http://localhost:3000/login"), "GET", site, false)).toBeNull();
    expect(canonicalRedirect(at("https://test.givezy.co.za/login"), "GET", undefined, true)).toBeNull();
    expect(canonicalRedirect(at("https://test.givezy.co.za/login"), "GET", "not a url", true)).toBeNull();
    expect(canonicalRedirect(at("https://test.givezy.co.za/login"), "GET", "http://insecure.example", true)).toBeNull();
  });
});
