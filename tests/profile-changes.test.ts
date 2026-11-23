import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { changePrint, changesOutsideWebsite, outsideWebsiteLines, siteChanges, type AuditRow } from "@/lib/charity/profile-changes";
import { dailyDigest, type DailyChecks } from "@/lib/ops/daily";

const at = "2026-11-23T08:00:00.000Z";
const later = (ms: number) => new Date(new Date(at).getTime() + ms).toISOString();
const change = (prints: Record<string, string>, extra: Record<string, unknown> = {}): AuditRow => ({
  actor_user_id: "u1",
  entity_id: "c1",
  created_at: at,
  details: { fields: Object.keys(prints), prints, name: "Hillside Kitchen", ...extra },
});
const save = (site_changes: Record<string, string>, o: Partial<AuditRow> = {}): AuditRow => ({ actor_user_id: "u1", entity_id: "c1", created_at: later(800), details: { site_changes }, ...o });

describe("siteChanges", () => {
  it("fingerprints only the watched fields that changed, comparing numbers and text alike", () => {
    expect(siteChanges({ name_en: "A", impact_unit_cents: 5000, website: null, funds_use_en: "x" }, { name_en: "B", impact_unit_cents: 5000, website: null, funds_use_en: "y" })).toEqual({
      name_en: changePrint("A", "B"),
    });
    expect(siteChanges({ logo_path: null }, { logo_path: "c1/logo.png" })).toEqual({ logo_path: changePrint(null, "c1/logo.png") });
  });
});

describe("changesOutsideWebsite", () => {
  const logo = { logo_path: changePrint("c1/a.png", "c1/b.png") };

  it("leaves out a change the website's own save accounts for", () => {
    expect(changesOutsideWebsite([change(logo)], [save(logo)])).toEqual([]);
  });

  it("reports a change with no website save, or a save by someone else, for another charity, too late or with other values", () => {
    expect(changesOutsideWebsite([change(logo)], [])).toHaveLength(1);
    expect(changesOutsideWebsite([change(logo)], [save(logo, { actor_user_id: "u2" })])).toHaveLength(1);
    expect(changesOutsideWebsite([change(logo)], [save(logo, { entity_id: "c2" })])).toHaveLength(1);
    expect(changesOutsideWebsite([change(logo)], [save(logo, { created_at: later(3 * 60_000) })])).toHaveLength(1);
    expect(changesOutsideWebsite([change(logo)], [save(logo, { created_at: later(-1_000) })])).toHaveLength(1);
    expect(changesOutsideWebsite([change(logo)], [save({ logo_path: changePrint("c1/b.png", "c1/c.png") })])).toHaveLength(1);
  });

  it("a website save must account for every field that changed", () => {
    const both = { ...logo, name_en: changePrint("Old", "New") };
    expect(changesOutsideWebsite([change(both)], [save(logo)])).toHaveLength(1);
  });
});

describe("the daily email", () => {
  it("says, per charity and in plain words, what changed outside the website", () => {
    const lines = outsideWebsiteLines([
      change({ name_en: "x", logo_path: "y" }, { name_from: "Hillside Soup Kitchen", name_to: "Hillside Kitchen" }),
      change({ impact_unit_cents: "z", impact_unit_one: "w" }),
    ]);
    expect(lines).toEqual([
      'Hillside Kitchen changed its name from "Hillside Soup Kitchen" to "Hillside Kitchen", its logo and its "what one gift pays for" figure outside the website\'s own pages (straight through the database), so the reviewer wasn\'t told at the time. Check its public page and Admin, Charities.',
    ]);
    for (const l of lines) expect(l).not.toMatch(/!|—/);
  });

  it("lists them in the day's email, and nothing when there are none", () => {
    const checks = { incomplete: false, cardUpdatesFinished: 0, pending: { checked: 0, paid: 0, failed: 0, still: 0, errors: 0 }, stuckPending: 0, confirmations: { resent: 0, failedAgain: 0 }, unhandledEvents: 0, held: {} } satisfies DailyChecks;
    const jobs = { monthlyErrors: 0, monthlyReview: 0, monthlyStopped: 0, payoutsFailed: false, monthlyFailed: false };
    expect(dailyDigest(checks, jobs)).toEqual([]);
    expect(dailyDigest({ ...checks, profileChangesOutsideWebsite: ["Hillside Kitchen changed its logo"] }, jobs)).toEqual(["Hillside Kitchen changed its logo"]);
  });
});
