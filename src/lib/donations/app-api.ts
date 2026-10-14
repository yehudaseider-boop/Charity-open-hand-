import { z } from "zod";
import { checkoutSchema, cleanPhone, type CheckoutInput } from "./validation";

/**
 * What the phone app sends to start a gift, once-off or monthly. Money is whole cents; the app never sends
 * card details (the card is entered on the payment provider's own page). Yes/no answers are real
 * booleans here and become the checkout form's "on" before the shared rules run.
 */
const flag = z.boolean().optional();
const cents = z.number().int().min(0).max(100_000_000);

export const appQuoteSchema = z.object({
  slug: z.string().min(1).max(120),
  giftCents: cents,
  contributionCents: cents,
});

export const appCheckoutSchema = appQuoteSchema.extend({
  shownTotalCents: cents,
  details: z.object({
    donor_type: z.enum(["individual", "company", "trust"]),
    email: z.string().max(200),
    first_name: z.string().max(80).optional(),
    last_name: z.string().max(80).optional(),
    organisation_name: z.string().max(200).optional(),
    registration_number: z.string().max(40).optional(),
    contact_person: z.string().max(120).optional(),
    phone: z.string().max(20).optional(),
    wants_18a: flag,
    id_number: z.string().max(20).optional(),
    tax_reference: z.string().max(20).optional(),
    address_line1: z.string().max(200).optional(),
    address_line2: z.string().max(200).optional(),
    suburb: z.string().max(80).optional(),
    city: z.string().max(80).optional(),
    postal_code: z.string().max(4).optional(),
    message: z.string().max(500).optional(),
    giving_kind: z.string(),
    is_anonymous: flag,
    monthly: flag,
    monthly_authorised: flag,
    age_confirmed: flag,
    popia_consent: flag,
  }),
});
export type AppCheckoutBody = z.infer<typeof appCheckoutSchema>;

const FLAGS = ["wants_18a", "is_anonymous", "monthly", "monthly_authorised", "age_confirmed", "popia_consent"] as const;

/** Run the app's answers through the same rules as the website's checkout form. */
export function toCheckoutInput(details: AppCheckoutBody["details"]):
  | { ok: true; input: CheckoutInput }
  | { ok: false; fieldErrors: Record<string, string> } {
  const raw: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(details)) {
    if (typeof v === "string") raw[k] = v.trim() === "" ? undefined : v.trim();
  }
  for (const f of FLAGS) if (details[f] === true) raw[f] = "on";
  raw.phone = cleanPhone(raw.phone);
  const parsed = checkoutSchema.safeParse(raw);
  if (parsed.success) return { ok: true, input: parsed.data };
  const fieldErrors: Record<string, string> = {};
  for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
  return { ok: false, fieldErrors };
}

/** Off unless APP_GIVING=yes on the server: the in-app payment API stays closed in production until we choose. */
export const appGivingOpen = (env: Record<string, string | undefined> = process.env) => env.APP_GIVING === "yes";
