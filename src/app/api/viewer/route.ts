import { getViewer } from "@/lib/auth";
import { dashboardLinks } from "@/lib/dashboard-link";
import type { HeaderViewer } from "@/lib/header-viewer";

/**
 * What the site header needs to know about the person looking: signed in or not, and which work areas to link to.
 * The header asks for this from the browser, so public pages can be served from cache without reading anyone's
 * sign-in (09/11/2026). Never cached: it is about one person.
 */
export async function GET() {
  const viewer = await getViewer();
  const body: HeaderViewer = viewer ? { signedIn: true, dashboards: dashboardLinks(viewer) } : { signedIn: false, dashboards: [] };
  return Response.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
