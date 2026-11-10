/**
 * The donor journey's rules (CRM step 6a, 10/11/2026): what the editor accepts, when each email is due, how the
 * one-a-week limit moves a step to the next week, who joins, and the email itself.
 */
import { describe, expect, it } from "vitest";
import {
  BODY_MAX,
  JOURNEY_MAX_STEPS,
  STARTER_STEPS,
  afterSend,
  charityPageUrl,
  checkJourneySteps,
  claimNote,
  decideDue,
  existingOutcome,
  firstDue,
  journeyCounts,
  journeyEmail,
  newJoiners,
  nextWeekStart,
  planExisting,
  enrolmentLabel,
} from "@/lib/charity/journey";
import { describeDone, describeUndone, isActionKind, pageOf } from "@/lib/charity/done";
import { textEmailHtml } from "@/lib/email/html";

const step = (over: Record<string, unknown> = {}) => ({ subject: "Welcome", body: "Thank you for giving to us.", waitDays: "2", ...over });

describe("what the journey editor accepts", () => {
  it("one to five emails, cleaned", () => {
    const r = checkJourneySteps([step({ subject: "  Welcome \n and thanks ", body: "Thank you.\r\n\r\n\r\n\r\nWe mean it.  " }), step({ waitDays: "30" })]);
    expect(r).toEqual({
      ok: true,
      steps: [
        { subject: "Welcome and thanks", body: "Thank you.\n\nWe mean it.", waitDays: 2 },
        { subject: "Welcome", body: "Thank you for giving to us.", waitDays: 30 },
      ],
    });
    expect(checkJourneySteps([])).toMatchObject({ ok: false, message: expect.stringContaining("at least one") });
    expect(checkJourneySteps(Array.from({ length: JOURNEY_MAX_STEPS + 1 }, () => step({ waitDays: "7" })))).toMatchObject({ ok: false, message: expect.stringContaining("at most 5") });
  });

  it("the first email 0 to 30 days after joining, each next 7 to 180 days after the one before", () => {
    expect(checkJourneySteps([step({ waitDays: "0" })]).ok).toBe(true);
    expect(checkJourneySteps([step({ waitDays: "31" })])).toMatchObject({ ok: false, errors: [{ waitDays: "Choose 0 to 30 days after they join." }] });
    expect(checkJourneySteps([step(), step({ waitDays: "6" })])).toMatchObject({ ok: false, errors: [{}, { waitDays: "Choose 7 to 180 days after the email before." }] });
    expect(checkJourneySteps([step(), step({ waitDays: "181" })]).ok).toBe(false);
    expect(checkJourneySteps([step(), step({ waitDays: "180" })]).ok).toBe(true);
    for (const silly of ["", "-1", "2.5", "two", "1e2", null, undefined]) expect(checkJourneySteps([step({ waitDays: silly })]).ok).toBe(false);
  });

  it("refuses an empty or too long subject or body, and says which email", () => {
    const r = checkJourneySteps([step(), step({ subject: "  ", waitDays: "7" }), step({ body: "x".repeat(BODY_MAX + 1), waitDays: "7" })]);
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining("Emails 2, 3 need a change") });
    if (r.ok) throw new Error("expected a refusal");
    expect(r.errors[1].subject).toBe("Give this email a subject.");
    expect(r.errors[2].body).toContain(`${BODY_MAX} characters`);
    expect(checkJourneySteps([step({ body: "Hi" })]).ok).toBe(false);
    expect(checkJourneySteps([step({ subject: "x".repeat(121) })]).ok).toBe(false);
  });

  it("no web addresses, however typed (the thank-you note's rule); an email address is fine", () => {
    for (const body of ["See https://evil.example now", "Visit www.ourcharity.org", "Go to ourcharity.org.za/give", "Click bit.ly/abc"]) {
      expect(checkJourneySteps([step({ body })])).toMatchObject({ ok: false, errors: [{ body: expect.stringContaining("web addresses") }] });
    }
    expect(checkJourneySteps([step({ subject: "Read ourcharity.co.za" })])).toMatchObject({ ok: false, errors: [{ subject: expect.stringContaining("web addresses") }] });
    expect(checkJourneySteps([step({ body: "Write to info@ourcharity.org.za any time." })]).ok).toBe(true);
  });

  it("the starter wording passes the same rules, with no exclamation marks or em dashes", () => {
    const r = checkJourneySteps(STARTER_STEPS.map((s) => ({ ...s, waitDays: String(s.waitDays) })));
    expect(r.ok).toBe(true);
    for (const s of STARTER_STEPS) expect(`${s.subject} ${s.body}`).not.toMatch(/[!—]/);
  });
});

