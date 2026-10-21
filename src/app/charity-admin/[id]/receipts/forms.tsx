"use client";

import { ActionForm } from "@/components/forms/action-form";
import type { FormState } from "@/lib/form";

export function ApproveReceiptsForm({ action, count, total }: { action: (s: FormState, f: FormData) => Promise<FormState>; count: number; total: string }) {
  return (
    <ActionForm
      action={action}
      submitLabel={`Approve ${count} ${count === 1 ? "receipt" : "receipts"}`}
      pendingLabel="Approving…"
      confirm={`Approve ${count} s18A ${count === 1 ? "receipt" : "receipts"}, ${total} in all? Givezy checks the list and signs it off before anything is issued. Until then you can take your approval back.`}
      confirmLabel="Yes, approve"
    />
  );
}

export function WithdrawReceiptsForm({ action }: { action: (s: FormState, f: FormData) => Promise<FormState> }) {
  return <ActionForm action={action} submitLabel="Take back my approval" pendingLabel="Taking it back…" />;
}
