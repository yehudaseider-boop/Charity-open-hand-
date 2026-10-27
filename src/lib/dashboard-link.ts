import type { Viewer } from "@/lib/auth";

export type DashboardLink = { href: string; label: string; short: string };

/**
 * The work areas in the header, each with its own name so the two are never mixed up (27/10/2026):
 * "Charity dashboard" is a charity's own area (straight to it when the person manages one, the list
 * when several); "Givezy admin" is Givezy's own area, for platform admins. A phone shows the short names.
 */
export function dashboardLinks(viewer: Pick<Viewer, "managedCharityIds" | "isPlatformAdmin"> | null): DashboardLink[] {
  if (!viewer) return [];
  const links: DashboardLink[] = [];
  if (viewer.managedCharityIds.length === 1) links.push({ href: `/charity-admin/${viewer.managedCharityIds[0]}`, label: "Charity dashboard", short: "Dashboard" });
  else if (viewer.managedCharityIds.length > 1) links.push({ href: "/charity-admin", label: "Charity dashboard", short: "Dashboard" });
  if (viewer.isPlatformAdmin) links.push({ href: "/admin", label: "Givezy admin", short: "Admin" });
  return links;
}
