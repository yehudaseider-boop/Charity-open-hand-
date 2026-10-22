import { z } from "zod";

const tooLong = (max: number) => `Please keep it to ${max.toLocaleString("en-ZA").replace(/[\s,]/g, " ")} characters or fewer`;
const optional = (max = 200) => z.string().max(max, tooLong(max)).optional();
const required = (label: string, max = 200) =>
  z
    .string({ error: (issue) => (issue.input === undefined ? `Enter the ${label.toLowerCase()}` : undefined) })
    .min(1, `Enter the ${label.toLowerCase()}`)
    .max(max, tooLong(max));

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
  postal_code: required("Postal code", 4).regex(/^\d{4}$/, "Postal code is 4 digits"),
});

export const contactSchema = z.object({
  contact_name: required("Contact person"),
  contact_email: z.email("Enter a valid email address"),
  contact_phone: z
    .string()
    .regex(/^(\+27|0)\d{9}$/, "Use a South African number, for example 082 123 4567")
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
  bank_account_number: required("Account number", 16).regex(/^\d{6,16}$/, "Account number is 6 to 16 digits, no spaces"),
  bank_branch_code: required("Branch code", 6).regex(/^\d{6}$/, "Branch code is 6 digits"),
});

export const profileSchema = z.object({
  name_en: required("Name", 120),
  description_en: optional(3000),
  funds_use_en: optional(1500),
  thank_you_en: optional(300),
  impact_en: optional(140),
  // "example.org.za" is how people type it: https:// is added for them.
  website: z
    .preprocess(
      (v) => (typeof v === "string" && v.trim() && !/^[a-z]+:\/\//i.test(v.trim()) ? `https://${v.trim()}` : v),
      z.url({ protocol: /^https?$/, error: "Enter your website address, for example example.org.za" }),
    )
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

// 4 MB: the hosting (Vercel) refuses any request over 4.5 MB before our code sees it, so the limit sits below that.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const DOCUMENT_MIME = ["application/pdf", "image/jpeg", "image/png"] as const;
export const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

/** Phone numbers typed with spaces: "082 123 4567" -> "0821234567". */
export function normalisePhone(v: string | undefined) {
  return v?.replace(/[\s()-]/g, "");
}

/** A short update from a charity, and a photo caption. */
export const updateSchema = z.object({ body_en: z.string({ error: (i) => (i.input === undefined ? "Write your update" : undefined) }).min(1, "Write your update").max(500, "Please keep it to 500 characters or fewer") });
export const photoSchema = z.object({ caption_en: optional(120) });
export const MAX_PHOTOS = 12;
