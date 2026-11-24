/**
 * Speed of the sign-in checks (24/11/2026). A signed-in dashboard page used to wait for Supabase's sign-in service in
 * the proxy, then again in the page, then for the access checks one trip later. Now the proxy checks the token's
 * signature itself, the page's access checks run while the sign-in is confirmed, and the header's own question needs
 * no sign-in trip. Nothing is weakened: a stranger, a revoked session and a password sign-in are still refused. Rounds
 * of trips: tests/stubs/round-trips.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerWith, fakeDb, has, nextRound, rounds, sent, type Answer } from "./stubs/round-trips";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));
vi.mock("@/lib/mfa", () => ({ requireSecondStep: async () => {} }));
vi.mock("@/lib/current-path", () => ({ currentNext: async (next: string) => next }));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeDb }));

const session = { claims: null as Record<string, unknown> | null, user: null as { id: string; email: string } | null, getUserCalls: 0, getClaimsCalls: 0 };
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    ...fakeDb,
    auth: {
      getClaims: async () => {
        session.getClaimsCalls++;
        return session.claims ? { data: { claims: session.claims }, error: null } : { data: null, error: new Error("no session") };
      },
      // A trip to Supabase's sign-in service.
      getUser: () => {
        session.getUserCalls++;
        return nextRound(() => ({ data: { user: session.user }, error: null }));
      },
    },
  }),
}));

const ID = "11111111-2222-3333-4444-555555555555";
const { loadCharityForManager } = await import("@/lib/charity/queries");
const { getViewer, getHeaderViewer } = await import("@/lib/auth");

const person = (manager: boolean): Answer => (table, calls) => {
  if (table === "rpc:is_charity_admin") return { data: manager, error: null };
  if (table === "rpc:is_platform_admin") return { data: false, error: null };
  if (table === "charity_admins") return { data: has(calls, "eq", "user_id", "u1") ? (manager ? [{ charity_id: ID, role: "admin", charities: { id: ID, name_en: "Meals", status: "approved" } }] : []) : { role: "owner" }, error: null };
  if (table === "profiles") return { data: { role: "donor" }, error: null };
  if (table === "consents") return { data: { id: "k1" }, error: null };
  if (table === "charities") return { data: { id: ID, name_en: "Meals", status: "approved" }, error: null };
  return { data: table === "charity_documents" || table === "charity_categories" ? [] : null, error: null };
};

beforeEach(() => {
  session.claims = { sub: "u1", amr: [{ method: "otp" }, { method: "totp" }], aal: "aal2" };
  session.user = { id: "u1", email: "me@x.test" };
  session.getUserCalls = 0;
  session.getClaimsCalls = 0;
  answerWith(person(true));
});

describe("a charity dashboard page, from sign-in to the charity's data", () => {
  it("takes two rounds (sign-in with the access checks, then the charity), not three", async () => {
    const { result, rounds: n } = await rounds(() => loadCharityForManager(ID));
    expect(n).toBe(2);
    expect(result.charity).toMatchObject({ id: ID });
  });

  it("shows a stranger 'not found' and reads nothing about the charity", async () => {
    answerWith(person(false));
    await expect(rounds(() => loadCharityForManager(ID))).rejects.toThrow("NEXT_NOT_FOUND");
    const tables = sent.map((s) => s.table);
    for (const t of ["charities", "charity_private", "charity_documents", "charity_categories"]) expect(tables).not.toContain(t);
  });

  it("refuses a session Supabase no longer knows even when the database would still answer for its token", async () => {
    session.user = null;
    await expect(rounds(() => loadCharityForManager(ID))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(sent.map((s) => s.table)).not.toContain("charities");
  });

  it("refuses a password sign-in even when the database would still answer for its token", async () => {
    session.claims = { sub: "u1", amr: [{ method: "password" }] };
    await expect(rounds(() => loadCharityForManager(ID))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(sent.map((s) => s.table)).not.toContain("charities");
  });
});

describe("a token that can't be checked (review 24/11/2026)", () => {
  it("is refused, never let through as \"no password\"", async () => {
    session.claims = null; // getClaims errors, while Supabase still knows the person
    expect((await rounds(() => getViewer())).result).toBeNull();
  });
  it("is refused when it names someone other than the person Supabase confirms", async () => {
    session.claims = { sub: "someone-else", amr: [{ method: "otp" }], aal: "aal2" };
    expect((await rounds(() => getViewer())).result).toBeNull();
  });
});

describe("the header's question (/api/viewer)", () => {
  it("is one round of reads and no trip to the sign-in service, not a sign-in trip plus reads", async () => {
    const { result, rounds: n } = await rounds(() => getHeaderViewer());
    expect(n).toBe(1);
    expect(session.getUserCalls).toBe(0);
    expect(result).toMatchObject({ isPlatformAdmin: false, managedCharityIds: [ID] });
  });

  it("knows nobody for a visitor or a password sign-in, and asks the database nothing", async () => {
    session.claims = { sub: "u1", amr: [{ method: "password" }] };
    expect((await rounds(() => getHeaderViewer())).result).toBeNull();
    session.claims = null;
    expect((await rounds(() => getHeaderViewer())).result).toBeNull();
    expect(sent.length).toBe(0);
  });

  it("the page's own check still asks the sign-in service", async () => {
    await rounds(() => getViewer());
    expect(session.getUserCalls).toBe(1);
  });
});
