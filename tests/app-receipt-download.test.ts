/** The phone app's s18A receipt download: only the signed-in donor's own issued receipt (11/11/2026). */
import { describe, expect, it } from "vitest";
import { requestReceiptLink } from "../apps/mobile/src/lib/pay-api";
import { decideReceiptDownload, RECEIPT_UNAVAILABLE, type ReceiptForDownload } from "@/lib/receipts/app-download";

const ID = "11111111-2222-4333-8444-555555555555";
const mine: ReceiptForDownload = { id: ID, status: "issued", pdfPath: "c1/2027/r1.pdf", charityId: "c1", donorUserId: "me" };
const loader = (r: ReceiptForDownload | null) => async (id: string) => (r && r.id === id ? r : null);

describe("app receipt download", () => {
  it("hands out the donor's own issued receipt", async () => {
    expect(await decideReceiptDownload(ID, "me", loader(mine))).toEqual({ ok: true, pdfPath: "c1/2027/r1.pdf", charityId: "c1" });
  });

  it("refuses another donor's receipt", async () => {
    expect(await decideReceiptDownload(ID, "someone-else", loader(mine))).toEqual({ ok: false, reason: "not-yours" });
  });

  it("refuses a receipt with no signed-in donor behind it (a guest gift)", async () => {
    expect(await decideReceiptDownload(ID, "me", loader({ ...mine, donorUserId: null }))).toEqual({ ok: false, reason: "not-yours" });
  });

  it("refuses withdrawn receipts and ones without a PDF yet", async () => {
    expect(await decideReceiptDownload(ID, "me", loader({ ...mine, status: "void" }))).toEqual({ ok: false, reason: "unavailable" });
    expect(await decideReceiptDownload(ID, "me", loader({ ...mine, pdfPath: null }))).toEqual({ ok: false, reason: "unavailable" });
  });

  it("refuses a missing receipt and anything that isn't a receipt id, without asking the database", async () => {
    expect(await decideReceiptDownload(ID, "me", loader(null))).toEqual({ ok: false, reason: "not-found" });
    let asked = 0;
    const counting = async () => (asked++, mine);
    for (const bad of [undefined, null, 42, "", "abc", `${ID}' or 1=1`, [ID], { id: ID }]) {
      expect((await decideReceiptDownload(bad, "me", counting)).ok).toBe(false);
    }
    expect(asked).toBe(0);
  });

  it("tells the app the same plain message whatever the reason", () => {
    expect(RECEIPT_UNAVAILABLE).not.toMatch(/someone|another|owner|[!—]/i);
  });
});


describe("the app asking for a receipt link", () => {
  it("sends the sign-in token to our server and opens only an https link", async () => {
    let sent: { url: string; body: unknown; token?: string | null } | null = null;
    const ok = await requestReceiptLink("https://givezy.test/", "r1", "tok", async (url, body, token) => ((sent = { url, body, token }), { status: 200, json: { ok: true, url: "https://storage.test/r1.pdf?token=x" } }));
    expect(ok).toEqual({ ok: true, url: "https://storage.test/r1.pdf?token=x" });
    expect(sent).toEqual({ url: "https://givezy.test/api/app/receipt", body: { id: "r1" }, token: "tok" });
    expect((await requestReceiptLink("https://givezy.test", "r1", "tok", async () => ({ status: 200, json: { ok: true, url: "javascript:alert(1)" } }))).ok).toBe(false);
    expect((await requestReceiptLink("https://givezy.test", "r1", "tok", async () => ({ status: 200, json: { ok: true, url: "http://storage.test/r1.pdf" } }))).ok).toBe(false);
  });

  it("passes on the server's plain message, or a connection message when offline", async () => {
    expect(await requestReceiptLink("https://givezy.test", "r1", "tok", async () => ({ status: 404, json: { ok: false, message: RECEIPT_UNAVAILABLE } }))).toEqual({ ok: false, message: RECEIPT_UNAVAILABLE });
    expect(await requestReceiptLink("https://givezy.test", "r1", "tok", async () => { throw new Error("offline"); })).toMatchObject({ ok: false, message: expect.stringContaining("connection") });
  });
});
