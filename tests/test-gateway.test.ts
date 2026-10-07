/**
 * The stand-in gateway only acts on checkouts it signed itself.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

beforeAll(() => {
  process.env.TEST_GATEWAY_SECRET = "test-secret";
});

async function signedCheckout() {
  const { testGateway } = await import("@/lib/gateway/test-gateway");
  const { redirectUrl } = await testGateway.createCheckout({
    reference: "11111111-1111-1111-1111-111111111111",
    totalCents: 3240,
    charityShareCents: 3000,
    charityAccountRef: "test_acct_1",
    email: "donor@example.com",
    returnUrl: "/donate/return?reference=11111111-1111-1111-1111-111111111111",
    description: "Donation",
  });
  return new URL(redirectUrl, "http://localhost").searchParams;
}

describe("test gateway checkout signature", () => {
  it("accepts the checkout exactly as signed", async () => {
    const { readSignedTestCheckout } = await import("@/lib/gateway/test-gateway");
    const sp = await signedCheckout();
    const signed = readSignedTestCheckout((k) => sp.get(k), sp.get("sig"));
    expect(signed?.get("total")).toBe("3240");
  });

  it("refuses a changed amount, reference or return address", async () => {
    const { readSignedTestCheckout } = await import("@/lib/gateway/test-gateway");
    for (const [key, value] of [
      ["total", "1"],
      ["reference", "22222222-2222-2222-2222-222222222222"],
      ["return", "https://evil.example/"],
    ]) {
      const sp = await signedCheckout();
      sp.set(key, value);
      expect(readSignedTestCheckout((k) => sp.get(k), sp.get("sig"))).toBeNull();
    }
  });

  it("refuses a missing signature", async () => {
    const { readSignedTestCheckout } = await import("@/lib/gateway/test-gateway");
    const sp = await signedCheckout();
    expect(readSignedTestCheckout((k) => sp.get(k), null)).toBeNull();
  });
});
