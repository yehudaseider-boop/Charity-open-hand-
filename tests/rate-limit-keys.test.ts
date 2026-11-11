import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
const { addressForLimits, hashedKey, ipKeys } = await import("@/lib/rate-limit");

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

  it("on the live or test site with no secret, skips the address limits (and says so once) rather than store an unkeyed hash", () => {
    vi.stubEnv("ENCRYPTION_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(ipKeys("196.25.1.200")).toEqual([]);
    expect(hashedKey("email", "a@b.co")).toBeNull();
    expect(err).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });
});

describe("which part of an address counts as one visitor", () => {
  it("counts an IPv4 address as itself", () => {
    expect(addressForLimits("196.25.1.200")).toBe("196.25.1.200");
    expect(addressForLimits("::ffff:196.25.1.200")).toBe("196.25.1.200");
  });

  it("counts an IPv6 address by its /64 block, however it is written", () => {
    expect(addressForLimits("2c0f:f4c0:1:2:aaaa:bbbb:cccc:dddd")).toBe("2c0f:f4c0:1:2::/64");
    expect(addressForLimits("2C0F:F4C0:0001:0002::1")).toBe("2c0f:f4c0:1:2::/64");
    expect(addressForLimits("2c0f:f4c0::1")).toBe("2c0f:f4c0:0:0::/64");
    expect(addressForLimits("[2c0f:f4c0:1:2::5]")).toBe("2c0f:f4c0:1:2::/64");
    expect(addressForLimits("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
  });

  it("gives every address in one IPv6 /64 the same key, and a different /64 another", () => {
    vi.stubEnv("ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    expect(ipKeys("2c0f:f4c0:1:2::1")).toEqual(ipKeys("2c0f:f4c0:1:2:ffff::9"));
    expect(ipKeys("2c0f:f4c0:1:3::1")).not.toEqual(ipKeys("2c0f:f4c0:1:2::1"));
  });
});
