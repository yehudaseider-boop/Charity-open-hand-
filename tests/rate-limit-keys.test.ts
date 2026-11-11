import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
const { hashedKey, ipKeys } = await import("@/lib/rate-limit");

afterEach(() => vi.unstubAllEnvs());

describe("limit keys never hold the address itself", () => {
  it("keeps only a one-way stand-in for an internet address", () => {
    const [key] = ipKeys("196.25.1.200");
    expect(key).toMatch(/^ip#[A-Za-z0-9_-]{32}$/);
    expect(key).not.toContain("196");
    expect(ipKeys("196.25.1.200")).toEqual([key]);
    expect(ipKeys("196.25.1.201")).not.toEqual([key]);
  });

  it("gives no key without an address, so unknown visitors aren't all counted as one", () => {
    expect(ipKeys("")).toEqual([]);
    expect(ipKeys("unknown")).toEqual([]);
  });

  it("matches an email however it is typed", () => {
    expect(hashedKey("email", " Donor@Example.com ")).toBe(hashedKey("email", "donor@example.com"));
    expect(hashedKey("email", "donor@example.com")).not.toContain("donor");
  });

  it("uses the server's secret when it is set, so a stand-in can't be worked back by trying addresses", () => {
    const plain = hashedKey("ip", "10.0.0.1");
    vi.stubEnv("ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    expect(hashedKey("ip", "10.0.0.1")).not.toBe(plain);
  });
});
