import { describe, expect, it } from "vitest";
import { readVetting, vettingChecks, vettingField, SPOKE_TO_FIELD } from "../src/lib/charity/vetting";

function form(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}
const allTicked = Object.fromEntries(vettingChecks.map((c) => [vettingField(c.key), "on"]));

describe("approving a charity needs every vetting check and who was spoken to", () => {
  it("passes when every check is ticked and a person is named", () => {
    const r = readVetting(form({ ...allTicked, [SPOKE_TO_FIELD]: "Jo Smith, treasurer, by phone on 19/11/2026" }));
    expect(r).toEqual({ ok: true, ticked: vettingChecks.map((c) => c.key), spokeTo: "Jo Smith, treasurer, by phone on 19/11/2026" });
  });

  it("refuses when any one check is not ticked, and names what is missing", () => {
    for (const c of vettingChecks) {
      const rest = { ...allTicked };
      delete rest[vettingField(c.key)];
      const r = readVetting(form({ ...rest, [SPOKE_TO_FIELD]: "Jo Smith by phone" }));
      expect(r.ok).toBe(false);
      expect((r as { message: string }).message).toContain(c.label.split(":")[0].toLowerCase());
    }
  });

  it("refuses with no ticks at all (the old single tick is not enough)", () => {
    expect(readVetting(form({ confirm_verified: "on", [SPOKE_TO_FIELD]: "Jo Smith by phone" })).ok).toBe(false);
  });

  it("refuses when nobody is named, or only a few characters", () => {
    expect(readVetting(form({ ...allTicked })).ok).toBe(false);
    expect(readVetting(form({ ...allTicked, [SPOKE_TO_FIELD]: "  Jo " })).ok).toBe(false);
  });

  it("tidies the note and keeps it short", () => {
    const r = readVetting(form({ ...allTicked, [SPOKE_TO_FIELD]: `  Jo   Smith\n by phone ${"x".repeat(400)}` }));
    expect(r.ok).toBe(true);
    const note = (r as { spokeTo: string }).spokeTo;
    expect(note.startsWith("Jo Smith by phone")).toBe(true);
    expect(note.length).toBe(300);
  });
});
