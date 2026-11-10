/**
 * Team roles (CRM step 9, approved 10/11/2026): the permission table, what taking an action back needs, and the
 * activity's plain sentences. The database's copy of the table is checked in team-roles-db.test.ts.
 */
import { describe, expect, it } from "vitest";
import { ASSIGNABLE_ROLES, PAGE_PERMISSION, PERMISSIONS, ROLES, ROLE_LABEL, ROLE_SUMMARY, can, isRole, permissionForAction, refusedFor, type Permission, type Role } from "@/lib/charity/permissions";
import { activityLines, actionPhrase, displayName, sentence, shortName } from "@/lib/charity/activity";

/** The table as approved, row by row. */
const APPROVED: Record<string, Role[]> = {
  "See dashboard, donors, gifts": ["owner", "admin", "finance", "fundraiser", "viewer"],
  "Thank donors, journey, appeals, notes": ["owner", "admin", "fundraiser"],
  "Edit profile, video, focus card": ["owner", "admin", "fundraiser"],
  "Approve or decline s18A receipts": ["owner", "admin", "finance"],
  "Downloads (donors, gifts, IT3(d))": ["owner", "admin", "finance"],
  "Bank details, payouts (see)": ["owner", "finance"],
  "Bank details (change)": ["owner"],
  "Team members and roles": ["owner"],
};
const ROW_PERMISSION: Record<string, Permission> = {
  "See dashboard, donors, gifts": "view",
  "Thank donors, journey, appeals, notes": "message",
  "Edit profile, video, focus card": "profile",
  "Approve or decline s18A receipts": "receipts",
  "Downloads (donors, gifts, IT3(d))": "export",
  "Bank details, payouts (see)": "bank_view",
  "Bank details (change)": "bank_edit",
  "Team members and roles": "owner",
};

describe("the permission table", () => {
  it("matches every row of the approved table for every role", () => {
    for (const [row, allowed] of Object.entries(APPROVED)) {
      for (const r of ROLES) expect([row, r, can(r, ROW_PERMISSION[row])]).toEqual([row, r, allowed.includes(r)]);
    }
  });

  it("a viewer sees names and totals but no contact details", () => {
    expect(can("viewer", "view")).toBe(true);
    expect(can("viewer", "contact")).toBe(false);
    for (const r of ["owner", "admin", "finance", "fundraiser"] as Role[]) expect(can(r, "contact")).toBe(true);
  });

  it("someone outside the team, or an unknown role, may do nothing", () => {
    for (const p of PERMISSIONS) {
      expect(can(null, p)).toBe(false);
      expect(can(undefined, p)).toBe(false);
    }
    expect(isRole("superuser")).toBe(false);
    expect(isRole("Owner")).toBe(false);
    expect(isRole("finance")).toBe(true);
  });

  it("the owner can do everything; an owner role is never handed out", () => {
    for (const p of PERMISSIONS) expect(can("owner", p)).toBe(true);
    expect(ASSIGNABLE_ROLES).not.toContain("owner");
  });

  it("every role has a label and a summary, and every refusal says nothing was changed or asks the owner", () => {
    for (const r of ROLES) {
      expect(ROLE_LABEL[r]).toMatch(/^[A-Z]/);
      expect(ROLE_SUMMARY[r].length).toBeGreaterThan(10);
    }
    for (const p of PERMISSIONS) {
      const text = refusedFor(p);
      expect(text).not.toMatch(/!|—/);
      if (p !== "view") expect(text).toMatch(/Nothing was|Ask your charity's owner/);
    }
  });

  it("the menu hides pages by the same table", () => {
    expect(can("viewer", PAGE_PERMISSION["/thank-donors"])).toBe(false);
    expect(can("finance", PAGE_PERMISSION["/journey"])).toBe(false);
    expect(can("fundraiser", PAGE_PERMISSION["/profile"])).toBe(true);
    expect(can("fundraiser", PAGE_PERMISSION["/application"])).toBe(false);
    expect(can("viewer", PAGE_PERMISSION["/team"])).toBe(true);
  });
});

describe("taking an action back needs what doing it needed", () => {
  it("maps each kind of action to its permission", () => {
    expect(permissionForAction("profile_saved")).toBe("profile");
    expect(permissionForAction("focus_removed")).toBe("profile");
    expect(permissionForAction("journey_on")).toBe("message");
    expect(permissionForAction("certificate_edited")).toBe("receipts");
    expect(permissionForAction("gifts_imported")).toBe("gifts");
    expect(permissionForAction("bank_saved")).toBe("bank_edit");
    expect(permissionForAction("organisation_saved")).toBe("application");
  });

  it("keeps the owner-only actions the owner's, and an unknown kind too", () => {
    for (const k of ["member_added", "member_removed", "role_changed", "contact_saved", "sars_details_saved", "contacts_imported", "journey_existing_added", "s18a_reminders_sent", "something_new"]) {
      expect([k, permissionForAction(k)]).toEqual([k, "owner"]);
    }
  });
});

describe("the activity, in plain words", () => {
  it("shortens a donor's name to a first name and an initial", () => {
    expect(shortName("Thandi Mokoena")).toBe("Thandi M.");
    expect(shortName("  Ahmed  van der Merwe ")).toBe("Ahmed M.");
    expect(shortName("Sipho")).toBe("Sipho");
    expect(shortName("")).toBe("a donor");
    expect(shortName(null)).toBe("a donor");
  });

  it("writes Yossi's example sentence", () => {
    expect(sentence("Sarah", actionPhrase("certificate_approved", { name: "Thandi Mokoena" }), "2027-03-03T09:00:00+02:00")).toBe("Sarah approved the s18A receipt for Thandi M. on 03/03/2027.");
  });

  it("says when something was taken back, and covers role changes and downloads", () => {
    const lines = activityLines(
      [
        { kind: "journey_on", details: {}, userId: "u1", at: "2026-11-10T08:00:00Z", undoneAt: "2026-11-10T08:05:00Z" },
        { kind: "role_changed", details: { email: "sam@c.org", from: "admin", to: "viewer" }, userId: "u1", at: "2026-11-09T08:00:00Z", undoneAt: null },
      ],
      [
        { action: "charity.it3d_file_downloaded", details: {}, userId: "u2", at: "2026-11-11T08:00:00Z" },
        { action: "charity.something_internal", details: {}, userId: "u2", at: "2026-11-12T08:00:00Z" },
      ],
      (id) => (id === "u1" ? "Lerato" : id === "u2" ? "Sam" : "Someone"),
    );
    expect(lines.map((l) => l.text)).toEqual([
      "Sam downloaded the SARS IT3(d) data file on 11/11/2026.",
      "Lerato switched on the donor journey on 10/11/2026, then took it back.",
      "Lerato made sam@c.org a viewer (was an admin) on 09/11/2026.",
    ]);
  });

  it("names a team member by name, then email, then 'Someone'", () => {
    expect(displayName({ full_name: " Sarah Jacobs ", email: "s@c.org" })).toBe("Sarah Jacobs");
    expect(displayName({ full_name: null, email: "s@c.org" })).toBe("s@c.org");
    expect(displayName(undefined)).toBe("Someone");
  });

  it("gives an unknown action a neutral line and caps the list", () => {
    expect(actionPhrase("brand_new_kind", {})).toBe("made a change");
    const many = Array.from({ length: 150 }, (_, i) => ({ kind: "profile_saved", details: {}, userId: null, at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(), undoneAt: null }));
    expect(activityLines(many, [], () => "Someone", 100)).toHaveLength(100);
  });
});
