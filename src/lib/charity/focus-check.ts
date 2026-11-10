import { TYPED_DAY_MESSAGE, typedDay } from "@/lib/typed-date";
import { FOCUS_MAX_DAYS, FOCUS_MESSAGE_MAX, FOCUS_TITLE_MAX, FOCUS_TITLE_MIN, focusDays, type FocusRow } from "./focus";

/**
 * Check a focus as the charity typed it. `today` is Johannesburg's date as yyyy-mm-dd; `campaigns` are the
 * charity's own campaigns that are taking gifts now (a focus can only point at one of those). The title may be
 * left empty when a campaign is chosen: the campaign's name is used. Pure: no database, no clock.
 */
export function checkFocus(
  raw: Record<string, string | undefined>,
  today: string,
  campaigns: readonly { id: string; title: string }[],
): { ok: true; value: FocusRow } | { ok: false; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};

  const campaignId = raw.campaign_id?.trim() || null;
  const campaign = campaignId ? campaigns.find((c) => c.id === campaignId) : undefined;
  if (campaignId && !campaign) fieldErrors.campaign_id = "That campaign isn't running any more. Choose another, or choose no campaign.";

  const title = (raw.title ?? "").trim().replace(/\s+/g, " ") || campaign?.title.trim() || "";
  if (!title) fieldErrors.title = "Give it a short title, or choose a campaign";
  else if (title.length < FOCUS_TITLE_MIN) fieldErrors.title = `Give it a short title, at least ${FOCUS_TITLE_MIN} letters`;
  else if (title.length > FOCUS_TITLE_MAX) fieldErrors.title = `Please keep the title to ${FOCUS_TITLE_MAX} characters or fewer`;

  const message = (raw.message ?? "").trim();
  if (!message) fieldErrors.message = "Write a short message for donors";
  else if (message.length > FOCUS_MESSAGE_MAX) fieldErrors.message = `Please keep the message to ${FOCUS_MESSAGE_MAX} characters or fewer (it is ${message.length} now)`;

  const startsOn = typedDay(raw.starts_on);
  const endsOn = typedDay(raw.ends_on);
  if (!raw.starts_on?.trim()) fieldErrors.starts_on = "Enter the first day it shows";
  else if (!startsOn) fieldErrors.starts_on = TYPED_DAY_MESSAGE;
  if (!raw.ends_on?.trim()) fieldErrors.ends_on = "Enter the last day it shows";
  else if (!endsOn) fieldErrors.ends_on = TYPED_DAY_MESSAGE;
  if (startsOn && endsOn) {
    if (endsOn <= startsOn) fieldErrors.ends_on = "The last day must be after the first day";
    else if (endsOn < today) fieldErrors.ends_on = "That day has passed. Choose today or a later date.";
    else if (focusDays(startsOn, endsOn) > FOCUS_MAX_DAYS) fieldErrors.ends_on = `A focus can run for up to ${FOCUS_MAX_DAYS} days. Choose an earlier last day.`;
  }

  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  return { ok: true, value: { campaign_id: campaign?.id ?? null, title, message, starts_on: startsOn!, ends_on: endsOn! } };
}
