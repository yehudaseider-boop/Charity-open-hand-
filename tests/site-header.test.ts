import { describe, expect, it } from "vitest";
import { dashboardLink } from "@/lib/dashboard-link";

describe("Dashboard link in the site header", () => {
  it("is not shown to visitors or plain donors", () => {
    expect(dashboardLink(null)).toBeNull();
    expect(dashboardLink({ managedCharityIds: [], isPlatformAdmin: false })).toBeNull();
  });
  it("goes straight to the charity when the person manages one", () => {
    expect(dashboardLink({ managedCharityIds: ["c1"], isPlatformAdmin: false })).toEqual({ href: "/charity-admin/c1", label: "Dashboard" });
  });
  it("goes to the list when they manage several", () => {
    expect(dashboardLink({ managedCharityIds: ["c1", "c2"], isPlatformAdmin: false })).toEqual({ href: "/charity-admin", label: "Dashboard" });
  });
  it("sends a platform admin with no charity to the admin area", () => {
    expect(dashboardLink({ managedCharityIds: [], isPlatformAdmin: true })).toEqual({ href: "/admin", label: "Admin" });
    expect(dashboardLink({ managedCharityIds: ["c1"], isPlatformAdmin: true })?.label).toBe("Dashboard");
  });
});
