/**
 * Review fixes (12/11/2026), the pure parts: a Viewer's donor list has no email addresses; CSV files from Excel on
 * Windows; one email per inbox; reading every page; names set apart in sentences; removing a journey email; and the
 * monthly thank-you that leaves out donors already messaged this week.
 */
import { describe, expect, it } from "vitest";
import { donorMatches } from "@/lib/charity/dashboard";
import { donorsToThank } from "@/lib/charity/this-week";
import { csvEncoding, decodeCsvBytes } from "@/lib/csv-file";
import { inboxKey, onePerAddress } from "@/lib/charity/one-per-address";
import { PAGE_ROWS, readPages } from "@/lib/charity/paged";
import { isolate } from "@/lib/text";
import { canRemoveStep, middleStepWords, partWay, stepsShifted } from "@/lib/charity/journey";
import { describeDone } from "@/lib/charity/done";

const ctx = { base: "/charity-admin/c1", publicUrl: "/c/meals", approved: true };

describe("a Viewer's donor list (no contact details: email is null)", () => {
  const viewerRow = { display_name: "Thandi Mokoena", email: null };
  it("searching by name still works, and an email search simply doesn't match", () => {
    expect(donorMatches(viewerRow, "")).toBe(true);
    expect(donorMatches(viewerRow, "thandi")).toBe(true);
    expect(donorMatches(viewerRow, "@x.co")).toBe(false);
    expect(donorMatches({ display_name: "Ben", email: "Ben@X.co" }, "ben@x")).toBe(true);
  });
  it("'Say thank you' is never offered for a donor whose address the viewer can't see", () => {
    const now = new Date("2026-11-12T10:00:00+02:00");
    const rows = [
      { donor_id: "a", first_paid_at: "2026-11-10T10:00:00+02:00", email: null },
      { donor_id: "b", first_paid_at: "2026-11-10T10:00:00+02:00", email: "b@x.co" },
    ];
    const out = donorsToThank(rows, now, { canEmail: () => true, lastThankedAt: new Map(), optedOut: new Set() });
    expect(out.map((d) => d.donor_id)).toEqual(["b"]);
  });
});

describe("reading a CSV file someone chose", () => {
  const win1252 = (s: string) => Uint8Array.from([...s].map((ch) => {
    const c = ch.charCodeAt(0);
    if (c > 0xff) throw new Error("not in this test's Windows-1252 subset");
    return c;
  }));
  const utf8 = (s: string) => new TextEncoder().encode(s);

  it("a Windows-1252 file from Excel keeps André and Zoë", () => {
    const bytes = win1252("first_name,last_name\r\nAndré,Zoë\r\n");
    expect(csvEncoding(bytes)).toBe("windows-1252");
    const text = decodeCsvBytes(bytes);
    expect(text).toBe("first_name,last_name\r\nAndré,Zoë\r\n");
    expect(text).not.toContain("�");
  });
  it("Windows-1252's own characters (curly quotes, the euro sign) come through too", () => {
    expect(decodeCsvBytes(Uint8Array.from([0x93, 0x4f, 0x94, 0x2c, 0x80]))).toBe("“O”,€");
  });
  it("a real UTF-8 file stays exactly as it is, whatever the language", () => {
    const s = "name\nAndré\nZoë Łukasz\nNomvula 王\n";
    expect(csvEncoding(utf8(s))).toBe("utf-8");
    expect(decodeCsvBytes(utf8(s))).toBe(s);
    // As an ArrayBuffer, as FileReader gives it.
    expect(decodeCsvBytes(utf8(s).buffer as ArrayBuffer)).toBe(s);
  });
  it("drops the byte-order mark Excel's 'CSV UTF-8' puts at the start", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8("email\nzoe@x.co\n")]);
    expect(decodeCsvBytes(bytes)).toBe("email\nzoe@x.co\n");
  });
  it("an empty file is empty text", () => {
    expect(decodeCsvBytes(new Uint8Array())).toBe("");
  });
});

describe("one email per inbox", () => {
  it("keeps the first donor for each address, compared trimmed and in lower case", () => {
    const rows = [{ id: "me", email: "sarah@x.co" }, { id: "my company", email: " SARAH@x.co " }, { id: "ben", email: "ben@x.co" }, { id: "none", email: null }];
    expect(onePerAddress(rows, (r) => r.email).map((r) => r.id)).toEqual(["me", "ben", "none"]);
    expect(inboxKey(" Sarah@X.co ")).toBe("sarah@x.co");
  });
});

