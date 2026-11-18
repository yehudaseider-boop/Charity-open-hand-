/**
 * What a person checks before a charity is approved (18/11/2026). Money goes straight to the charity, so a charity
 * that isn't real is real money gone. Approving needs every check ticked, and a note of who at the organisation was
 * spoken to and when; both are kept in the audit trail. Kept dependency-free (shared by the form, the server action
 * and the tests). The written procedure, and what to do if a charity turns out not to be real, is
 * `docs/charity-approval-checklist.md`.
 */
export const vettingChecks = [
  {
    key: "register",
    label: "Registration: the NPO number (and the PBO number, if one is given) is on the public register, and the registered name there matches the name on the application.",
  },
  {
    key: "documents",
    label: "Documents: every uploaded document opens, is current, and is for this organisation (not another with a similar name).",
  },
  {
    key: "bank_letter",
    label: "Bank: the bank confirmation letter shows the same name as the registered name, and its account number matches the one entered.",
  },
  {
    key: "person",
    label: "A person: I spoke to a named person at the organisation, on a phone number or email found independently, not only the one on the application.",
  },
  {
    key: "online",
    label: "Real and active: its website or social pages (or a reference) show an organisation that matches the application.",
  },
] as const;

export type VettingKey = (typeof vettingChecks)[number]["key"];

/** The form field for one check. */
export const vettingField = (key: VettingKey) => `vet_${key}`;
export const SPOKE_TO_FIELD = "vet_spoke_to";
export const SPOKE_TO_MIN = 5;
export const SPOKE_TO_MAX = 300;

export type VettingResult = { ok: true; ticked: VettingKey[]; spokeTo: string } | { ok: false; message: string };

/** Reads the checks from the approval form: all of them ticked, and a note of who was spoken to. */
export function readVetting(formData: FormData): VettingResult {
  const missing = vettingChecks.filter((c) => formData.get(vettingField(c.key)) !== "on");
  if (missing.length) {
    return { ok: false, message: `Tick every check before approving. Still to tick: ${missing.map((c) => c.label.split(":")[0].toLowerCase()).join(", ")}.` };
  }
  const spokeTo = String(formData.get(SPOKE_TO_FIELD) ?? "").replace(/\s+/g, " ").trim();
  if (spokeTo.length < SPOKE_TO_MIN) {
    return { ok: false, message: "Write who you spoke to at the organisation and when (at least 5 characters)." };
  }
  return { ok: true, ticked: vettingChecks.map((c) => c.key), spokeTo: spokeTo.slice(0, SPOKE_TO_MAX) };
}
