/**
 * The charity's own focus (CRM build plan step 13): it shows from the first moment of its first day to the last
 * moment of its last day on the Johannesburg calendar, one at a time, and what the charity types is checked.
 */
import { describe, expect, it } from "vitest";
import { activeFocus, FOCUS_MAX_DAYS, focusCampaign, focusDay, focusDays, focusFrom, focusStatus, jhbToday, type FocusRow } from "@/lib/charity/focus";
import { checkFocus } from "@/lib/charity/focus-check";
import { isoDateInJhb } from "@/lib/dates";

const row = (o: Partial<FocusRow> = {}): FocusRow => ({ campaign_id: null, title: "Winter blankets", message: "Nights are cold. We're handing out 400 blankets this month.", starts_on: "2026-11-10", ends_on: "2026-11-30", ...o });

describe("Johannesburg dates", () => {
  it("the day changes at midnight in Johannesburg, two hours before midnight UTC", () => {
    expect(jhbToday(new Date("2026-11-09T21:59:59Z"))).toBe("2026-11-09");
    expect(jhbToday(new Date("2026-11-09T22:00:00Z"))).toBe("2026-11-10");
    expect(jhbToday(new Date("2026-12-31T22:00:00Z"))).toBe("2027-01-01");
    // The same answer as the website's own Johannesburg date, around the clock.
    for (const t of ["2026-11-09T21:59:59Z", "2026-11-09T22:00:00Z", "2026-11-10T00:30:00Z", "2026-11-10T12:00:00Z", "2026-02-28T22:00:00Z", "2026-07-01T21:59:59.999Z"]) {
      expect(jhbToday(new Date(t)), t).toBe(isoDateInJhb(new Date(t)));
    }
  });

  it("a focus starts showing at Johannesburg midnight on its first day", () => {
    expect(activeFocus(row(), jhbToday(new Date("2026-11-09T21:59:59Z")))).toBeNull();
    expect(activeFocus(row(), jhbToday(new Date("2026-11-09T22:00:00Z")))).toMatchObject({ title: "Winter blankets", startsOn: "2026-11-10", endsOn: "2026-11-30" });
  });

  it("and stops at Johannesburg midnight after its last day", () => {
    expect(activeFocus(row(), jhbToday(new Date("2026-11-30T21:59:59Z")))).not.toBeNull();
    expect(activeFocus(row(), jhbToday(new Date("2026-11-30T22:00:00Z")))).toBeNull();
  });

  it("says Scheduled, Showing now or Ended", () => {
    const f = { startsOn: "2026-11-10", endsOn: "2026-11-30" };
    expect(focusStatus(f, "2026-11-09")).toBe("scheduled");
    expect(focusStatus(f, "2026-11-10")).toBe("showing");
    expect(focusStatus(f, "2026-11-30")).toBe("showing");
    expect(focusStatus(f, "2026-12-01")).toBe("ended");
  });

  it("counts days with both ends, across months and a leap day", () => {
    expect(focusDays("2026-11-10", "2026-11-11")).toBe(2);
    expect(focusDays("2026-11-10", "2027-01-10")).toBe(62);
    expect(focusDays("2028-02-28", "2028-03-01")).toBe(3);
    expect(focusDay("2026-11-30")).toBe("30/11/2026");
  });
});

describe("a stored focus", () => {
  it("a row with anything missing or misshapen never reaches a page", () => {
    for (const bad of [null, undefined, {}, row({ title: "  " }), row({ message: "" }), row({ starts_on: "10/11/2026" }), row({ ends_on: "soon" }), { ...row(), title: 5 as never }]) {
      expect(focusFrom(bad as never), JSON.stringify(bad)).toBeNull();
    }
    expect(focusFrom(row({ campaign_id: "c-1" }))).toMatchObject({ campaignId: "c-1" });
  });

  it("the give button goes to the chosen campaign only while it is running", () => {
    const open = [{ id: "c-1", title: "Blankets" }, { id: "c-2", title: "Roof" }];
    expect(focusCampaign({ campaignId: "c-2" }, open)).toEqual({ id: "c-2", title: "Roof" });
    expect(focusCampaign({ campaignId: "ended-one" }, open)).toBeNull();
    expect(focusCampaign({ campaignId: null }, open)).toBeNull();
    expect(focusCampaign({ campaignId: "c-1" }, [])).toBeNull();
  });
});

