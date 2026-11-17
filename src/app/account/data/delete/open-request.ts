import { formatDate } from "@/lib/dates";

type RequestRow = { kind: string; status: string; created_at: string };

/** The person's open request to delete their account, if they already made one (the oldest still open). */
export function openDeleteRequest<T extends RequestRow>(rows: readonly T[] | null | undefined): T | null {
  const open = (rows ?? []).filter((r) => r.kind === "delete" && r.status === "open");
  if (open.length === 0) return null;
  return open.reduce((a, b) => (new Date(b.created_at) < new Date(a.created_at) ? b : a));
}

/** What the page says when a delete request is already waiting. */
export function alreadyAskedSentence(createdAt: string): string {
  return `You've already asked us to delete your account on ${formatDate(createdAt)}. We'll reply by email.`;
}
