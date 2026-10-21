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

/**
 * Every "Give" button in the app goes through here, so they all behave the same: the give screen when
 * giving in the app is on, otherwise the charity's page with its give sheet open (which hands over to
 * the website).
 */
export function openGiveScreen(slug: string, extra: { label?: string; campaign?: string } = {}) {
  if (GIVE_IN_APP) router.push({ pathname: "/give/[slug]", params: { slug, ...extra } });
  else router.push({ pathname: "/charity/[slug]", params: { slug, sheet: "give" } });
}
