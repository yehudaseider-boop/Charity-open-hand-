/**
 * A receipt email that may already have gone is never sent again by a run (13/11/2026): once the send was cut off or
 * dropped mid-way and flagged for a person ("unknown" in the email retries), claiming it fails, however old the claim
 * is. Before, a claim older than 15 minutes was taken over and the receipt emailed a second time.
 */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseReceiptStore } from "@/lib/receipts/store";
import type { IssuedReceipt } from "@/lib/receipts/issue";

function fakeDb(opts: { flagged: boolean }) {
  const claims: unknown[] = [];
  const from = (table: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "or", "order", "range"]) q[m] = () => q;
    q.update = (row: unknown) => (claims.push(row), q);
    q.limit = async () => ({ data: table === "email_retries" && opts.flagged ? [{ id: 1 }] : [], error: null });
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: table === "s18a_receipts" ? [{ id: "r1" }] : [], error: null }).then(ok);
    return q;
  };
  return { db: { from } as unknown as SupabaseClient, claims };
}

const receipt = { id: "r1", charityId: "c1", reference: "NMF-2027-0001", details: {}, pdfPath: "c1/r1.pdf" } as unknown as IssuedReceipt;

describe("claiming a receipt email", () => {
  it("a receipt whose send may have gone is never claimed again", async () => {
    const { db, claims } = fakeDb({ flagged: true });
    expect(await supabaseReceiptStore(db).claimEmail(receipt)).toBe(false);
    expect(claims).toHaveLength(0);
  });

  it("any other receipt is claimed as before", async () => {
    const { db, claims } = fakeDb({ flagged: false });
    expect(await supabaseReceiptStore(db).claimEmail(receipt)).toBe(true);
    expect(claims).toHaveLength(1);
  });
});