describe("reading every page", () => {
  it("reads past the 1 000 rows one answer holds, and stops on a short page", async () => {
    const all = Array.from({ length: 2 * PAGE_ROWS + 5 }, (_, i) => i);
    const asked: [number, number][] = [];
    const rows = await readPages<number>(async (from, to) => (asked.push([from, to]), { data: all.slice(from, to + 1), error: null }));
    expect(rows).toEqual(all);
    expect(asked).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
  it("a database error is thrown, never taken as 'no more rows'", async () => {
    await expect(readPages(async () => ({ data: null, error: { message: "down" } }))).rejects.toEqual({ message: "down" });
  });
});

describe("names set apart in sentences on the dashboard", () => {
  it("wraps a name in the Unicode isolates, the plain-string <bdi>", () => {
    expect(isolate("Thandi")).toBe("⁨Thandi⁩");
    expect(describeDone("gift_recorded", { amount: "R250", name: "Sipho Ndlovu", date: "01/11/2026" }, ctx).what).toBe("R250 from ⁨Sipho Ndlovu⁩ on 01/11/2026 is recorded.");
    expect(describeDone("certificate_declined", { name: "Acme (Pty) Ltd", emailed: "no_address" }, ctx).what).toContain("for ⁨Acme (Pty) Ltd⁩.");
    // Without a name, the plain words: nothing to set apart.
    expect(describeDone("gift_recorded", { amount: "R250", date: "01/11/2026" }, ctx).what).toBe("R250 from your donor on 01/11/2026 is recorded.");
  });
});

describe("removing an email from a journey", () => {
  it("while people are part way, only the last email can be removed; with nobody on it, any", () => {
    expect(partWay([{ status: "active" }, { status: "finished" }, { status: "stopped" }, { status: "active" }])).toBe(2);
    expect(canRemoveStep(1, 4, 2)).toBe(false);
    expect(canRemoveStep(3, 4, 2)).toBe(true);
    expect(canRemoveStep(1, 4, 0)).toBe(true);
    expect(middleStepWords(1)).toMatch(/^1 person is part way through this journey, so only the last email can be removed/);
    expect(middleStepWords(3)).toMatch(/^3 people are part way/);
    expect(middleStepWords(3)).not.toMatch(/[!—]/);
  });
  it("saving notices when a saved email would move to another number", () => {
    expect(stepsShifted([0, 1, 2])).toBe(false);
    // The last removed, or a new one added at the end: nothing moves.
    expect(stepsShifted([0, 1])).toBe(false);
    expect(stepsShifted([0, 1, 2, null])).toBe(false);
    // Email 2 removed: emails 3 and 4 move up.
    expect(stepsShifted([0, 2, 3])).toBe(true);
    expect(stepsShifted([0, 2, null])).toBe(true);
  });
});

describe("the monthly thank-you and donors already messaged this week", () => {
  it("says they haven't had it yet, and when Send the rest can reach them", () => {
    const d = describeDone("thank_you_sent", { month: "October 2026", sent: 18, failed: 0, remaining: 0, thisWeek: 2, from: "16/11/2026" }, ctx);
    expect(d.what).toBe(
      "Your thank-you for October 2026 went to 18 donors. 2 donors already had a message from you this week, so haven't had it yet. Givezy sends each donor at most one message a week from your charity. Press Send the rest from Monday 16/11/2026 to reach them all.",
    );
    expect(d.next).toEqual({ label: "Send the rest from Monday 16/11/2026", href: "/charity-admin/c1/thank-donors#unfinished" });
    expect(d.what).not.toMatch(/[!—]/);
  });
  it("with nobody left out, the usual words", () => {
    const d = describeDone("thank_you_sent", { month: "October 2026", sent: 18, failed: 1 }, ctx);
    expect(d.what).toBe("Your thank-you for October 2026 went to 18 donors. 1 email could not be sent.");
    expect(d.next).toEqual({ label: "See who gave", href: "/charity-admin/c1/donors" });
  });
});
