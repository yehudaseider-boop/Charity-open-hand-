import { cookies, headers } from "next/headers";
import { CURRENT_PATH_HEADER } from "@/lib/current-path";
import { FOCUS_COOKIE, focusFor } from "@/lib/focus";

/** The charity this page is focused on (see focus.ts), or null for the full site. */
export async function currentFocus(): Promise<string | null> {
  const [h, c] = await Promise.all([headers(), cookies()]);
  return focusFor(h.get(CURRENT_PATH_HEADER), c.get(FOCUS_COOKIE)?.value);
}
