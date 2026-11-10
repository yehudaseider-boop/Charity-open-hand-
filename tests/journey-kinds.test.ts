/**
 * Campaign journeys and the win-back journey (CRM steps 6b and 7, 10/11/2026): naming journeys in links, their names
 * in sentences, the suggested wording (DRAFT for Yosef) passing the same checks as a charity's own, who joins the
 * win-back journey and why the others don't, the cap on a press, and the gave-again rule.
 */
import { describe, expect, it } from "vitest";
import {
  GENERAL,
  WINBACK,
  WINBACK_PRESS_CAP,
  STOP_WORDS,
  campaignStarterSteps,
  checkJourneySteps,
  chosenDonors,
  enrolmentLabel,
  gaveAgain,
  journeyName,
  journeyTitle,
  parseRefKey,
  planWinback,
  refKey,
  sameRef,
  starterSteps,
  winbackOutcome,
} from "@/lib/charity/journey";
import { hasWebAddress } from "@/lib/charity/thank-you-note";
import { describeDone, describeUndone } from "@/lib/charity/done";
import { actionPhrase as describeAction } from "@/lib/charity/activity";

const K = "6f0c1a52-0d1e-4c63-9a3b-2a9c4f1e7d10";

describe("naming a journey in a link", () => {
  it("round-trips the general, win-back and a campaign's journey", () => {
    expect(refKey(GENERAL)).toBe("general");
    expect(refKey(WINBACK)).toBe("winback");
    expect(refKey({ kind: "campaign", campaignId: K })).toBe(`campaign:${K}`);
    for (const r of [GENERAL, WINBACK, { kind: "campaign" as const, campaignId: K }]) expect(sameRef(parseRefKey(refKey(r))!, r)).toBe(true);
  });

  it("treats nothing as the general journey, and refuses anything made up", () => {
    expect(parseRefKey(undefined)).toEqual(GENERAL);
    expect(parseRefKey("")).toEqual(GENERAL);
    expect(parseRefKey(`campaign:${K.toUpperCase()}`)).toEqual({ kind: "campaign", campaignId: K });
    for (const bad of ["campaign:", "campaign:abc", "campaign:../../x", "everyone", "winback ", `campaign:${K}x`]) {
      expect(parseRefKey(bad as unknown)).toBe(bad === "winback " ? WINBACK : null);
    }
  });
});

describe("a journey's name in a sentence", () => {
  it("says which journey, with the campaign's own name", () => {
    expect(journeyName("general")).toBe("your donor journey");
    expect(journeyName("winback")).toBe("your win-back journey");
    expect(journeyName("campaign", "  Winter   blankets ")).toBe("the journey for Winter blankets");
    expect(journeyName("campaign", "")).toBe("the journey for your campaign");
    expect(journeyTitle("winback")).toBe("Your win-back journey");
    expect(journeyTitle("campaign", "Winter blankets")).toBe("The journey for Winter blankets");
  });
});

describe("suggested wording", () => {
  it("passes the same checks as a charity's own emails, for every kind of journey", () => {
    for (const steps of [starterSteps("general"), starterSteps("winback"), starterSteps("campaign", "Winter blankets"), campaignStarterSteps("x".repeat(200))]) {
      const checked = checkJourneySteps(steps.map((s) => ({ subject: s.subject, body: s.body, waitDays: String(s.waitDays) })));
      expect(checked.ok).toBe(true);
      for (const s of steps) {
        expect(hasWebAddress(s.subject + " " + s.body)).toBe(false);
        expect(s.body).not.toMatch(/!|—/);
      }
    }
  });
});

describe("gave again", () => {
  const joined = new Date("2026-11-01T08:00:00Z");
  it("is a gift that went through after they joined", () => {
    expect(gaveAgain(joined, new Date("2026-11-02T08:00:00Z"))).toBe(true);
    expect(gaveAgain(joined, new Date("2026-10-31T08:00:00Z"))).toBe(false);
    expect(gaveAgain(joined, joined)).toBe(false);
    expect(gaveAgain(joined, null)).toBe(false);
  });

  it("reads as a reason for leaving", () => {
    expect(STOP_WORDS.gave_again).toBe("Gave again, so they left your win-back journey");
    expect(enrolmentLabel({ status: "stopped", next_step: 2, next_due_at: "2026-11-01T08:00:00Z", stopped_reason: "gave_again" }, 3, (d) => d)).toBe("Stopped: gave again, so they left your win-back journey");
  });
});

