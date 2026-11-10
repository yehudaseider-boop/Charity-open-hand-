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
    /** Set by loadCharityForManager for every role; the account itself is the owner's and finance's to see. */
    bank_set?: boolean;
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
    { key: "bank", label: "Bank account", done: Boolean(priv?.bank_set ?? (priv?.bank_account_last4 && priv?.bank_branch_code)) },
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

/**
 * After approval: "Getting started" on the overview (extended 10/11/2026, Yehuda "go"). The few things that help
 * donors find a charity, give and come back. Every step ticks itself off from real data; nothing is ticked by hand.
 * `can` says whether the signed-in person's role may do the step (src/lib/charity/permissions.ts): others see it
 * read-only with `who` saying who does it. Optional steps never hold up "all set". Matches the onboarding pack
 * (docs/charity-onboarding): logo and photos, bank checked, s18A receipt details, team logins.
 */
export type StartItem = {
  key: string;
  label: string;
  /** Why it matters, in one plain line. */
  why: string;
  done: boolean;
  /** Where it is done; null when Givezy does it. */
  href: string | null;
  /** May this person do it? */
  can: boolean;
  /** Who does it, when this person can't (or Givezy does it). */
  who: string | null;
  optional?: boolean;
};

export type StartFacts = {
  charity: {
    logo_path: string | null;
    cover_path: string | null;
    description_en: string | null;
    funds_use_en: string | null;
    thank_you_en: string | null;
    gateway_subaccount_ref: string | null;
  };
  /** Bank details saved, and checked by Givezy (bank_verified_at). Never the account itself. */
  bank: { saved: boolean; checked: boolean };
  /** The charity issues s18A receipts; then its SARS details (income tax reference) are needed for the IT3(d) file. */
  s18a: { issues: boolean; sarsDetails: boolean };
  /** A donor journey is switched on. Null: couldn't be checked (not set up yet), so the step is left out. */
  journeyOn: boolean | null;
  updates: number;
  /** People on the team, the owner included. Null: couldn't be checked, so the step is left out. */
  teamSize: number | null;
};

/** What a role may do, as `can(role, permission)` from ./permissions (passed in so this stays pure). */
export type StartCan = (permission: "profile" | "message" | "bank_edit" | "owner") => boolean;

const OWNER = "Your charity's owner does this.";
const TEAM_PAGE_ROLES = "Your charity's owner, an admin or a fundraiser does this.";

export function gettingStarted(f: StartFacts, base: string, may: StartCan): StartItem[] {
  const c = f.charity;
  const items: StartItem[] = [
    {
      key: "payments",
      label: "Connected to receive online donations",
      why: "We do this for you once you're approved, so gifts go straight to your bank account.",
      done: Boolean(c.gateway_subaccount_ref),
      href: null,
      can: false,
      who: "Givezy does this for you.",
    },
    {
      key: "bank",
      label: "Bank details saved and checked",
      why: "Donations are paid into this account, so we check it is in your charity's name.",
      done: f.bank.saved && f.bank.checked,
      href: `${base}/application?step=bank`,
      can: may("bank_edit"),
      who: OWNER,
    },
    {
      key: "look",
      label: "Add your logo and a cover photo",
      why: "Donors recognise you faster, and your page looks like yours.",
      done: Boolean(c.logo_path && c.cover_path),
      href: `${base}/profile`,
      can: may("profile"),
      who: TEAM_PAGE_ROLES,
    },
    {
      key: "story",
      label: "Tell donors what you do and where gifts go",
      why: "People give more readily when they can see what a gift does.",
      done: Boolean(c.description_en?.trim() && c.funds_use_en?.trim()),
      href: `${base}/profile`,
      can: may("profile"),
      who: TEAM_PAGE_ROLES,
    },
    {
      key: "thanks",
      label: "Write your thank-you note",
      why: "It goes with every gift's confirmation, in your own words.",
      done: Boolean(c.thank_you_en?.trim()),
      href: `${base}/thank-donors#wording`,
      can: may("profile"),
      who: TEAM_PAGE_ROLES,
    },
  ];
  if (f.s18a.issues) {
    items.push({
      key: "sars",
      label: "Add your SARS details for s18A receipts",
      why: "Your income tax reference goes in the IT3(d) file you send SARS each year.",
      done: f.s18a.sarsDetails,
      href: `${base}/receipts/sars`,
      can: may("owner"),
      who: OWNER,
    });
  }
  if (f.journeyOn !== null) {
    items.push({
      key: "journey",
      label: "Switch on your donor journey",
      why: "A few short emails you write, sent to new donors over the first weeks, so they hear from you again.",
      done: f.journeyOn,
      href: `${base}/journey`,
      can: may("message"),
      who: TEAM_PAGE_ROLES,
    });
  }
  items.push({
    key: "update",
    label: "Post your first update",
    why: "A short note or photo shows donors their gifts are at work.",
    done: f.updates > 0,
    href: `${base}/updates`,
    can: may("profile"),
    who: TEAM_PAGE_ROLES,
  });
  if (f.teamSize !== null) {
    items.push({
      key: "team",
      label: "Give your team their own logins",
      why: "Each person gets the access their job needs, and you see who did what.",
      done: f.teamSize > 1,
      href: `${base}/team`,
      can: may("owner"),
      who: OWNER,
      optional: true,
    });
  }
  return items;
}

/** "3 of 7 done": optional steps don't count. */
export function startProgress(items: StartItem[]): { done: number; total: number; allSet: boolean } {
  const needed = items.filter((i) => !i.optional);
  const done = needed.filter((i) => i.done).length;
  return { done, total: needed.length, allSet: done === needed.length };
}
