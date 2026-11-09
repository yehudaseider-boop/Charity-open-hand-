"use client";

import { Badge } from "@/components/badge";
import { Card, Notice } from "@/components/card";
import { PageHeader } from "@/components/dash";
import { DocumentList, OrganisationSummary, PrivateSummary } from "@/components/charity-summary";
import { ContactForm } from "@/app/charity-admin/[id]/application/forms";
import type { FormState } from "@/lib/form";
import { pause, useDemo } from "./store";

/**
 * The Application page as an approved charity sees it, in the public demo: its details, bank and documents as Givezy
 * checked them, and the contact person, which can be changed (kept in this browser only). Every detail is made up.
 */

type Contact = { contact_name: string | null; contact_email: string | null; contact_phone: string | null };
const START_CONTACT: Contact = { contact_name: "Thandi Sample", contact_email: "hello@samplecharity.example", contact_phone: "010 000 0000" };

export function DemoApplication({ approvedOn, uploadedOn }: { approvedOn: string; uploadedOn: string }) {
  const [contact, setContact] = useDemo<Contact>("contact", START_CONTACT);
  const save = async (_: FormState, f: FormData): Promise<FormState> => {
    const name = String(f.get("contact_name") ?? "").trim();
    const email = String(f.get("contact_email") ?? "").trim();
    const errors: Record<string, string> = {};
    if (name.length < 2) errors.contact_name = "Enter the contact person's full name";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.contact_email = "Enter an email address, for example name@example.co.za";
    if (Object.keys(errors).length) return { ok: false, message: "Some details need fixing. Nothing was saved yet.", fieldErrors: errors };
    await pause();
    setContact({ contact_name: name, contact_email: email, contact_phone: String(f.get("contact_phone") ?? "").trim() || null });
    return { ok: true, message: "Saved. In the real dashboard we'd let the old address know too. Kept in this browser only." };
  };
  const docs = (["npo_certificate", "pbo_approval", "s18a_approval", "bank_confirmation", "receipting_mandate"] as const).map((t, i) => ({
    id: t,
    document_type: t,
    file_name: `sample-${t.replace(/_/g, "-")}.pdf`,
    signed_on: t === "receipting_mandate" ? uploadedOn : null,
    uploaded_at: `${uploadedOn}T09:${String(10 + i).padStart(2, "0")}:00+02:00`,
  }));
  return (
    <div className="space-y-5">
      <PageHeader title="Application" intro={<Badge tone="success">Approved</Badge>} />
      <Notice>Givezy checked these details and documents by hand, and approved Sample Charity on {approvedOn}. Every detail here is made up.</Notice>
      <Card title="Organisation">
        <OrganisationSummary c={{ name_en: "Sample Charity", legal_name_en: "Sample Charity NPC", npo_number: "000-000 NPO", pbo_number: "930000000", s18a_reference: "930000000", address_line1: "1 Sample Street", address_line2: null, suburb: "Sampleton", city: "Johannesburg", postal_code: "2000" }} />
      </Card>
      <Card title="Contact and bank">
        <PrivateSummary p={{ ...contact, bank_name: "Sample Bank", bank_account_holder: "Sample Charity NPC", bank_account_last4: "0000", bank_branch_code: "000000", bank_verified_at: `${uploadedOn}T12:00:00+02:00` }} />
      </Card>
      <Card title="Contact person">
        <p className="mb-3 text-sm text-muted">Who we email about your charity. If you change the email or phone number, we let the old address know too.</p>
        <ContactForm action={save} priv={contact} />
      </Card>
      <Card title="Documents">
        <DocumentList docs={docs} />
      </Card>
    </div>
  );
}