describe("when each email is due", () => {
  const steps = [{ waitDays: 2 }, { waitDays: 21 }, { waitDays: 45 }];
  it("the first is its wait after joining; each next is its wait after the one before went; none after the last", () => {
    const joined = new Date("2026-11-10T08:00:00Z");
    expect(firstDue(joined, steps).toISOString()).toBe("2026-11-12T08:00:00.000Z");
    expect(afterSend(1, new Date("2026-11-12T06:30:00Z"), steps)).toEqual({ nextStep: 2, due: new Date("2026-12-03T06:30:00Z") });
    expect(afterSend(2, new Date("2026-12-03T06:30:00Z"), steps)?.nextStep).toBe(3);
    expect(afterSend(3, new Date("2027-01-17T06:30:00Z"), steps)).toBeNull();
  });

  it("a week already used waits until Monday 00:00 in Johannesburg", () => {
    // Tuesday 10/11/2026 -> Monday 16/11/2026, midnight SAST.
    expect(nextWeekStart(new Date("2026-11-10T06:15:00Z")).toISOString()).toBe("2026-11-15T22:00:00.000Z");
    // Sunday 23:30 SAST is still that week: the next Monday is half an hour away.
    expect(nextWeekStart(new Date("2026-11-15T21:30:00Z")).toISOString()).toBe("2026-11-15T22:00:00.000Z");
    // Monday 00:30 SAST: a week later.
    expect(nextWeekStart(new Date("2026-11-15T22:30:00Z")).toISOString()).toBe("2026-11-22T22:00:00.000Z");
  });
});

describe("what happens to a donor whose email is due", () => {
  const ok = { hasGift: true, erased: false, email: "a@example.com", optedOut: false, messagedThisWeek: false, nextStep: 2 };
  it("sends, waits a week, finishes or stops, in that order of care", () => {
    expect(decideDue(ok, 3)).toEqual({ kind: "send" });
    expect(decideDue({ ...ok, messagedThisWeek: true }, 3)).toEqual({ kind: "wait_week" });
    expect(decideDue({ ...ok, nextStep: 4 }, 3)).toEqual({ kind: "finish" });
    expect(decideDue({ ...ok, optedOut: true, messagedThisWeek: true }, 3)).toEqual({ kind: "stop", reason: "opted_out" });
    expect(decideDue({ ...ok, email: null }, 3)).toEqual({ kind: "stop", reason: "no_email" });
    expect(decideDue({ ...ok, hasGift: false }, 3)).toEqual({ kind: "stop", reason: "no_gift" });
    expect(decideDue({ ...ok, erased: true, hasGift: false, email: null }, 3)).toEqual({ kind: "stop", reason: "erased" });
  });
});

describe("who joins", () => {
  it("new donors: first gift at or after the switch, not already on it, oldest first", () => {
    const on = new Date("2026-11-10T08:00:00Z");
    const first = new Map([
      ["b", new Date("2026-11-11T09:00:00Z")],
      ["a", new Date("2026-11-10T08:00:00Z")],
      ["before", new Date("2026-11-10T07:59:59Z")],
      ["in", new Date("2026-11-12T09:00:00Z")],
    ]);
    expect(newJoiners(first, on, new Set(["in"])).map((n) => n.donorId)).toEqual(["a", "b"]);
  });

  it("existing donors: never twice, never erased, opted out or without an address on Givezy", () => {
    const base = { already: false, erased: false, email: "x@example.com", optedOut: false };
    const plan = planExisting([
      { donorId: "1", ...base },
      { donorId: "2", ...base, already: true },
      { donorId: "3", ...base, erased: true, email: null },
      { donorId: "4", ...base, optedOut: true },
      { donorId: "5", ...base, email: null },
    ]);
    expect(plan.add.map((c) => c.donorId)).toEqual(["1"]);
    expect(plan.skipped).toEqual({ already: 1, erased: 1, opted_out: 1, recorded_only: 1 });
    expect(existingOutcome({ added: 1, skipped: plan.skipped, firstEmail: "12/11/2026" })).toBe(
      "1 donor is on your journey now. Their first email goes from 12/11/2026, never more than one message from you a week. 4 aren't added: 1 already on your journey; 1 had their details erased at their request; 1 turned off emails from you; 1 have only gifts you recorded yourself, so Givezy can't email them.",
    );
    expect(existingOutcome({ added: 0, skipped: {}, firstEmail: null })).toBe("Nobody new was added.");
  });
});

