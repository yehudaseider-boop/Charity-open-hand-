/**
 * "Getting started" on the charity overview (10/11/2026): every step ticks itself off from real data, buttons only for
 * roles that may do the step, optional steps never hold up "all set", and steps that couldn't be checked are left out.
 */
import { describe, expect, it } from "vitest";
import { gettingStarted, startProgress, type StartFacts } from "@/lib/charity/checklist";
import { can, type Role } from "@/lib/charity/permissions";

const nothing: StartFacts = {
  charity: { logo_path: null, cover_path: null, description_en: null, funds_use_en: " ", thank_you_en: "  ", gateway_subaccount_ref: null },
  bank: { saved: false, checked: false },
  s18a: { issues: false, sarsDetails: false },
  journeyOn: false,
  updates: 0,
  teamSize: 1,
};
const everything: StartFacts = {
  charity: { logo_path: "1/logo.png", cover_path: "1/cover.jpg", description_en: "We feed families", funds_use_en: "Food", thank_you_en: "Thank you", gateway_subaccount_ref: "ACCT_1" },
  bank: { saved: true, checked: true },
  s18a: { issues: true, sarsDetails: true },
  journeyOn: true,
  updates: 2,
  teamSize: 3,
};
const as = (role: Role) => (p: Parameters<typeof can>[1]) => can(role, p);
const keys = (f: StartFacts) => gettingStarted(f, "/c-a/1", as("owner")).map((i) => i.key);

describe("getting started", () => {
  it("ticks itself off from real data", () => {
    const none = gettingStarted(nothing, "/c-a/1", as("owner"));
    expect(none.every((i) => !i.done)).toBe(true);
    expect(none.find((i) => i.key === "payments")).toMatchObject({ href: null, can: false, who: "Givezy does this for you." });
    const all = gettingStarted(everything, "/c-a/1", as("owner"));
    expect(all.every((i) => i.done)).toBe(true);
    expect(startProgress(all)).toEqual({ done: all.length - 1, total: all.length - 1, allSet: true });
  });

  it("counts the bank as done only when saved and checked, and never offers to edit it (Givezy changes it)", () => {
    const saved = gettingStarted({ ...everything, bank: { saved: true, checked: false } }, "/c", as("owner"));
    expect(saved.find((i) => i.key === "bank")).toMatchObject({ done: false, href: null, can: false, who: "Saved. Givezy is checking it." });
    const none = gettingStarted({ ...everything, bank: { saved: false, checked: false } }, "/c", as("owner"));
    expect(none.find((i) => i.key === "bank")).toMatchObject({ done: false, href: null, can: false });
    expect(none.find((i) => i.key === "bank")?.who).toMatch(/Givezy adds or changes your bank account/);
  });

  it("counts a blank thank-you note as not written, and needs both logo and cover", () => {
    const blank = gettingStarted({ ...everything, charity: { ...everything.charity, thank_you_en: "   " } }, "/c", as("owner"));
    expect(blank.find((i) => i.key === "thanks")?.done).toBe(false);
    const logoOnly = gettingStarted({ ...everything, charity: { ...everything.charity, cover_path: null } }, "/c", as("owner"));
    expect(logoOnly.find((i) => i.key === "look")?.done).toBe(false);
  });

  it("asks for SARS details only from charities that issue s18A receipts", () => {
    expect(keys(everything)).toContain("sars");
    expect(keys({ ...everything, s18a: { issues: false, sarsDetails: false } })).not.toContain("sars");
  });

  it("leaves out a step that couldn't be checked rather than showing it wrong", () => {
    const k = keys({ ...everything, journeyOn: null, teamSize: null });
    expect(k).not.toContain("journey");
    expect(k).not.toContain("team");
    // The private row couldn't be read: no bank or SARS step, and the rest still shows.
    const unread = keys({ ...everything, bank: null, s18a: { issues: true, sarsDetails: null } });
    expect(unread).not.toContain("bank");
    expect(unread).not.toContain("sars");
    expect(unread).toContain("thanks");
  });

  it("never lets the optional team step hold up all set", () => {
    const solo = gettingStarted({ ...everything, teamSize: 1 }, "/c", as("owner"));
    expect(solo.find((i) => i.key === "team")).toMatchObject({ optional: true, done: false });
    expect(startProgress(solo).allSet).toBe(true);
    const missing = gettingStarted({ ...everything, updates: 0 }, "/c", as("owner"));
    expect(startProgress(missing)).toMatchObject({ allSet: false, done: missing.filter((i) => !i.optional).length - 1 });
  });

  it("gives each step's button only to roles that may do it, and says who does it otherwise", () => {
    const step = (role: Role, key: string) => gettingStarted(nothing, "/c", as(role)).find((i) => i.key === key)!;
    expect(step("fundraiser", "look").can).toBe(true);
    expect(step("viewer", "look")).toMatchObject({ can: false, who: "Your charity's owner, an admin or a fundraiser does this." });
    expect(step("fundraiser", "journey").can).toBe(true);
    expect(step("finance", "journey").can).toBe(false);
    expect(step("admin", "team").can).toBe(false);
    expect(step("owner", "team").href).toBe("/c/team");
  });

  it("links each step to the exact page", () => {
    const hrefs = Object.fromEntries(gettingStarted({ ...nothing, s18a: { issues: true, sarsDetails: false } }, "/c", as("owner")).map((i) => [i.key, i.href]));
    expect(hrefs).toMatchObject({
      bank: null,
      look: "/c/profile",
      story: "/c/profile",
      thanks: "/c/thank-donors#wording",
      sars: "/c/receipts/sars",
      journey: "/c/journey",
      update: "/c/updates",
      team: "/c/team",
    });
  });

  it("uses plain words: no exclamation marks or em dashes", () => {
    for (const i of gettingStarted({ ...nothing, s18a: { issues: true, sarsDetails: false } }, "/c", as("viewer"))) {
      for (const t of [i.label, i.why, i.who ?? ""]) {
        expect(t).not.toMatch(/[!—]/);
      }
    }
  });
});
