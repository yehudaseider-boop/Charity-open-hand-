import { secureStorage } from "./secure-storage";

/**
 * The "small yes first" flow: a new donor gives first, and is asked about a giving goal once, afterwards.
 * Two flags live on the phone only: whether the goal invitation has been shown (it is never shown twice),
 * and whether the donor dismissed the goal card on Home.
 */
const INVITED = "nediv-lev.goal-invited";
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
export const goalCardDismissed = () => flag(CARD_DISMISSED);
export const dismissGoalCard = () => setFlag(CARD_DISMISSED);

/**
 * Whether to invite this donor to set a goal right after a gift: only the first gift (no giving history),
 * only if they have no goal, only once ever, and only once the gift is confirmed. Existing donors with a
 * history, or a goal, never see it; they only get the card on Home.
 */
export function shouldInviteGoal(s: { goalsReady: boolean; goalCount: number; giftCount: number; invited: boolean; confirming: boolean }): boolean {
  return s.goalsReady && s.goalCount === 0 && s.giftCount === 0 && !s.invited && !s.confirming;
}
