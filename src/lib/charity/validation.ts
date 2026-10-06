import { z } from "zod";

const optional = (max = 200) => z.string().max(max).optional();
const required = (label: string, max = 200) =>
  z.string({ error: `${label} is required` }).min(1, `${label} is required`).max(max);

/** Hebrew fields must contain Hebrew letters (stops English pasted in by mistake). */
const hebrew = (max = 200) =>
  z
    .string()
    .max(max)
    .refine((v) => /[֐-׿]/.test(v), "Use Hebrew letters here, or leave it empty")
    .optional();

export const organisationSchema = z
  .object({
    name_en: required("Display name", 120),
    name_he: hebrew(120),
    legal_name_en: required("Registered legal name", 200),
    legal_name_he: hebrew(200),
    npo_number: optional(40),
    pbo_number: optional(40),
    s18a_reference: optional(40),
  })
  .refine((v) => v.npo_number || v.pbo_number, {
    message: "Enter an NPO number or a PBO reference number",
    path: ["npo_number"],
  })
  .refine((v) => !v.s18a_reference || v.pbo_number, {
    message: "An s18A-approved organisation must have a PBO reference number",
    path: ["pbo_number"],
  });

export const addressSchema = z.object({
  address_line1: required("Street address"),
  address_line2: optional(),
  suburb: optional(80),
  city: required("City", 80),
  postal_code: z.string().regex(/^\d{4}$/, "Postal code is 4 digits"),
});

export const contactSchema = z.object({
  contact_name: required("Contact person"),
  contact_email: z.email("Enter a valid email address"),
  contact_phone: z
    .string()
    .regex(/^(\+27|0)\d{9}$/, "Use a South African number, e.g. 082 123 4567")
    .optional()
    .transform((v) => v),
});

export const bankNames = [
  "Absa",
  "African Bank",
  "Capitec",
  "Discovery Bank",
  "FNB",
  "Investec",
  "Nedbank",
  "Standard Bank",
  "TymeBank",
  "Other",
] as const;

export const bankSchema = z.object({
  bank_name: z.enum(bankNames, { error: "Choose your bank" }),
  bank_account_holder: required("Account holder name"),
  bank_account_number: z.string().regex(/^\d{6,16}$/, "Account number is 6 to 16 digits, no spaces"),
  bank_branch_code: z.string().regex(/^\d{6}$/, "Branch code is 6 digits"),
});

export const profileSchema = z.object({
  name_en: required("Display name", 120),
  name_he: hebrew(120),
  description_en: optional(3000),
  description_he: z
    .string()
    .max(3000)
    .refine((v) => /[֐-׿]/.test(v), "Use Hebrew letters here, or leave it empty")
    .optional(),
  website: z
    .url({ protocol: /^https?$/, error: "Enter a full web address, starting with https://" })
    .optional(),
});

export const documentTypes = {
  npo_certificate: "NPO registration certificate",
  pbo_approval: "PBO approval letter (SARS)",
  s18a_approval: "s18A approval (SARS)",
  bank_confirmation: "Bank confirmation letter",
  receipting_mandate: "Signed receipting mandate",
  other: "Other supporting document",
} as const;
export type DocumentType = keyof typeof documentTypes;

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const DOCUMENT_MIME = ["application/pdf", "image/jpeg", "image/png"] as const;
export const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

/** Phone numbers typed with spaces: "082 123 4567" -> "0821234567". */
export function normalisePhone(v: string | undefined) {
  return v?.replace(/[\s()-]/g, "");
}
