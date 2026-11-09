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

describe("the demo is a closed room", () => {
  it("every demo page asks for the demo's own header and footer", async () => {
    const { default: DemoLayout } = await import("@/app/demo/layout");
    const tree = DemoLayout({ children: null, params: Promise.resolve({}) } as never);
    const marks = (tree.props.children as { props: { kind?: string } }[]).filter((c) => c?.props?.kind);
    expect(marks.map((m) => m.props.kind)).toEqual(["demo"]);
  });
});

describe("the demo's deposits and sample import file", () => {
  it("never makes up a card fee", async () => {
    const { demoData } = await import("@/app/demo/dashboard/data");
    const { demoDepositsCsv } = await import("@/app/demo/dashboard/deposits");
    const lines = demoDepositsCsv(demoData(new Date("2026-11-09T10:00:00+02:00"))).trim().split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines.slice(1)) expect(l.endsWith('"To be confirmed"')).toBe(true);
  });

  it("offers a sample file that imports cleanly", async () => {
    const { GET } = await import("@/app/demo/dashboard/donations/import/template/route");
    const { checkFile } = await import("@/lib/charity/recorded-gifts");
    const text = await GET().text();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(new Date());
    const file = checkFile(text, { today, fallbackMethod: "eft" });
    expect(file.ok).toBe(true);
    if (file.ok) expect(file.rows.every((r) => r.check.ok)).toBe(true);
  });
});
