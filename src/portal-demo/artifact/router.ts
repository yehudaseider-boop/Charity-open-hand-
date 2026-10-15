/**
 * In-page router for the shareable single-page build of the portal (scripts/build-portal-artifact.mjs).
 * The Next.js app does not use this: it stands in for next/link and next/navigation when the portal
 * runs as one self-contained page, where there is no server to route between pages.
 */
import { useSyncExternalStore } from "react";

let current = "/portal-demo";
const listeners = new Set<() => void>();

declare global {
  interface Window {
    /** The query string of the current in-page route, read by useQueryParam. */
    __gzSearch?: string;
  }
}

export function navigate(href: string) {
  const [path, query = ""] = href.split("?");
  current = query ? `${path}?${query}` : path;
  window.__gzSearch = query ? `?${query}` : "";
  listeners.forEach((l) => l());
  window.scrollTo(0, 0);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The current route, path and query ("/portal-demo/donors?view=follow-up"). */
export function useRoute(): string {
  return useSyncExternalStore(subscribe, () => current, () => current);
}

export const pathOf = (route: string) => route.split("?")[0];
