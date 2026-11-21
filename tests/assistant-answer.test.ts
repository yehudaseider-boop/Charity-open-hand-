import { describe, expect, it } from "vitest";
import { dashHref, inline, parseAnswer } from "@/lib/assistant/answer";
import { assistantDemoOn, assistantOn } from "@/config/assistant";

const base = "/charity-admin/11111111-2222-3333-4444-555555555555";

describe("help assistant links", () => {
  it("turns dash: links into this dashboard's pages", () => {
    expect(dashHref("dash:/receipts", base)).toBe(`${base}/receipts`);
    expect(dashHref("dash:/", base)).toBe(base);
    expect(dashHref("dash:", base)).toBe(base);
    expect(dashHref("dash:/monthly/stopped", "/demo/dashboard")).toBe("/demo/dashboard/monthly/stopped");
  });
  it("never links anywhere else", () => {
    for (const bad of ["https://evil.example/x", "javascript:alert(1)", "dash://evil.example", "dash:/../admin", "dash:/receipts?x=1", "dash:/Receipts", "dash:receipts", "/receipts", "dash:/a//b", "dash:/a/"]) {
      expect(dashHref(bad, base), bad).toBeNull();
    }
  });
  it("shows a link it won't follow as its plain words", () => {
    expect(inline("Go to [the bank](https://evil.example) now", base)).toEqual([
      { kind: "text", text: "Go to " },
      { kind: "text", text: "the bank" },
      { kind: "text", text: " now" },
    ]);
  });
  it("keeps bold labels and safe links", () => {
    expect(inline("Press **Add a team member** on [Team](dash:/team).", base)).toEqual([
      { kind: "text", text: "Press " },
      { kind: "bold", text: "Add a team member" },
      { kind: "text", text: " on " },
      { kind: "link", text: "Team", href: `${base}/team` },
      { kind: "text", text: "." },
    ]);
  });
  it("reads paragraphs, numbered steps and bullets, and drops heading marks", () => {
    const blocks = parseAnswer("## Steps\nOpen it.\n\n1. First\n2) Second\n- a\n* b\n\nDone.", base);
    expect(blocks).toEqual([
      { kind: "para", parts: [{ kind: "text", text: "Steps Open it." }] },
      { kind: "list", ordered: true, items: [[{ kind: "text", text: "First" }], [{ kind: "text", text: "Second" }]] },
      { kind: "list", ordered: false, items: [[{ kind: "text", text: "a" }], [{ kind: "text", text: "b" }]] },
      { kind: "para", parts: [{ kind: "text", text: "Done." }] },
    ]);
  });
  it("treats HTML as plain words", () => {
    expect(parseAnswer("<img src=x onerror=alert(1)>", base)).toEqual([{ kind: "para", parts: [{ kind: "text", text: "<img src=x onerror=alert(1)>" }] }]);
  });
});

describe("help assistant switches", () => {
  it("is off unless switched on with a key", () => {
    expect(assistantOn({})).toBe(false);
    expect(assistantOn({ ASSISTANT: "yes" })).toBe(false);
    expect(assistantOn({ ANTHROPIC_API_KEY: "k" })).toBe(false);
    expect(assistantOn({ ASSISTANT: "yes", ANTHROPIC_API_KEY: "k" })).toBe(true);
  });
  it("shows on the demo only when the demo switch is on too", () => {
    expect(assistantDemoOn({ ASSISTANT: "yes", ANTHROPIC_API_KEY: "k" })).toBe(false);
    expect(assistantDemoOn({ ASSISTANT_DEMO: "yes", ANTHROPIC_API_KEY: "k" })).toBe(false);
    expect(assistantDemoOn({ ASSISTANT: "yes", ASSISTANT_DEMO: "yes", ANTHROPIC_API_KEY: "k" })).toBe(true);
  });
});
