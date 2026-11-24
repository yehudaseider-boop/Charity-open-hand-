/**
 * The thank-you page's gift lines on a phone (24/11/2026): beside a long charity name, "R1 250" broke over two lines
 * and "Dedication" broke mid-word. Amounts and labels must never wrap; the long text beside them does.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync("src/app/donate/return/page.tsx", "utf8");
const table = src.slice(src.indexOf('<dl className="space-y-1.5 rounded-control border-2'), src.indexOf("</dl>"));

describe("the paid gift's lines", () => {
  it("never wrap an amount", () => {
    for (const field of ["d.amount_cents", "d.contribution_cents", "d.processing_charge_cents"]) {
      const at = table.indexOf(`{formatRand(${field})}`);
      expect(at, field).toBeGreaterThan(0);
      const dd = table.lastIndexOf("<dd", at);
      expect(table.slice(dd, at), field).toMatch(/shrink-0 whitespace-nowrap/);
    }
    expect(table).toContain('<span className="whitespace-nowrap">{formatRand(d.total_charged_cents)}</span>');
  });

  it("keeps the short labels whole and lets the long text beside them wrap", () => {
    for (const label of ["Paid", "Reference", "Dedication"]) expect(table).toContain(`<dt className="shrink-0">${label}</dt>`);
    expect(table).toMatch(/<dt className="min-w-0">Donation to <bdi>/);
  });
});
