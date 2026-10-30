import { platformConfig } from "@/config/platform";

/** "2 working days": how soon we promise to review a submitted application (src/config/platform.ts). */
export function reviewWithin(days: number = platformConfig.applicationReviewWorkingDays): string {
  return `${days} working ${days === 1 ? "day" : "days"}`;
}
