/** The deposit report: gift, fee and what reached the bank, line by line, and a total that matches the bank. */
import { describe, expect, it } from "vitest";
import { buildDeposit, type GiftIn } from "@/lib/charity/deposits";
import { depositsCsv } from "@/lib/charity/deposits-csv";

const gifts = new Map<string, GiftIn>([
  ["a", { id: "a", amountCents: 50_000, donorName: "Donor A", paidAt: "2026-10-20T08:00:00Z" }],
  ["b", { id: "b", amountCents: 20_000, donorName: "Donor B", paidAt: "2026-10-20T09:00:00Z" }],
  ["c", { id: "c", amountCents: 100_000, donorName: "Donor C", paidAt: "2026-10-20T10:00:00Z" }],
]);
const pay = (id: string, gross: number, fee: number) => ({ kind: "payment" as const, donationId: id, grossCents: gross, feeCents: fee, netCents: gross - fee });

describe("a deposit", () => {
  it("Juan's example (made-up fees): R1 700 of gifts, R50 of fees, R1 650 in the bank, and it adds up", () => {
    const d = buildDeposit(165_000, [pay("a", 50_000, 1_500), pay("b", 20_000, 600), pay("c", 100_000, 2_900)], gifts);
    expect(d).toMatchObject({ giftsCents: 170_000, feesCents: 5_000, netCents: 165_000, depositCents: 165_000, balances: true, problems: [] });
    expect(d.rows.map((r) => [r.donorName, r.giftCents, r.feeCents, r.netCents])).toEqual([
      ["Donor A", 50_000, 1_500, 48_500],
      ["Donor B", 20_000, 600, 19_400],
      ["Donor C", 100_000, 2_900, 97_100],
    ]);
  });

  it("a refund taken out of a later deposit is a minus line, and the deposit still adds up", () => {
    const d = buildDeposit(30_000, [pay("c", 100_000, 0), { kind: "refund", donationId: "b", grossCents: -20_000, feeCents: 0, netCents: -20_000 }], gifts);
    expect(d.netCents).toBe(80_000);
    expect(d.balances).toBe(false);
    const ok = buildDeposit(80_000, [pay("c", 100_000, 0), { kind: "refund", donationId: "b", grossCents: -20_000, feeCents: 0, netCents: -20_000 }], gifts);
    expect(ok.balances).toBe(true);
    expect(ok.rows[1]).toMatchObject({ kind: "refund", giftCents: -20_000, netCents: -20_000, problem: null });
  });

  it("says plainly when the provider's figure doesn't match the gift less its fee (for example the contribution was included)", () => {
    const d = buildDeposit(52_500, [{ kind: "payment", donationId: "a", grossCents: 54_000, feeCents: 1_500, netCents: 52_500 }], gifts);
    expect(d.balances).toBe(false);
    expect(d.problems[0]).toBe("R500 gift less a R15 fee should be R485, but the payment provider shows R525. Tell us and we'll look into it.");
  });

  it("says plainly when a line isn't one of the charity's gifts, or the lines don't add up to the deposit", () => {
    const d = buildDeposit(10_000, [{ kind: "payment", donationId: null, grossCents: 9_000, feeCents: 0, netCents: 9_000 }], gifts);
    expect(d.rows[0]).toMatchObject({ donorName: "Not one of your Givezy gifts", giftCents: null });
    expect(d.problems).toEqual([
      "The payment provider lists this, but it doesn't match a gift on Givezy. Tell us and we'll look into it.",
      "The lines add up to R90, but the deposit is R100. Tell us and we'll look into it.",
    ]);
  });

  it("an empty deposit of R0 adds up; never a float anywhere", () => {
    const d = buildDeposit(0, [], gifts);
    expect(d).toMatchObject({ giftsCents: 0, feesCents: 0, netCents: 0, balances: true });
    const many = buildDeposit(1_000 * 1, Array.from({ length: 1000 }, () => pay("a", 1, 0)).map((l) => ({ ...l, grossCents: 1, netCents: 1 })), new Map([["a", { ...gifts.get("a")!, amountCents: 1 }]]));
    expect(many.netCents).toBe(1000);
    expect(Number.isInteger(many.giftsCents)).toBe(true);
  });

  it("downloads line by line for a spreadsheet, amounts as 1250.00", () => {
    const d = buildDeposit(165_000, [pay("a", 50_000, 1_500), pay("b", 20_000, 600), pay("c", 100_000, 2_900)], gifts);
    const csv = depositsCsv([{ id: "p1", paidOutOn: "2026-10-21", status: "paid", amountCents: 165_000, deposit: d }]);
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe("Deposit date,Deposit total (R),Donor,What,Reference,Gift (R),Fee (R),Reached the bank (R),Adds up");
    expect(lines[1]).toMatch(/^21\/10\/2026,1650\.00,Donor A,Gift,GZ-[0-9A-F]+,500\.00,15\.00,485\.00,Yes$/);
    expect(lines).toHaveLength(4);
  });
});
