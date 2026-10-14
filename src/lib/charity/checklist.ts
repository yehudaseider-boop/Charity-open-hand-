import type { DocumentType } from "./validation";

type ChecklistInput = {
  charity: {
    name_en: string;
    legal_name_en: string;
    npo_number: string | null;
    pbo_number: string | null;
    s18a_reference: string | null;
    address_line1: string | null;
    city: string | null;
    postal_code: string | null;
  };
  priv: {
    contact_name: string | null;
    contact_email: string | null;
    bank_account_last4: string | null;
    bank_branch_code: string | null;
  } | null;
  documentTypes: DocumentType[];
};

export type ChecklistItem = { key: string; label: string; done: boolean };

/**
 * What an application needs before it can be submitted. s18A applicants
 * must also upload their PBO and s18A approvals and the signed mandate.
 */
export function applicationChecklist({ charity, priv, documentTypes }: ChecklistInput): ChecklistItem[] {
  const has = (t: DocumentType) => documentTypes.includes(t);
  const items: ChecklistItem[] = [
    {
      key: "organisation",
      label: "Organisation details",
      done: Boolean(charity.name_en && charity.legal_name_en && (charity.npo_number || charity.pbo_number)),
    },
    {
      key: "address",
      label: "Registered address",
      done: Boolean(charity.address_line1 && charity.city && charity.postal_code),
    },
    { key: "contact", label: "Contact person", done: Boolean(priv?.contact_name && priv?.contact_email) },
    { key: "bank", label: "Bank account", done: Boolean(priv?.bank_account_last4 && priv?.bank_branch_code) },
    { key: "bank_confirmation", label: "Bank confirmation letter", done: has("bank_confirmation") },
  ];
  if (charity.pbo_number) {
    items.push({ key: "pbo_approval", label: "PBO approval letter", done: has("pbo_approval") });
  }
  if (charity.s18a_reference) {
    items.push(
      { key: "s18a_approval", label: "s18A approval", done: has("s18a_approval") },
      { key: "receipting_mandate", label: "Signed receipting mandate", done: has("receipting_mandate") },
    );
  }
  return items;
}

export function isComplete(items: ChecklistItem[]) {
  return items.every((i) => i.done);
}
