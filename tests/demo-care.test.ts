/** The public dashboard demo's sample notes, tags and follow-ups: made up, current, and the same on every page. */
import { describe, expect, it } from "vitest";
import { DEMO_TAGS, demoCareSeed, demoDonorIndex } from "@/app/demo/dashboard/care";

describe("the demo's sample donor care", () => {
  it("gives every fourth donor a note, two tags and a follow-up, and the rest nothing", () => {
    const seeded = demoCareSeed(0, "2026-11-09");
    expect(seeded.notes).toHaveLength(1);
    expect(seeded.tags).toHaveLength(2);
    expect(seeded.followUps[0]).toMatchObject({ dueOn: "2026-11-09", doneAt: null });
    expect(demoCareSeed(1, "2026-11-09")).toEqual({ notes: [], tags: [], followUps: [] });
  });

  it("is the same every time, counts from today, and writes dates as dd/mm/yyyy", () => {
    expect(demoCareSeed(4, "2026-11-09")).toEqual(demoCareSeed(4, "2026-11-09"));
    expect(demoCareSeed(4, "2026-11-09").followUps[0].dueOn).toBe("2026-11-12");
    expect(demoCareSeed(0, "2026-03-01").notes[0].at).toBe("17/02/2026 09:30");
  });

  it("only uses the demo's own tags, in the house style", () => {
    for (let i = 0; i < 40; i += 4) for (const t of demoCareSeed(i, "2026-11-09").tags) expect(DEMO_TAGS).toContain(t);
    const words = [0, 4, 8].flatMap((i) => [...demoCareSeed(i, "2026-11-09").notes.map((n) => n.body), ...demoCareSeed(i, "2026-11-09").followUps.map((f) => f.what)]).join(" ");
    expect(words).not.toMatch(/[!—]/);
  });

  it("reads a donor's place from its id, and nothing else", () => {
    expect(demoDonorIndex("demo-donor-12")).toBe(12);
    expect(demoDonorIndex("demo-donor-x")).toBe(-1);
    expect(demoDonorIndex("../demo-donor-1")).toBe(-1);
  });
});
