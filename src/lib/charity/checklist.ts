import type { DocumentType } from "./validation";
import { reviewWithin } from "./review-time";

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

/** The application as five steps plus submit, each done when its checklist items are. */
export type ApplicationStep = { key: "organisation" | "address" | "contact" | "bank" | "documents" | "submit"; label: string; hint: string; done: boolean };

const STEP_ITEMS: Record<Exclude<ApplicationStep["key"], "submit">, string[]> = {
  organisation: ["organisation"],
  address: ["address"],
  contact: ["contact"],
  bank: ["bank"],
  documents: ["bank_confirmation", "pbo_approval", "s18a_approval", "receipting_mandate"],
};

export function applicationSteps(items: ChecklistItem[]): ApplicationStep[] {
  const done = (keys: string[]) => items.filter((i) => keys.includes(i.key)).every((i) => i.done);
  const steps: ApplicationStep[] = [
    { key: "organisation", label: "Your organisation", hint: "The name donors will see, your registered legal name, and your NPO or PBO number. About two minutes.", done: done(STEP_ITEMS.organisation) },
    { key: "address", label: "Registered address", hint: "The address on your registration documents. It appears on s18A receipts.", done: done(STEP_ITEMS.address) },
    { key: "contact", label: "Contact person", hint: "Who we email about your application and your page. You can change it later.", done: done(STEP_ITEMS.contact) },
    { key: "bank", label: "Bank account", hint: "Where donations are paid. It must be in the organisation's name. Stored encrypted; only the last four digits are ever shown.", done: done(STEP_ITEMS.bank) },
    { key: "documents", label: "Documents", hint: "PDFs or clear photos, up to 4 MB each. You can upload straight from your phone.", done: done(STEP_ITEMS.documents) },
  ];
  return [...steps, { key: "submit", label: "Submit", hint: `Check the declarations and send it to us. We review it within ${reviewWithin()}.`, done: false }];
}

/** Where to land: the step asked for if it exists, otherwise the first one not yet done. */
export function currentStep(steps: ApplicationStep[], asked: string | undefined): ApplicationStep {
  return steps.find((s) => s.key === asked) ?? steps.find((s) => !s.done) ?? steps[steps.length - 1];
}

/** After approval: the few things that help donors find a charity and give. Each ticks itself off. */
export type StartItem = { key: string; label: string; done: boolean; href: string | null };

export function gettingStarted(
  c: { cover_path: string | null; description_en: string | null; funds_use_en: string | null; gateway_subaccount_ref: string | null },
  counts: { updates: number; campaigns: number },
  base: string,
): StartItem[] {
  return [
    { key: "payments", label: "Connected to receive online donations (we do this for you)", done: Boolean(c.gateway_subaccount_ref), href: null },
    { key: "cover", label: "Add a cover photo", done: Boolean(c.cover_path), href: `${base}/profile` },
    { key: "story", label: "Tell donors what you do and where gifts go", done: Boolean(c.description_en?.trim() && c.funds_use_en?.trim()), href: `${base}/profile` },
    { key: "update", label: "Post your first update", done: counts.updates > 0, href: `${base}/updates` },
    { key: "campaign", label: "Start a campaign, if you're raising for something specific", done: counts.campaigns > 0, href: `${base}/campaigns` },
  ];
}
