/** Badge rules, in one place (mirrors charity_can_issue_18a in the database). */
export type BadgeFields = {
  is_verified: boolean;
  is_s18a: boolean;
  mandate_signed_at: string | null;
};

export function canIssue18a(c: BadgeFields): boolean {
  return c.is_s18a && c.mandate_signed_at !== null;
}

export function charityBadges(c: BadgeFields) {
  return {
    verified: c.is_verified,
    s18a: canIssue18a(c),
    noReceipts: !canIssue18a(c),
  };
}
