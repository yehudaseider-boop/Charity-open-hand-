export const statusLabels = {
  draft: { label: "Draft", tone: "neutral" },
  pending_review: { label: "Waiting for review", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Changes needed", tone: "danger" },
  suspended: { label: "Suspended", tone: "danger" },
} as const;

export type CharityStatus = keyof typeof statusLabels;