describe("the page's counts and labels", () => {
  it("counts each person once, and someone past a shortened journey has had every email", () => {
    const c = journeyCounts(
      [
        { status: "active", next_step: 1 },
        { status: "active", next_step: 2 },
        { status: "active", next_step: 2 },
        { status: "active", next_step: 4 },
        { status: "finished", next_step: 4 },
        { status: "stopped", next_step: 1 },
      ],
      3,
    );
    expect(c).toEqual({ waiting: [1, 2, 0], finished: 2, stopped: 1, total: 6 });
    expect(journeyCounts([], 0)).toEqual({ waiting: [0], finished: 0, stopped: 0, total: 0 });
  });

  it("labels each person in plain words with a dd/mm/yyyy date", () => {
    const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { timeZone: "Africa/Johannesburg" });
    expect(enrolmentLabel({ status: "active", next_step: 2, next_due_at: "2026-12-03T06:30:00Z", stopped_reason: null }, 3, fmt)).toBe("Email 2 due 03/12/2026");
    expect(enrolmentLabel({ status: "stopped", next_step: 2, next_due_at: "2026-12-03T06:30:00Z", stopped_reason: "opted_out" }, 3, fmt)).toBe("Stopped: turned off emails from you");
    expect(enrolmentLabel({ status: "finished", next_step: 4, next_due_at: "2026-12-03T06:30:00Z", stopped_reason: null }, 3, fmt)).toBe("Had every email");
  });
});

describe("the journey email", () => {
  const site = "https://test.givezy.co.za";
  const email = journeyEmail("thandi@example.com", {
    charityName: "Northcliff Meals Fund",
    firstName: "Thandi\nEvil: header",
    subject: "Welcome,\nand thanks",
    body: "Thank you for your gift.\n\n<b>We</b> mean it.",
    pageUrl: charityPageUrl(site, "northcliff-meals-fund"),
    stopUrl: `${site}/news/stop?t=abc`,
    oneClickUrl: `${site}/api/stop/news?t=abc`,
    replyTo: "hello@meals.example",
  });

  it("the donor's first name, the charity's words, Givezy's button to the charity's page and the stop link; nothing else", () => {
    expect(email.subject).toBe("Welcome, and thanks");
    // The name stays on one line, whatever was typed.
    expect(email.text.split("\n")[0]).toBe("Dear Thandi Evil: header,");
    expect(email.text).toContain("See our page on Givezy: https://test.givezy.co.za/c/northcliff-meals-fund");
    expect(email.text).toContain("To stop emails from Northcliff Meals Fund: https://test.givezy.co.za/news/stop?t=abc");
    expect(email.replyTo).toBe("hello@meals.example");
    expect(email.headers?.["List-Unsubscribe"]).toContain("/api/stop/news?t=abc");
    expect(email.text).not.toMatch(/R\d/);
  });

  it("in the HTML the charity's words sit in their own escaped box, and the one button is Givezy's", () => {
    const html = textEmailHtml({ subject: email.subject, text: email.text, siteUrl: site, quoted: email.quoted });
    expect(html).toContain("From Northcliff Meals Fund");
    expect(html).toContain("&lt;b&gt;We&lt;/b&gt; mean it.");
    expect(html).not.toContain("<b>We</b>");
    expect(html).toMatch(/<a href="https:\/\/test\.givezy\.co\.za\/c\/northcliff-meals-fund"[^>]*>See our page on Givezy<\/a>/);
  });

  it("the week's claim keeps which email, never the words", () => {
    expect(claimNote(2, "A little more about our work")).toBe("Donor journey email 2: A little more about our work");
    expect(claimNote(1, "Hi").length).toBeGreaterThanOrEqual(10);
  });
});

describe("the dashboard's record of journey actions", () => {
  const c = { base: "/charity-admin/x", publicUrl: null, approved: true };
  it("every journey action says what happened, can be taken back, and belongs on the journey page", () => {
    for (const kind of ["journey_saved", "journey_on", "journey_off", "journey_existing_added"] as const) {
      expect(isActionKind(kind)).toBe(true);
      expect(pageOf(kind)).toBe("journey");
      expect(describeDone(kind, { steps: 3, added: 2, firstEmail: "12/11/2026" }, c).what).not.toMatch(/[!—]/);
      expect(describeUndone(kind, {})).toMatch(/^Taken back\./);
    }
    expect(describeDone("journey_saved", { steps: 3, on: false }, c).what).toBe("Your donor journey is saved: 3 emails. It's off, so nothing is sent until you switch it on.");
  });
});
