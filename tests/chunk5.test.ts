import { inflateRawSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { appealEmail, audienceValue, checkAppeal, greetingName, parseAudience } from "@/lib/charity/appeals-rules";
import { buildDeposit, type GiftIn } from "@/lib/charity/deposits";
import { xeroStatementCsv } from "@/lib/charity/deposits-csv";
import { toXlsx } from "@/lib/xlsx";

describe("emails to donors: what was typed", () => {
  it("keeps the subject to one line and refuses empty or too long", () => {
    const r = checkAppeal({ subject: "  Winter\nparcels  ", body: "We packed 200 parcels this week, thank you." });
    expect(r).toEqual({ ok: true, subject: "Winter parcels", body: "We packed 200 parcels this week, thank you." });
    const bad = checkAppeal({ subject: "", body: "short" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.fieldErrors).sort()).toEqual(["body", "subject"]);
    expect(checkAppeal({ subject: "x".repeat(121), body: "y".repeat(20) }).ok).toBe(false);
    expect(checkAppeal({ subject: "Hi there", body: "y".repeat(5001) }).ok).toBe(false);
  });
  it("reads only known audiences, and writes them back the same way", () => {
    const id = "6F1C2A52-3B7E-4D0A-9C41-2F6E8D5B7A10";
    for (const v of ["all", "group:lapsed", `tag:${id.toLowerCase()}`, `segment:${id.toLowerCase()}`, `campaign:${id.toLowerCase()}`]) expect(audienceValue(parseAudience(v)!)).toBe(v);
    expect(parseAudience(`tag:${id}`)).toEqual({ kind: "tag", tagId: id.toLowerCase() });
    for (const bad of ["", "everyone", "group:vip", "tag:1", "campaign:x' or 1=1", "segment:"]) expect(parseAudience(bad)).toBeNull();
  });
  it("greets a person by first name, a company without one", () => {
    expect(greetingName({ donor_type: "individual", display_name: "Dana Levi" })).toBe("Dana");
    expect(greetingName({ donor_type: "company", display_name: "Acme (Pty) Ltd" })).toBeNull();
  });
  it("each email has the charity's words, its name, replies to the charity and a stop link; nothing else", () => {
    const m = appealEmail("dana@example.com", { charityName: "Meals", firstName: "Dana", subject: "Winter parcels", body: "Thank you.", stopUrl: "https://g.test/news/stop?t=abc", replyTo: "info@meals.org.za" });
    expect(m.subject).toBe("Winter parcels");
    expect(m.replyTo).toBe("info@meals.org.za");
    expect(m.text.startsWith("Dear Dana,\n\nThank you.\n\nFrom Meals")).toBe(true);
    expect(m.text).toContain("To stop news and appeals from Meals: https://g.test/news/stop?t=abc");
    expect(m.text).not.toMatch(/R\d|!/);
  });
});

describe("Excel files", () => {
  // Unzip enough to read one part back (the writer stores each part deflated).
  const part = (buf: Buffer, name: string) => {
    for (let i = 0; i < buf.length - 30; i++) {
      if (buf.readUInt32LE(i) !== 0x04034b50) continue;
      const size = buf.readUInt32LE(i + 18);
      const nameLen = buf.readUInt16LE(i + 26);
      const n = buf.subarray(i + 30, i + 30 + nameLen).toString();
      const start = i + 30 + nameLen;
      if (n === name) return inflateRawSync(buf.subarray(start, start + size)).toString();
    }
    return null;
  };
  it("is a zip with the parts Excel needs; amounts are numbers, everything else stays text", () => {
    const buf = toXlsx("Donations", ["Donor", "Phone", "Amount (R)", "Gifts"], [["=HYPERLINK(\"x\")", "082 123 4567", "1250.50", 3], ["Tom & <Jerry>", "0821234567", "-30.00", 1]], [2]);
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    for (const p of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml"]) expect(part(buf, p), p).not.toBeNull();
    const sheet = part(buf, "xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain('<c r="C2" s="2"><v>1250.50</v></c>');
    expect(sheet).toContain('<c r="C3" s="2"><v>-30.00</v></c>');
    expect(sheet).toContain('<c r="D2"><v>3</v></c>');
    // A typed "formula" is only ever text, and a phone number keeps its leading 0.
    expect(sheet).toContain("<t xml:space=\"preserve\">=HYPERLINK(&quot;x&quot;)</t>");
    expect(sheet).not.toContain("<f>");
    expect(sheet).toContain(">0821234567</t>");
    expect(sheet).toContain("Tom &amp; &lt;Jerry&gt;");
  });
});

describe("the Xero file", () => {
  const gifts = new Map<string, GiftIn>([
    ["a", { id: "a", amountCents: 50_000, donorName: "A", paidAt: null }],
    ["b", { id: "b", amountCents: 20_000, donorName: "B", paidAt: null }],
  ]);
  const summary = (id: string, status: "paid" | "pending", amount: number, lines: Parameters<typeof buildDeposit>[1]) => ({ id, paidOutOn: "2026-10-20", status, amountCents: amount, deposit: buildDeposit(amount, lines, gifts) });
  it("each paid deposit: donations in, fees out, deposit out, adding up to nothing", () => {
    const csv = xeroStatementCsv([
      summary("0f9e8d7c-0000-4000-8000-000000000001", "paid", 67_900, [
        { kind: "payment", donationId: "a", grossCents: 50_000, feeCents: 1_500, netCents: 48_500 },
        { kind: "payment", donationId: "b", grossCents: 20_000, feeCents: 600, netCents: 19_400 },
      ]),
      summary("0f9e8d7c-0000-4000-8000-000000000002", "pending", 10_000, []),
    ]);
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe("*Date,*Amount,Payee,Description,Reference");
    expect(lines.slice(1)).toEqual([
      "20/10/2026,700.00,Givezy donors,Donations in the deposit of 20/10/2026 (2 gifts),GZ-DEP-0F9E8D7C",
      "20/10/2026,-21.00,Payment provider,Card fees in the deposit of 20/10/2026,GZ-DEP-0F9E8D7C",
      "20/10/2026,-679.00,Your bank account,Deposit to your bank on 20/10/2026,GZ-DEP-0F9E8D7C",
    ]);
    const cents = lines.slice(1).map((l) => Math.round(Number(l.split(",")[1]) * 100));
    expect(cents.reduce((t, c) => t + c, 0)).toBe(0);
  });
});

describe("after sending", () => {
  it("says plainly when nobody was emailed", async () => {
    const { describeDone } = await import("@/lib/charity/done");
    const ctx = { base: "/charity-admin/c1", publicUrl: null, approved: true };
    expect(describeDone("appeal_sent", { subject: "News", sent: 0, waiting: 0, skipped: 2 }, ctx).what).toBe(
      "\"News\" is saved, but nobody was emailed: 2 donors left out (they asked not to get emails, already had 4 from you this month, or email isn't switched on here).",
    );
    expect(describeDone("appeal_sent", { subject: "News", sent: 120, waiting: 30 }, ctx).what).toBe("\"News\" went to 120 donors. 30 emails still to send: press \"Send the rest\" below.");
  });
});
