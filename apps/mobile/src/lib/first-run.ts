import { secureStorage } from "./secure-storage";

/**
 * The "small yes first" flow: a new donor gives first, and is asked about a giving goal once, afterwards.
 * Two flags live on the phone only: whether the goal invitation has been shown (it is never shown twice),
 * and whether the donor dismissed the goal card on Home.
 */
const INVITED = "nediv-lev.goal-invited";
/** Written when someone finishes the new first open: only they can be invited. Donors from before never are. */
const NEW_DONOR = "nediv-lev.new-donor";
const CARD_DISMISSED = "nediv-lev.goal-card-dismissed";

async function flag(key: string): Promise<boolean> {
  try {
    return (await secureStorage.getItem(key)) === "1";
  } catch {
    return false;
  }
}
async function setFlag(key: string): Promise<void> {
  try {
    await secureStorage.setItem(key, "1");
  } catch {
    // Not saved: the worst case is it shows once more.
  }
}

export const goalInvited = () => flag(INVITED);
export const markGoalInvited = () => setFlag(INVITED);
export const isNewDonor = () => flag(NEW_DONOR);
export const markNewDonor = () => setFlag(NEW_DONOR);
export const goalCardDismissed = () => flag(CARD_DISMISSED);
export const dismissGoalCard = () => setFlag(CARD_DISMISSED);

/**
 * Whether this gift is the donor's first, as far as the phone can tell: signed in, only when their giving
 * history has loaded fresh from the server and is empty; signed out (no history to see), only for someone who
 * came through the new first open and hasn't been invited yet.
 */
export function isFirstGift(s: { signedIn: boolean; freshHistoryEmpty: boolean; newDonor: boolean; invited: boolean }): boolean {
  return s.newDonor && !s.invited && (s.signedIn ? s.freshHistoryEmpty : true);
}

/**
 * Whether to invite this donor to set a goal right after a gift: only a new donor's first gift, only if
 * they have no goal, only once ever, and only once the gift is confirmed. Donors from before the new first
 * open never see it; with no goal they only get the card on Home.
 */
export function shouldInviteGoal(s: { goalsReady: boolean; goalCount: number; firstGift: boolean; confirming: boolean }): boolean {
  return s.goalsReady && s.goalCount === 0 && s.firstGift && !s.confirming;
}

/**
 * Test builds only (Expo Go): make this phone a new donor again, so the first open, the two questions and
 * the goal invitation can be tried again. Clears only these first-open choices; goals, gifts and the
 * account are left alone.
 */
export async function startAgainAsNewDonor(): Promise<void> {
  for (const key of ["nediv-lev.welcomed", "nediv-lev.causes", "nediv-lev.giver-type", NEW_DONOR, INVITED, CARD_DISMISSED]) {
    try {
      await secureStorage.removeItem(key);
    } catch {
      // Best effort: a key left behind only means that one step is skipped.
    }
  }
}
