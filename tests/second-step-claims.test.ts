import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

const { passedSecondStep } = await import("@/lib/mfa");

const client = (result: { data: { claims: Record<string, unknown> } | null; error: unknown }) =>
  ({ auth: { getClaims: async () => result } }) as never;

describe("passed the second step", () => {
  it("only when the verified sign-in says aal2", async () => {
    expect(await passedSecondStep(client({ data: { claims: { aal: "aal2" } }, error: null }))).toBe(true);
    expect(await passedSecondStep(client({ data: { claims: { aal: "aal1" } }, error: null }))).toBe(false);
    expect(await passedSecondStep(client({ data: { claims: {} }, error: null }))).toBe(false);
  });
  it("never when the sign-in can't be verified", async () => {
    expect(await passedSecondStep(client({ data: { claims: { aal: "aal2" } }, error: new Error("bad signature") }))).toBe(false);
    expect(await passedSecondStep(client({ data: null, error: null }))).toBe(false);
  });
});
