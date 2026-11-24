/**
 * Who is signed in, asked once before every signed-in page (24/11/2026, dashboard speed). The person's role, charities
 * and agreement are read while Supabase confirms the sign-in, not after it; nothing read is used unless the confirmed
 * person is the one the token named, and a password sign-in is still refused. Rounds of trips: tests/stubs/round-trips.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerWith, fakeDb, has, nextRound, rounds, type Answer } from "./stubs/round-trips";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { url }); } }));
vi.mock("@/lib/mfa", () => ({ requireSecondStep: async () => {} }));
vi.mock("@/lib/current-path", () => ({ currentNext: async (next: string) => next }));

const session = { claims: null as Record<string, unknown> | null, user: null as { id: string; email: string } | null };
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    ...fakeDb,
    auth: {
      // Checked against the project's signing keys where the page runs: no trip.
      getClaims: async () => (session.claims ? { data: { claims: session.claims }, error: null } : { data: null, error: new Error("no session") }),
      // A trip to Supabase's sign-in service.
      getUser: () => nextRound(() => ({ data: { user: session.user }, error: null })),
    },
  }),
}));

const { getViewer } = await import("@/lib/auth");

const rows: Answer = (table, calls) => {
  if (table === "profiles") return { data: { role: has(calls, "eq", "id", "admin") ? "platform_admin" : "donor" }, error: null };
  if (table === "charity_admins") return { data: has(calls, "eq", "user_id", "u1") ? [{ charity_id: "c1", charities: { id: "c1", name_en: "Meals", status: "approved" } }] : [], error: null };
  if (table === "consents") return { data: { id: "k1" }, error: null };
  return { data: null, error: null };
};

beforeEach(() => {
  session.claims = { sub: "u1", amr: [{ method: "otp" }] };
  session.user = { id: "u1", email: "me@x.test" };
  answerWith(rows);
});

describe("who is signed in", () => {
  it("is known after one round, not two", async () => {
    const { result, rounds: n } = await rounds(() => getViewer());
    expect(n).toBe(1);
    expect(result).toMatchObject({ userId: "u1", email: "me@x.test", isPlatformAdmin: false, managedCharityIds: ["c1"], agreedToCurrentPolicy: true });
  });

  it("still refuses a password sign-in, and a visitor is nobody", async () => {
    session.claims = { sub: "u1", amr: [{ method: "password" }] };
    expect((await rounds(() => getViewer())).result).toBeNull();
    session.claims = null;
    session.user = null;
    expect((await rounds(() => getViewer())).result).toBeNull();
  });

  // Changed 24/11/2026 (sign-in review): both are refused now, never let through, since the password check reads
  // the token. Nothing the early reads found is used for anyone.
  it("refuses a token that names someone other than the person Supabase confirms", async () => {
    session.claims = { sub: "u1", amr: [] };
    session.user = { id: "admin", email: "ops@x.test" };
    const { result } = await rounds(() => getViewer());
    expect(result).toBeNull();
  });

  it("refuses when the token can't be checked here, even if the sign-in service knows the person", async () => {
    session.claims = null;
    const { result } = await rounds(() => getViewer());
    expect(result).toBeNull();
  });
});
