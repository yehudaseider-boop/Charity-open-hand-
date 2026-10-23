/** Donor care: notes, follow-ups, tags, saved lists and the charity's own lapsed period. */
import { describe, expect, it } from "vitest";
import { checkLapsedDays, checkNote, checkReminder, checkSegment, checkTagName, sortReminders } from "@/lib/charity/donor-care-rules";
import { countDonorGroups, donorGroup, donorGroupsFor, lapsedPeriodText } from "@/lib/charity/insights";

const today = "2026-10-21";

describe("notes", () => {
  it("keeps line breaks, strips hidden characters, refuses empty or too long", () => {
    expect(checkNote("  Met at the gala.\r\n\r\n\r\n\r\nWants updates ‮about the roof. ")).toEqual({ ok: true, value: "Met at the gala.\n\nWants updates about the roof." });
    expect(checkNote("   ")).toEqual({ ok: false, error: "Write the note first" });
    expect(checkNote("x".repeat(2001))).toMatchObject({ ok: false, error: expect.stringMatching(/2 000 characters/) });
  });
});

describe("follow-ups", () => {
  it("need what and when: today up to two years ahead", () => {
    expect(checkReminder("Phone to say thanks", "2026-10-21", today)).toEqual({ ok: true, what: "Phone to say thanks", dueOn: "2026-10-21" });
    expect(checkReminder("", "2026-10-20", today)).toEqual({ ok: false, errors: { what: expect.any(String), due_on: "Choose today or a later date" } });
    expect(checkReminder("x", "2028-10-22", today)).toMatchObject({ ok: false, errors: { due_on: expect.stringMatching(/two years/) } });
    expect(checkReminder("x", "2026-02-30", today)).toMatchObject({ ok: false, errors: { due_on: expect.stringContaining("dd/mm/yyyy") } });
    expect(checkReminder("x", "", today)).toMatchObject({ ok: false, errors: { due_on: "Enter a date" } });
    // Typed the South African way, as the field asks.
    expect(checkReminder("x", "21/10/2026", today)).toEqual({ ok: true, what: "x", dueOn: "2026-10-21" });
  });
  it("sort by date, overdue first", () => {
    expect(sortReminders([{ due_on: "2026-11-01" }, { due_on: "2026-10-01" }]).map((r) => r.due_on)).toEqual(["2026-10-01", "2026-11-01"]);
  });
});

describe("tags and saved lists", () => {
  it("tag names: one line, 1 to 40 characters", () => {
    expect(checkTagName(" Board\nmember ")).toEqual({ ok: true, value: "Board member" });
    expect(checkTagName("")).toMatchObject({ ok: false });
    expect(checkTagName("x".repeat(41))).toMatchObject({ ok: false });
  });
  it("a saved list keeps only a real group, one of the charity's own tags and a search, and needs at least one", () => {
    const tags = new Set(["t1"]);
    expect(checkSegment("Lapsed board", { group: "lapsed", tag: "t1", q: " cohen " }, tags)).toEqual({ ok: true, value: { name: "Lapsed board", filters: { group: "lapsed", tag: "t1", q: "cohen" } } });
    // Another charity's tag or a made-up group is dropped, so nothing is left to save.
    expect(checkSegment("Sneaky", { group: "vip", tag: "other-charity-tag" }, tags)).toMatchObject({ ok: false, error: expect.stringMatching(/nothing to save/) });
    expect(checkSegment("", { group: "new" }, tags)).toMatchObject({ ok: false });
  });
});

describe("the lapsed period", () => {
  it("is the charity's choice, 30 to 730 days", () => {
    expect(checkLapsedDays("90")).toEqual({ ok: true, value: 90 });
    for (const bad of ["29", "731", "", "6 months", "90.5", "-90"]) expect(checkLapsedDays(bad)).toMatchObject({ ok: false });
  });
  it("changes who counts as lapsed, and the words for it", () => {
    const now = new Date("2026-10-21T10:00:00Z");
    const d = { donation_count: 3, first_paid_at: "2025-01-01T10:00:00Z", last_paid_at: "2026-06-01T10:00:00Z" }; // 142 days ago
    expect(donorGroup(d, now)).toBe("repeat");
    expect(donorGroup(d, now, 90)).toBe("lapsed");
    expect(countDonorGroups([d], now, 90).lapsed).toBe(1);
    expect(lapsedPeriodText(180)).toBe("6 months");
    expect(lapsedPeriodText(365)).toBe("year");
    expect(lapsedPeriodText(45)).toBe("45 days");
    expect(donorGroupsFor(90).find((g) => g.key === "lapsed")?.hint).toBe("Nothing in the last 3 months");
  });
});
