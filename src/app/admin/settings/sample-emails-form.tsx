"use client";

import { ActionForm } from "@/components/forms/action-form";
import { sendSampleEmails } from "./actions";

export function SampleEmailsForm() {
  return (
    <ActionForm action={sendSampleEmails} submitLabel="Email me every email" pendingLabel="Sending… (about 30 seconds)">
      <p className="text-sm text-muted">
        One copy of each email donors, charities and the Givezy team get, filled with made-up details, sent only to your own
        address. Read them in Gmail, Outlook and on your phone. Every subject starts with &quot;[Sample]&quot;.
      </p>
    </ActionForm>
  );
}
