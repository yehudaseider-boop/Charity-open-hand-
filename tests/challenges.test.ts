import { describe, expect, it } from "vitest";
import { challengeOpen, challengeShareText, challengeSlug, checkChallenge, milestone, ringPercent } from "@/lib/challenges/rules";
import { formatRand } from "@/lib/money";

const ok = { starter_name: "Sarah", title: "Our office feeds 50 families", target: "10 000", reason: "Thursday parcels." };

describe("starting a challenge", () => {
  it("takes the name to show, a name, a goal in Rand and an optional last day", () => {
    const r = checkChallenge({ ...ok, ends_on: "2026-11-30" }, "2026-10-16", 3000, "R30");
    expect(r).toEqual({ ok: true, value: { starterName: "Sarah", title: "Our office feeds 50 families", reason: "Thursday parcels.", targetCents: 1_000_000, endsAt: "2026-11-30T23:59:59+02:00" } });
  });
  it("refuses a goal below the smallest donation, a past last day, and a missing name to show", () => {
    const r = checkChallenge({ ...ok, starter_name: "", target: "20", ends_on: "2026-10-01" }, "2026-10-16", 3000, "R30");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors).toMatchObject({ starter_name: expect.any(String), target: "The goal must be at least R30", ends_on: "Choose today or a later date" });
  });
  it("makes a web address from the name, kept unique", () => {
    expect(challengeSlug("Our office feeds 50 families", "AB12cd34")).toBe("our-office-feeds-50-families-ab12cd");
    expect(challengeSlug("!!!", "xyz123")).toBe("challenge-xyz123");
  });
});

describe("the ring", () => {
  it("fills by whole percent and says when halfway or done", () => {
    expect(ringPercent(640_000, 1_000_000)).toBe(64);
    expect(milestone(400_000, 1_000_000)).toBeNull();
    expect(milestone(500_000, 1_000_000)).toBe("halfway");
    expect(milestone(1_200_000, 1_000_000)).toBe("goal");
  });
  it("is open until stopped or past its last day", () => {
    const now = new Date("2026-10-16T10:00:00+02:00");
    expect(challengeOpen({ status: "active", endsAt: null }, now)).toBe(true);
    expect(challengeOpen({ status: "active", endsAt: "2026-10-15T23:59:59+02:00" }, now)).toBe(false);
    expect(challengeOpen({ status: "stopped", endsAt: null }, now)).toBe(false);
  });
  it("shares what it's for and the link, never anyone's gift", () => {
    const c = { title: "Our office feeds 50 families", charityName: "Meals Fund", raisedCents: 500_000, targetCents: 1_000_000 };
    expect(challengeShareText(c, "https://givezy.co.za/g/x", formatRand)).toBe(`We're halfway: "Our office feeds 50 families" for Meals Fund. https://givezy.co.za/g/x`);
  });
});
