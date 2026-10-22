import type { Viewer } from "@/lib/auth";

/**
 * Where "Dashboard" in the header goes: straight to the charity when the person manages one, the list
 * when they manage several. Platform admins without a charity get the admin area instead.
 */
export function dashboardLink(viewer: Pick<Viewer, "managedCharityIds" | "isPlatformAdmin"> | null): { href: string; label: string } | null {
  if (!viewer) return null;
  if (viewer.managedCharityIds.length === 1) return { href: `/charity-admin/${viewer.managedCharityIds[0]}`, label: "Dashboard" };
  if (viewer.managedCharityIds.length > 1) return { href: "/charity-admin", label: "Dashboard" };
  if (viewer.isPlatformAdmin) return { href: "/admin", label: "Admin" };
  return null;
}
