/** Masked display of a sensitive number: only the last 4 digits show. */
export function masked(last4: string | null | undefined): string {
  return last4 ? `•••• ${last4}` : "Not provided";
}