describe("choosing donors for the win-back journey", () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

  it("keeps real ids only, each once, up to the cap, and says how many were over", () => {
    const many = Array.from({ length: WINBACK_PRESS_CAP + 7 }, (_, i) => id(i));
    expect(chosenDonors(many)).toEqual({ ids: many.slice(0, WINBACK_PRESS_CAP), over: 7 });
    expect(chosenDonors([id(1), id(1).toUpperCase(), " " + id(2), "nope", 5, null, "' or 1=1 --"])).toEqual({ ids: [id(1), id(2)], over: 0 });
    expect(chosenDonors([])).toEqual({ ids: [], over: 0 });
  });

  it("adds those who can be emailed, and says why each other donor isn't added", () => {
    const plan = planWinback([
      { donorId: id(1), already: false, erased: false, email: "a@example.org", optedOut: false },
      { donorId: id(2), already: true, erased: false, email: "b@example.org", optedOut: false },
      { donorId: id(3), already: false, erased: true, email: null, optedOut: false },
      { donorId: id(4), already: false, erased: false, email: null, optedOut: false },
      { donorId: id(5), already: false, erased: false, email: "e@example.org", optedOut: true },
    ]);
    expect(plan.add.map((c) => c.donorId)).toEqual([id(1)]);
    expect(plan.skipped).toEqual({ already: 1, erased: 1, opted_out: 1, recorded_only: 1 });
    expect(winbackOutcome({ added: 1, skipped: plan.skipped, firstEmail: "12/11/2026" })).toBe(
      "1 donor is on your win-back journey now. Their first email goes from 12/11/2026, never more than one message from you a week. Anyone who gives again leaves it. 4 aren't added: 1 already on your journey; 1 had their details erased at their request; 1 turned off emails from you; 1 have only gifts you recorded yourself, so Givezy can't email them.",
    );
    expect(winbackOutcome({ added: 0, skipped: { already: 2 }, firstEmail: null })).toBe("Nobody new was added. 2 aren't added: 2 already on your journey.");
  });
});

describe("what just happened, and the activity log", () => {
  const c = { base: "/charity-admin/c1", publicUrl: null, approved: true };

  it("names the journey and links back to it", () => {
    const camp = { steps: 2, on: true, jkey: `campaign:${K}`, jtitle: "Winter blankets" };
    expect(describeDone("journey_saved", camp, c).what).toBe("The journey for Winter blankets is saved: 2 emails. Donors on it get the new wording from their next email.");
    expect(describeDone("journey_saved", camp, c).next?.href).toBe(`/charity-admin/c1/journey?j=${encodeURIComponent(`campaign:${K}`)}#people`);
    expect(describeDone("journey_on", { steps: 2, jkey: "winback" }, c).what).toBe("Your win-back journey is on. Donors you add from your lists get 2 emails from you, never more than one message from you a week.");
    expect(describeDone("journey_on", { steps: 3 }, c).what).toBe("Your donor journey is on. From now, each new donor joins on their first gift and gets 3 emails from you, never more than one message from you a week.");
    expect(describeDone("journey_winback_added", { added: 3, firstEmail: "12/11/2026", jkey: "winback" }, c).next?.href).toBe("/charity-admin/c1/journey?j=winback#people");
    expect(describeUndone("journey_off", { jkey: "winback" })).toBe("Taken back. Your win-back journey is on again.");
    expect(describeUndone("journey_winback_added", { removed: 2, stayed: 1, jkey: "winback" })).toBe("Taken back. Removed 2 donors from your win-back journey; 1 had already had their first email and stays on.");
  });

  it("reads plainly in the activity log", () => {
    expect(describeAction("journey_on", { jkey: "winback" })).toBe("switched on the win-back journey");
    expect(describeAction("journey_saved", { jkey: `campaign:${K}`, jtitle: "Winter blankets" })).toBe("saved the journey for Winter blankets");
    expect(describeAction("journey_off", {})).toBe("switched off the donor journey");
    expect(describeAction("journey_winback_added", {})).toBe("added donors to the win-back journey");
  });
});
