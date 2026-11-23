/**
 * The journey builder (23/11/2026, Yehuda's meeting): it starts where the donor gives, prompts "What would you like
 * next?", every email starts empty with a grey hint, and "Show me an example" fills in our wording for an empty email.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STARTER_STEPS, WINBACK_STARTER_STEPS, campaignJourneyWords, exampleFor, journeyStartWords, startedInCampaign, stepHints } from "@/lib/charity/journey";
import { formatDate } from "@/lib/dates";
import { JourneyEditor } from "@/app/charity-admin/[id]/journey/editor";

const render = (saved: { subject: string; body: string; waitDays: number }[], extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(JourneyEditor, { action: async () => ({ ok: true }) as never, charityName: "Meals Fund", slug: "meals", saved, canEdit: true, ...extra }),
  );

describe("where a journey starts", () => {
  it("says it in the charity's words for each kind of journey", () => {
    expect(journeyStartWords("general")).toBe("A donor gives for the first time");
    expect(journeyStartWords("campaign", " Winter parcels ")).toBe('A donor gives to "Winter parcels" for the first time');
    expect(journeyStartWords("campaign", "")).toBe("A donor gives to this campaign for the first time");
    expect(journeyStartWords("winback")).toBe("You add a donor to this journey");
  });
});

describe("hints and examples", () => {
  it("hints at a thank-you first, and news after", () => {
    expect(stepHints(0).subject).toMatch(/Thank you/);
    expect(stepHints(1).body).toMatch(/news/);
    expect(stepHints(4)).toEqual(stepHints(1));
  });
  it("offers our example only where we have one", () => {
    expect(exampleFor(STARTER_STEPS, 0)).toBe(STARTER_STEPS[0]);
    expect(exampleFor(WINBACK_STARTER_STEPS, WINBACK_STARTER_STEPS.length)).toBeNull();
  });
});

describe("the builder", () => {
  it("starts empty: the donor gives, then the question, and no ready-made journey", () => {
    const html = render([]);
    expect(html).toContain("A donor gives for the first time");
    expect(html).toContain("What would you like to happen first?");
    expect(html).toContain(">Send an email<");
    expect(html).not.toContain("Start from our suggested wording");
    expect(html).not.toContain(STARTER_STEPS[0].subject);
  });

  it("keeps a saved journey's words, asks what next, and offers no example over written words", () => {
    const html = render([{ subject: "Thanks from us", body: "You made our week. Thank you.", waitDays: 2 }], { start: "You add a donor to this journey" });
    expect(html).toContain("You add a donor to this journey");
    expect(html).toContain('value="Thanks from us"');
    expect(html).toContain("What would you like next?");
    expect(html).toContain("Wait, then send another email");
    expect(html).not.toContain("Show me an example");
    // The wait is part of the step, with its range.
    expect(html).toContain("Then wait");
    expect(html).toContain("0 to 30 days after they join.");
  });

  it("an empty email shows grey hints and the example button", () => {
    const html = render([{ subject: "", body: "", waitDays: 2 }]);
    expect(html).toContain(`placeholder="${stepHints(0).subject}"`);
    expect(html).toContain("Show me an example");
  });

  it("at five emails, says the journey ends there", () => {
    const step = { subject: "Hello there", body: "A note from us to you.", waitDays: 7 };
    const html = render([step, step, step, step, step]);
    expect(html).toContain("5 emails is the most a journey has. Your journey ends here.");
    expect(html).not.toContain("Wait, then send another email");
  });
});

describe("a campaign's journey and its dates (23/11/2026)", () => {
  const c = { startsAt: "2026-11-02T00:00:00+02:00", endsAt: "2026-11-30T23:59:59+02:00" };
  it("counts a gift by when it was started, and needs a time to judge by", () => {
    expect(startedInCampaign({ created_at: "2026-11-01T23:00:00+02:00" }, c)).toBe(false);
    expect(startedInCampaign({ created_at: "2026-11-30T23:59:00+02:00", paid_at: "2026-12-01T00:03:00+02:00" }, c)).toBe(true);
    expect(startedInCampaign({ created_at: "2026-12-01T08:00:00+02:00" }, c)).toBe(false);
    expect(startedInCampaign({ paid_at: "2026-11-10T08:00:00+02:00" }, c)).toBe(true);
    expect(startedInCampaign({}, c)).toBe(false);
    expect(startedInCampaign({ created_at: "2027-06-01T08:00:00+02:00" }, { startsAt: c.startsAt, endsAt: null })).toBe(true);
  });
  it("says when it runs, and plainly when the campaign has ended", () => {
    const now = new Date("2026-11-15T10:00:00+02:00");
    expect(campaignJourneyWords({ ...c, status: "active" }, now, formatDate)).toBe(
      "It runs with the campaign, from 02/11/2026 to 30/11/2026. Nobody new joins after the campaign ends; donors already on it still get the rest of their emails.",
    );
    expect(campaignJourneyWords({ ...c, endsAt: null, status: "active" }, now, formatDate)).toMatch(/from 02\/11\/2026 until you end it\./);
    const ended = "This campaign has ended, so nobody new will join. Donors already on the journey still get the rest of their emails.";
    expect(campaignJourneyWords({ ...c, status: "ended" }, now, formatDate)).toBe(ended);
    expect(campaignJourneyWords({ ...c, status: "active" }, new Date("2026-12-02T10:00:00+02:00"), formatDate)).toBe(ended);
  });
});
