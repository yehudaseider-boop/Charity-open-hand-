import { activeFocus, focusCampaign, focusDay, jhbToday, type Focus, type FocusRow } from "@shared/charity/focus";
import { VIDEO_FRAME_ORIGINS, VIDEO_PROVIDER_NAME, videoEmbedUrl, videoFrom, videoWatchUrl, type ProfileVideo } from "@shared/charity/video";

/**
 * The extras on a charity's screen (10/11/2026): its video (played inside the screen, decided 10/11/2026) and its own focus
 * ("What we're focused on right now"). Both are bonuses read on their own: if either can't load, the screen
 * shows without it. Pure functions (no React Native), so the website's test suite can check them.
 */

export type VideoRow = { video_provider?: unknown; video_id?: unknown };
export const VIDEO_COLUMNS = "video_provider, video_id";

/** The charity's video, or null. Only a known site and a well-formed id ever become a link. */
export function toVideo(row: VideoRow | null | undefined): ProfileVideo | null {
  return videoFrom(row);
}

/** The video's own page on YouTube or Vimeo, built from the site and id only: "Open in browser" and the player's own links. */
export function videoLink(video: ProfileVideo): string {
  return videoWatchUrl(video);
}

/** The line under the player, so nobody is surprised where the video comes from. */
export function videoNote(video: ProfileVideo): string {
  const site = VIDEO_PROVIDER_NAME[video.provider];
  return `The video plays from ${site}. Nothing loads from ${site} until you press play.`;
}

/**
 * The player shown inside the charity's screen (decided 10/11/2026), only after the donor presses play: the same
 * privacy-friendly player the website uses, built from the site and id only, never from a typed link, with
 * `playsinline` so it plays in the card rather than jumping to full screen on iPhone.
 */
export function videoPlayerUrl(video: ProfileVideo): string {
  return `${videoEmbedUrl(video)}&playsinline=1`;
}

/** The only two places the in-app player may load from (the same two the website's frame allows). */
export const VIDEO_PLAYER_ORIGINS: readonly string[] = VIDEO_FRAME_ORIGINS;

/** The video sites' own pages: a tap on the player's logo or title opens these in the phone's browser, not in the card. */
const WATCH_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "vimeo.com", "www.vimeo.com"]);

export type PlayerNavigation = "allow" | "browser" | "block";

/**
 * What the in-app player does with a page it is asked to load. The card itself may only show the two players
 * (exact origins, https, no name or password before the host). Inside the player, its own embedded frames may load
 * over https. A tap through to the video site's own page opens the phone's browser instead. Anything else
 * (another site, http, javascript:, data:, file:, intent:) is refused.
 */
export function playerNavigation(raw: string, isTopFrame: boolean): PlayerNavigation {
  if (!isTopFrame && (raw === "about:blank" || raw === "about:srcdoc")) return "allow";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "block";
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return "block";
  if (VIDEO_PLAYER_ORIGINS.includes(url.origin)) return "allow";
  if (WATCH_HOSTS.has(url.hostname.toLowerCase())) return isTopFrame ? "browser" : "block";
  return isTopFrame ? "block" : "allow";
}

/** The page the player says it came from. YouTube refuses to play in an app that sends none. */
export function playerReferrer(siteUrl: string | undefined): string {
  try {
    if (siteUrl) {
      const u = new URL(siteUrl);
      if (u.protocol === "https:") return `${u.origin}/`;
    }
  } catch {
    // Fall through to the public address.
  }
  return "https://givezy.co.za/";
}

/** The focus to show today (Johannesburg date, wherever the phone is), or null outside its dates. */
export function toFocus(row: Partial<FocusRow> | null | undefined, now: Date = new Date()): Focus | null {
  return activeFocus(row, jhbToday(now));
}

/**
 * What the focus card's button does: give to the chosen campaign while it is still running (it must be in the
 * charity's running campaigns), otherwise an ordinary gift to the charity.
 */
export function focusGive(focus: Focus, campaigns: readonly { id: string }[] | undefined): { label: string; campaignId: string | null } {
  const campaign = focusCampaign(focus, campaigns ?? []);
  return campaign ? { label: "Give to this campaign", campaignId: campaign.id } : { label: "Give", campaignId: null };
}

/** "Until 30/11/2026". */
export function focusUntil(focus: Focus): string {
  return `Until ${focusDay(focus.endsOn)}`;
}
