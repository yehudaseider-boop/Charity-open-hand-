/** The dashboard's core flow: what just happened, taking it back, what to do next. */
import { describe, expect, it } from "vitest";
import { ASK_FIRST, canUndo, describeDone, describeUndone, minutesLeft, UNDO_MINUTES, type ActionKind } from "@/lib/charity/done";

const ALL: ActionKind[] = [
  "profile_saved", "logo_changed", "cover_changed", "donation_emails_on", "donation_emails_off", "campaign_started", "campaign_ended",
  "update_posted", "update_removed", "photo_added", "photo_removed", "organisation_saved", "address_saved", "contact_saved", "bank_saved",
  "document_uploaded", "document_removed", "application_submitted", "thank_you_sent", "donor_thanked", "receipts_approved", "gift_recorded", "gifts_imported", "gifts_removed", "member_added", "member_removed", "appeal_sent",
];
const ctx = { base: "/charity-admin/c1", publicUrl: "/c/meals", approved: true };

describe("what just happened, and what next", () => {
  it("every action says what happened in a sentence, and offers one next step on the dashboard or the public page", () => {
    for (const kind of ALL) {
      const d = describeDone(kind, { title: "Winter food parcels", fileName: "letter.pdf", label: "Bank confirmation letter", last4: "1234", month: "October 2026", sent: 18 }, ctx);
      expect(d.what.length, kind).toBeGreaterThan(10);
      expect(d.what, kind).toMatch(/[.]$/);
      expect(d.what, kind).not.toMatch(/!/);
      expect(d.next, kind).not.toBeNull();
      expect(d.next!.href.startsWith("/charity-admin/c1") || d.next!.href === "/c/meals", kind).toBe(true);
    }
  });

  it("names the thing that changed", () => {
    expect(describeDone("campaign_started", { title: "Winter food parcels" }, ctx).what).toBe('"Winter food parcels" is live. Donors can give to it now.');
    expect(describeDone("thank_you_sent", { month: "October 2026", sent: 18, failed: 1 }, ctx).what).toBe("Your thank-you for October 2026 went to 18 donors. 1 email could not be sent.");
    expect(describeDone("bank_saved", { last4: "1234" }, ctx).what).toContain("ending 1234");
  });

  it("before approval, says when donors will see it, and doesn't link to a page that isn't public yet", () => {
    const early = { ...ctx, approved: false };
    expect(describeDone("campaign_started", { title: "Roof" }, early).what).toContain("once your application is approved");
    expect(describeDone("profile_saved", {}, early).next!.href).toBe("/charity-admin/c1/updates");
    expect(describeDone("profile_saved", {}, ctx).next!.href).toBe("/c/meals");
  });

  it("registration steps lead on to the next step", () => {
    expect(describeDone("organisation_saved", {}, ctx).next!.href).toBe("/charity-admin/c1/application?step=address");
    expect(describeDone("bank_saved", {}, ctx).next!.href).toBe("/charity-admin/c1/application?step=documents");
  });

  it("after Undo, every action says what is back; the ones that can't be taken back say so", () => {
    for (const kind of ALL) expect(describeUndone(kind, { title: "Roof" }).length, kind).toBeGreaterThan(10);
    expect(ASK_FIRST).toEqual(["application_submitted", "thank_you_sent", "donor_thanked", "gifts_removed", "member_removed", "appeal_sent"]);
    for (const kind of ASK_FIRST) expect(describeUndone(kind, {})).toBe("This can't be taken back.");
  });
});

describe("taking it back", () => {
  const at = (min: number) => new Date(Date.parse("2026-10-18T10:00:00Z") + min * 60_000);
  const row = { undo: { type: "delete" }, undone_at: null, created_at: "2026-10-18T10:00:00Z" };

  it(`is offered for ${UNDO_MINUTES} minutes, once, and only when the action stored what it needs`, () => {
    expect(canUndo(row, at(1))).toBe(true);
    expect(canUndo(row, at(UNDO_MINUTES))).toBe(true);
    expect(canUndo(row, at(UNDO_MINUTES + 1))).toBe(false);
    expect(canUndo({ ...row, undone_at: "2026-10-18T10:05:00Z" }, at(6))).toBe(false);
    expect(canUndo({ ...row, undo: null }, at(1))).toBe(false);
  });

  it("counts down the minutes left, rounding up", () => {
    expect(minutesLeft(row.created_at, at(0))).toBe(30);
    expect(minutesLeft(row.created_at, at(29.5))).toBe(1);
    expect(minutesLeft(row.created_at, at(31))).toBe(0);
  });
});
