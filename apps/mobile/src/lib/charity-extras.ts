import { activeFocus, focusCampaign, focusDay, jhbToday, type Focus, type FocusRow } from "@shared/charity/focus";
import { VIDEO_PROVIDER_NAME, videoFrom, videoWatchUrl, type ProfileVideo } from "@shared/charity/video";

/**
 * The extras on a charity's screen (10/11/2026): its video (a "Watch our video" button) and its own focus
 * ("What we're focused on right now"). Both are bonuses read on their own: if either can't load, the screen
 * shows without it. Pure functions (no React Native), so the website's test suite can check them.
 */

export type VideoRow = { video_provider?: unknown; video_id?: unknown };
export const VIDEO_COLUMNS = "video_provider, video_id";

/** The charity's video, or null. Only a known site and a well-formed id ever become a link. */
export function toVideo(row: VideoRow | null | undefined): ProfileVideo | null {
  return videoFrom(row);
}

/** The address the in-app browser opens: the video's own page, built from the site and id only. */
export function videoLink(video: ProfileVideo): string {
  return videoWatchUrl(video);
}

/** The line under the button, so nobody is surprised where it opens. */
export function videoNote(video: ProfileVideo): string {
  return `Opens ${VIDEO_PROVIDER_NAME[video.provider]} in a sheet, here in the app.`;
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
