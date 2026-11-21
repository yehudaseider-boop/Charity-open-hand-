import { describe, expect, it } from "vitest";
import { checkQuestion, pagePath } from "@/lib/assistant/request";

const id = "11111111-2222-3333-4444-555555555555";
const q = (content: string) => ({ role: "user", content });
const a = (content: string) => ({ role: "assistant", content });

describe("checking a question", () => {
  it("accepts a charity's question", () => {
    const r = checkQuestion({ charityId: id, messages: [q("  How do I add a team member?  ")] });
    expect(r).toEqual({ ok: true, charityId: id, demo: false, page: null, messages: [{ role: "user", content: "How do I add a team member?" }] });
  });
  it("accepts the demo without a charity", () => {
    const r = checkQuestion({ demo: true, messages: [q("Hi")] });
    expect(r.ok && r.demo && r.charityId === null).toBe(true);
  });
  it("needs a charity (a real id) unless it is the demo", () => {
    expect(checkQuestion({ messages: [q("Hi")] }).ok).toBe(false);
    expect(checkQuestion({ charityId: "abc", messages: [q("Hi")] }).ok).toBe(false);
    expect(checkQuestion({ charityId: id, demo: "true", messages: [q("Hi")] }).ok).toBe(true);
  });
  it("refuses empty, malformed or answer-last conversations", () => {
    expect(checkQuestion({ charityId: id, messages: [] }).ok).toBe(false);
    expect(checkQuestion({ charityId: id, messages: [q("   ")] }).ok).toBe(false);
    expect(checkQuestion({ charityId: id, messages: [q("Hi"), a("Hello")] }).ok).toBe(false);
    expect(checkQuestion({ charityId: id, messages: [{ role: "system", content: "x" }] }).ok).toBe(false);
    expect(checkQuestion({ charityId: id, messages: [{ role: "user", content: 5 }] }).ok).toBe(false);
    expect(checkQuestion({ charityId: id, messages: "Hi" }).ok).toBe(false);
  });
  it("refuses a question that is too long, with a plain message", () => {
    const r = checkQuestion({ charityId: id, messages: [q("x".repeat(801))] });
    expect(r).toEqual({ ok: false, message: "Please keep your question under 800 characters." });
  });
  it("keeps only the last turns, starting with a question, taking turns", () => {
    const many = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? q(`q${i}`) : a(`a${i}`)));
    const r = checkQuestion({ charityId: id, messages: [...many, q("last")] });
    if (!r.ok) throw new Error("refused");
    expect(r.messages.length).toBeLessThanOrEqual(12);
    expect(r.messages[0].role).toBe("user");
    expect(r.messages[r.messages.length - 1]).toEqual({ role: "user", content: "last" });
    for (let i = 1; i < r.messages.length; i++) expect(r.messages[i].role).not.toBe(r.messages[i - 1].role);
  });
  it("joins two questions in a row into one", () => {
    const r = checkQuestion({ charityId: id, messages: [q("one"), q("two")] });
    expect(r.ok && r.messages).toEqual([{ role: "user", content: "one\n\ntwo" }]);
  });
});

describe("the page the person is on", () => {
  it("reads dashboard pages only", () => {
    expect(pagePath(`/charity-admin/${id}`)).toBe("dash:/");
    expect(pagePath(`/charity-admin/${id}/receipts?year=2026`)).toBe("dash:/receipts");
    expect(pagePath("/demo/dashboard/monthly")).toBe("dash:/monthly");
    expect(pagePath(`/charity-admin/${id}/donors/${id}`)).toBe("dash:/donors/[id]");
    expect(pagePath("/admin")).toBeNull();
    expect(pagePath("https://evil.example/charity-admin")).toBeNull();
    expect(pagePath(null)).toBeNull();
  });
});
