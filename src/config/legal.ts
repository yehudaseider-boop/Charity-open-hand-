/**
 * Legal details shown in the Privacy Policy, Terms and footer. The ONLY place
 * they are set. Empty values show as "[to be confirmed]" and the pages carry a
 * draft notice until `reviewedByLegal` is true. Never fill these in by guess:
 * Yehuda supplies them, Yosef signs off the wording.
 */
import { POLICY_VERSION } from "@/lib/policy";

export const legalConfig = {
  /** Registered company name, e.g. "... (Pty) Ltd". */
  companyName: null as string | null,
  /** CIPC registration number. */
  registrationNumber: null as string | null,
  /** Registered address. */
  address: null as string | null,
  /** POPIA Information Officer: name and contact email. */
  informationOfficer: { name: null as string | null, email: null as string | null },
  /** Where people send privacy requests and complaints. */
  privacyEmail: null as string | null,

  /** Version of the Terms and Privacy Policy (set in src/lib/policy.ts, shared with the app). */
  policyVersion: POLICY_VERSION,

  /** Set to true only once Yosef has approved the wording. */
  reviewedByLegal: false,
} as const;

export const TBC = "[to be confirmed]";
export const show = (v: string | null | undefined) => v || TBC;
