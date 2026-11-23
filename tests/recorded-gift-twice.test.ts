/**
 * The same recorded gift saved twice (a quick double press, or two people at once), and a charity's bank columns
 * written straight through the database API (code review, 23/11/2026). The database itself is checked in
 * recorded-gifts-db.test.ts and onboarding.test.ts; this checks what the website says, and that the migration holds
 * both guards, for runs without the local database.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
let rpcError: { message: string } | null = null;
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: "approved" }, error: null }) }) }) }),
    rpc: async () => ({ data: rpcError ? null : { import_id: null, donation_ids: ["d1"] }, error: rpcError }),
  }),
}));

const { recordGifts } = await import("@/lib/charity/recorded-gifts-store");

const gift = {
  donorType: "individual" as const, email: "a@x.test", firstName: "A", lastName: "B", organisationName: null, registrationNumber: null, phone: null,
  amountCents: 2500, date: "2026-03-05", method: "eft" as const, wants18a: false, campaignId: null, reference: null,
  idNumber: null, taxReference: null, addressLine1: null, addressLine2: null, suburb: null, city: null, postalCode: null, campaign: null,
};

beforeEach(() => {
  rpcError = null;
});

describe("the database refusing the same recorded gift twice", () => {
  it("shows the website's own message for one gift, and says nothing was recorded", async () => {
    rpcError = { message: "recorded_gift_twice: this gift is already recorded (the same email, amount and date)" };
    expect(await recordGifts({ charityId: "c1", userId: "u1", gifts: [gift] as never })).toEqual({
      ok: false,
      message: "You've already recorded a gift from this email for this amount on this date. If it's a second gift, add a reference (for example the bank reference) and record it again.",
    });
  });

  it("says nothing in a file was recorded", async () => {
    rpcError = { message: "recorded_gift_twice: this gift is already recorded (the same email, amount and date)" };
    const r = await recordGifts({ charityId: "c1", userId: "u1", gifts: [gift, { ...gift, email: "b@x.test" }] as never, importOf: { fileName: "f.csv", fingerprint: "a".repeat(32), confirmedAt: "2026-11-23T10:00:00Z" } });
    expect(r).toEqual({ ok: false, message: "One of these gifts is already recorded (the same email, amount and date), so nothing was recorded. Check the file again to see which." });
  });
});

describe("the migration", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261123000005_recorded_gift_and_bank_guards.sql", import.meta.url), "utf8");

  it("holds the charity while record_gifts looks again for the same gift, and keeps it the server's", () => {
    const body = sql.slice(sql.indexOf("create or replace function public.record_gifts"), sql.indexOf("-- 2 ---"));
    expect(body).toMatch(/pg_advisory_xact_lock\(hashtext\('record_gifts:' \|\| p_charity_id::text\)\)/);
    expect(body.indexOf("pg_advisory_xact_lock")).toBeLessThan(body.indexOf("recorded_gift_twice"));
    expect(body).toContain("set search_path = ''");
    expect(body).toMatch(/revoke execute on function public\.record_gifts\(uuid, uuid, jsonb, jsonb\) from public, anon, authenticated;/);
    expect(body).toMatch(/grant execute on function public\.record_gifts\(uuid, uuid, jsonb, jsonb\) to service_role;/);
  });

  it("leaves browsers only the contact and donation emails columns of charity_private to update", () => {
    expect(sql).toMatch(/revoke update on public\.charity_private from anon, authenticated;/);
    const grant = /grant update \(([^)]*)\) on public\.charity_private to authenticated;/.exec(sql);
    expect(grant?.[1].split(",").map((c) => c.trim()).sort()).toEqual(["contact_email", "contact_name", "contact_phone", "notify_donations"]);
  });
});
