/** Stand-in for next/navigation in the single-page build. */
import { navigate, pathOf, useRoute } from "./router";

export function usePathname(): string {
  return pathOf(useRoute());
}

export function useRouter() {
  return { push: navigate, replace: navigate, back: () => history.back(), refresh: () => undefined, prefetch: () => undefined };
}

export function useParams<T extends Record<string, string>>(): T {
  const m = /^\/portal-demo\/campaigns\/([^/?]+)/.exec(useRoute());
  return { campaignId: m && m[1] !== "new" ? decodeURIComponent(m[1]) : "" } as unknown as T;
}

export function notFound(): never {
  throw new Error("Not found");
}