describe("checking what the charity typed", () => {
  const today = "2026-11-10";
  const campaigns = [{ id: "11111111-1111-4111-8111-111111111111", title: "Winter blanket drive" }];
  const typed = (o: Record<string, string | undefined> = {}) => ({ title: "Winter blankets", message: "Nights are cold.", starts_on: "10/11/2026", ends_on: "30/11/2026", ...o });

  it("reads dates the South African way and keeps the words as typed", () => {
    expect(checkFocus(typed(), today, campaigns)).toEqual({ ok: true, value: { campaign_id: null, title: "Winter blankets", message: "Nights are cold.", starts_on: "2026-11-10", ends_on: "2026-11-30" } });
    // 05/03 is 5 March, never 3 May.
    expect(checkFocus(typed({ starts_on: "05/03/2027", ends_on: "06/03/2027" }), today, campaigns)).toMatchObject({ ok: true, value: { starts_on: "2027-03-05", ends_on: "2027-03-06" } });
  });

  it("a chosen campaign lends its name when the title is left empty, and must be one of the charity's running campaigns", () => {
    expect(checkFocus(typed({ title: undefined, campaign_id: campaigns[0].id }), today, campaigns)).toMatchObject({ ok: true, value: { campaign_id: campaigns[0].id, title: "Winter blanket drive" } });
    expect(checkFocus(typed({ campaign_id: campaigns[0].id }), today, campaigns)).toMatchObject({ ok: true, value: { title: "Winter blankets" } });
    const other = checkFocus(typed({ campaign_id: "22222222-2222-4222-8222-222222222222" }), today, campaigns);
    expect(other).toMatchObject({ ok: false, fieldErrors: { campaign_id: expect.stringContaining("isn't running") } });
  });

  it("the last day must be after the first, not already past, and within 62 days", () => {
    expect(checkFocus(typed({ ends_on: "10/11/2026" }), today, campaigns)).toMatchObject({ ok: false, fieldErrors: { ends_on: "The last day must be after the first day" } });
    expect(checkFocus(typed({ ends_on: "09/11/2026" }), today, campaigns)).toMatchObject({ ok: false, fieldErrors: { ends_on: "The last day must be after the first day" } });
    expect(checkFocus(typed({ starts_on: "01/10/2026", ends_on: "09/11/2026" }), today, campaigns)).toMatchObject({ ok: false, fieldErrors: { ends_on: expect.stringContaining("has passed") } });
    expect(FOCUS_MAX_DAYS).toBe(62);
    expect(checkFocus(typed({ ends_on: "10/01/2027" }), today, campaigns).ok).toBe(true);
    expect(checkFocus(typed({ ends_on: "11/01/2027" }), today, campaigns)).toMatchObject({ ok: false, fieldErrors: { ends_on: expect.stringContaining("up to 62 days") } });
    // One that started earlier and is still running can be edited.
    expect(checkFocus(typed({ starts_on: "01/11/2026", ends_on: "10/11/2026" }), today, campaigns).ok).toBe(true);
  });

  it("empty and silly input gets a plain message on each field, all at once", () => {
    const r = checkFocus({}, today, []);
    expect(r).toEqual({ ok: false, fieldErrors: { title: "Give it a short title, or choose a campaign", message: "Write a short message for donors", starts_on: "Enter the first day it shows", ends_on: "Enter the last day it shows" } });
    expect(checkFocus(typed({ starts_on: "31/02/2027", ends_on: "tomorrow" }), today, campaigns)).toMatchObject({ ok: false, fieldErrors: { starts_on: expect.stringContaining("dd/mm/yyyy"), ends_on: expect.stringContaining("dd/mm/yyyy") } });
    expect(checkFocus(typed({ title: "ab" }), today, campaigns)).toMatchObject({ ok: false, fieldErrors: { title: expect.stringContaining("at least 3") } });
    expect(checkFocus(typed({ title: "x".repeat(81) }), today, campaigns)).toMatchObject({ ok: false, fieldErrors: { title: expect.stringContaining("80 characters") } });
    expect(checkFocus(typed({ message: "x".repeat(200) }), today, campaigns).ok).toBe(true);
    expect(checkFocus(typed({ message: "x".repeat(201) }), today, campaigns)).toMatchObject({ ok: false, fieldErrors: { message: expect.stringContaining("200 characters") } });
    if (!r.ok) for (const m of Object.values(r.fieldErrors)) expect(m).not.toMatch(/!/);
  });
});
