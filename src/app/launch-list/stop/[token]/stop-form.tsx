"use client";

import { ActionForm } from "@/components/forms/action-form";
import { leaveLaunchList } from "../../actions";

export function StopForm({ token }: { token: string }) {
  return (
    <ActionForm action={leaveLaunchList} submitLabel="Take me off the list" pendingLabel="Removing…">
      <input type="hidden" name="token" value={token} />
    </ActionForm>
  );
}
