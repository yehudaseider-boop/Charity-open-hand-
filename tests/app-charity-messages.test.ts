/** "Messages from your charities" in the app (24/11/2026): the pure helpers (apps/mobile/src/lib/charity-messages.ts). */
import { describe, expect, it } from "vitest";
import { isLongMessage, isMissingTable, markedRead, toMessages, unreadCount, type MessageRow } from "../apps/mobile/src/lib/charity-messages";

const row = (over: Partial<MessageRow> = {}): MessageRow => ({
  id: "m1",
  subject: " Thank you ",
  body: " Thank you for your gift. ",
  sent_at: "2026-11-20T10:00:00Z",
  read_at: null,
  charities: { name_en: "Northcliff Meals Fund", slug: "northcliff-meals-fund" },
  ...over,
});

describe("messages from charities", () => {
  it("are newest first, trimmed, with the charity's name, and new until read", () => {
    const list = toMessages([row(), row({ id: "m2", sent_at: "2026-11-22T10:00:00Z", read_at: "2026-11-22T11:00:00Z", charities: [{ name_en: "Linksfield Learning Centre", slug: "linksfield-learning-centre" }] })]);
    expect(list.map((m) => m.id)).toEqual(["m2", "m1"]);
    expect(list[1]).toMatchObject({ subject: "Thank you", body: "Thank you for your gift.", charityName: "Northcliff Meals Fund", read: false });
    expect(list[0]).toMatchObject({ charityName: "Linksfield Learning Centre", read: true });
    expect(unreadCount(list)).toBe(1);
    expect(unreadCount(markedRead(list, "m1"))).toBe(0);
  });
  it("leave out an empty or undated message, and name a charity that is no longer listed plainly", () => {
    const list = toMessages([row({ body: "  " }), row({ id: "m2", sent_at: "not a date" }), row({ id: "m3", charities: null })]);
    expect(list.map((m) => m.id)).toEqual(["m3"]);
    expect(list[0]).toMatchObject({ charityName: "A charity you gave to", slug: null });
  });
  it("a long one is shortened until Read all", () => {
    expect(isLongMessage("Thank you for your gift.")).toBe(false);
    expect(isLongMessage("a".repeat(400))).toBe(true);
    expect(isLongMessage("One\n\nTwo\n\nThree")).toBe(true);
  });
  it("before the database change there are simply none, never an error", () => {
    expect(isMissingTable({ code: "PGRST205" })).toBe(true);
    expect(isMissingTable({ code: "42P01" })).toBe(true);
    expect(isMissingTable({ code: "500" })).toBe(false);
    expect(isMissingTable(null)).toBe(false);
  });
});
