import { describe, expect, it } from "vitest";
import { SAMPLE_PREFIX, sampleEmails } from "@/lib/email/samples";

describe("sample emails", () => {
  const list = sampleEmails("me@example.com", "https://test.givezy.co.za");

  it("goes only to the person who asked, every subject marked as a sample", () => {
    expect(list.length).toBeGreaterThanOrEqual(25);
    for (const m of list) {
      expect(m.to).toBe("me@example.com");
      expect(m.subject.startsWith(SAMPLE_PREFIX)).toBe(true);
      expect(m.headers).toBeUndefined();
      expect(m.replyTo ?? null).toBeNull();
    }
  });

  it("has no two emails the same", () => {
    const seen = new Set(list.map((m) => `${m.subject}\n${m.text}`));
    expect(seen.size).toBe(list.length);
  });

  it("reads like a real email: no blanks, no code words, Rand the SA way", () => {
    for (const m of list) {
      expect(m.text).not.toMatch(/undefined|null|NaN|\[object/);
      expect(m.text).not.toMatch(/R\d{1,3},\d{3}\b|R\d+\.00\b|\$\d/);
      expect(m.text).not.toMatch(/!/);
    }
  });
});
