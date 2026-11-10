/**
 * Who in a charity's team may do what (CRM step 9, approved by Yehuda 10/11/2026). One table, used by the
 * dashboard's pages, its server actions and its menu; the database holds the same table in
 * public.charity_can() (migration 20261110000009_team_roles.sql), so a role can't get round it by calling the
 * database directly. Pure and dependency-free.
 *
 * |                                        | Owner | Admin | Finance   | Fundraiser | Viewer |
 * | See dashboard, donors, gifts           |   ✓   |   ✓   |    ✓      |     ✓      | ✓ (no contact details) |
 * | Thank donors, journey, appeals, notes  |   ✓   |   ✓   |           |     ✓      |        |
 * | Edit profile, video, focus card        |   ✓   |   ✓   |           |     ✓      |        |
 * | Approve or decline s18A receipts       |   ✓   |   ✓   |    ✓      |            |        |
 * | Downloads (donors, gifts, IT3(d))      |   ✓   |   ✓   |    ✓      |            |        |
 * | Bank details, payouts                  |   ✓   |       | view only |            |        |
 * | Team members and roles                 |   ✓   |       |           |            |        |
 */

export const ROLES = ["owner", "admin", "finance", "fundraiser", "viewer"] as const;
export type Role = (typeof ROLES)[number];

/** The roles an owner can give someone (there is one owner; ownership isn't handed over here). */
export const ASSIGNABLE_ROLES: readonly Role[] = ["admin", "finance", "fundraiser", "viewer"];

export type Permission =
  /** See the dashboard, donors and gifts (everyone in the team). */
  | "view"
  /** See donors' email addresses, phone numbers and postal addresses. */
  | "contact"
  /** Thank donors, the donor journey, emails to donors (appeals and updates) and notes on donors. */
  | "message"
  /** The public profile, logo, cover, video, focus card, campaigns, photos and updates, thank-you wording. */
  | "profile"
  /** Approve, decline or correct s18A receipts. */
  | "receipts"
  /** Downloads: donors, gifts, the annual report, the IT3(d) file and its history. */
  | "export"
  /** Record gifts the charity received another way (EFT, cash) and remove them. */
  | "gifts"
  /** The application: organisation details, address and documents. */
  | "application"
  /** See the bank account and the payouts (deposits). */
  | "bank_view"
  /** Change the bank account. */
  | "bank_edit"
  /**
   * The owner's alone, as before roles (kept stricter than the table, see docs/decisions.md 10/11/2026): the team
   * and roles, the charity's own contact details, its SARS registration details, importing donor contacts, the
   * s18A details reminder email and adding existing donors to the journey.
   */
  | "owner";

const TABLE: Record<Permission, readonly Role[]> = {
  view: ROLES,
  contact: ["owner", "admin", "finance", "fundraiser"],
  message: ["owner", "admin", "fundraiser"],
  profile: ["owner", "admin", "fundraiser"],
  receipts: ["owner", "admin", "finance"],
  export: ["owner", "admin", "finance"],
  gifts: ["owner", "admin", "finance"],
  application: ["owner", "admin"],
  bank_view: ["owner", "finance"],
  bank_edit: ["owner"],
  owner: ["owner"],
};

export const PERMISSIONS = Object.keys(TABLE) as Permission[];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** May someone with this role do this? No role (not in the team) may do nothing. */
export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return TABLE[permission].includes(role);
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  finance: "Finance",
  fundraiser: "Fundraiser",
  viewer: "Viewer",
};

/** One line under each role on the Team page, so the owner knows what they're giving. */
export const ROLE_SUMMARY: Record<Role, string> = {
  owner: "Everything, including the team, roles and the bank account.",
  admin: "Everything except the team and the bank account.",
  finance: "s18A receipts, downloads, the bank account and payouts (view only). Can't email donors or change your page.",
  fundraiser: "Thanking and emailing donors, the donor journey and your public page. No receipts, downloads or bank details.",
  viewer: "Sees the dashboard, donors' names and totals. No contact details, and can't change anything.",
};

/** The plain refusal a server action returns when someone's role doesn't allow it. Nothing is changed. */
export function refusedFor(permission: Permission): string {
  switch (permission) {
    case "message":
      return "Your role doesn't include thanking or emailing donors. Nothing was changed. Ask your charity's owner if you need it.";
    case "profile":
      return "Your role doesn't include changing your charity's page. Nothing was changed. Ask your charity's owner if you need it.";
    case "receipts":
      return "Your role doesn't include s18A receipts. Nothing was changed. Ask your charity's owner if you need it.";
    case "export":
      return "Your role doesn't include downloads or the SARS files. Nothing was downloaded or changed. Ask your charity's owner if you need them.";
    case "gifts":
      return "Your role doesn't include recording gifts. Nothing was changed. Ask your charity's owner if you need it.";
    case "application":
      return "Your role doesn't include the application. Nothing was changed. Ask your charity's owner if you need it.";
    case "bank_view":
    case "bank_edit":
      return "Your role doesn't include the bank account. Nothing was changed. Ask your charity's owner if you need it.";
    case "contact":
      return "Your role doesn't include donors' contact details. Ask your charity's owner if you need them.";
    case "owner":
      return "Only your charity's owner can do this. Nothing was changed.";
    case "view":
      return "You don't have access to this charity's dashboard.";
  }
}

/** The menu's pages and what each needs; a page someone can't use isn't shown (the server refuses it anyway). */
export const PAGE_PERMISSION: Record<string, Permission> = {
  "/thank-donors": "message",
  "/journey": "message",
  "/email-donors": "message",
  "/profile": "profile",
  "/updates": "profile",
  "/application": "application",
  "/team": "view",
  "/activity": "view",
};

/**
 * What taking a dashboard action back needs: the same as doing it. Unknown kinds need the owner, the safe default.
 * (Kinds are the dashboard's ActionKind, src/lib/charity/done.ts.)
 */
export function permissionForAction(kind: string): Permission {
  switch (kind) {
    case "profile_saved":
    case "logo_changed":
    case "cover_changed":
    case "video_saved":
    case "video_removed":
    case "focus_saved":
    case "focus_removed":
    case "donation_emails_on":
    case "donation_emails_off":
    case "campaign_started":
    case "campaign_ended":
    case "update_posted":
    case "update_removed":
    case "photo_added":
    case "photo_removed":
    case "thank_you_wording_saved":
      return "profile";
    case "organisation_saved":
    case "address_saved":
    case "document_uploaded":
    case "document_removed":
    case "application_submitted":
      return "application";
    case "thank_you_sent":
    case "donor_thanked":
    case "appeal_sent":
    case "journey_saved":
    case "journey_on":
    case "journey_off":
      return "message";
    case "receipts_approved":
    case "certificate_approved":
    case "certificate_edited":
    case "certificate_declined":
    case "certificate_reopened":
      return "receipts";
    case "gift_recorded":
    case "gifts_imported":
    case "gifts_removed":
      return "gifts";
    case "bank_saved":
      return "bank_edit";
    default:
      // contact_saved, sars_details_saved, member_added, member_removed, role_changed, contacts_imported,
      // contacts_removed, s18a_reminders_sent, journey_existing_added, and anything new.
      return "owner";
  }
}
