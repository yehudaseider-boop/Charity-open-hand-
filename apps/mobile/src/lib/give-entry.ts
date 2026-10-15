import { router } from "expo-router";
import { IN_APP_GIVING } from "./give-flow";
import { supabase } from "./supabase";
import { SITE_URL } from "./website";

/**
 * Where "Give" leads. The app's own give screen when in-app giving is switched on (and the
 * website is live), and always in the design preview (no live data) so the flow can be tried.
 * Otherwise the give sheet, which hands over to the website.
 */
export const GIVE_IN_APP = (IN_APP_GIVING && Boolean(SITE_URL)) || supabase === null;

export function openGiveScreen(slug: string, extra: { kind?: string; campaign?: string } = {}) {
  router.push({ pathname: "/give/[slug]", params: { slug, ...extra } });
}
