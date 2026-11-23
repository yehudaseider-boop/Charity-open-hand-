/** A former gateway's events are still verified by its own adapter, while checkout stays on the active one (23/11/2026). */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { gatewayByName, gatewayForEvents } = await import("@/lib/gateway");

afterEach(() => vi.unstubAllEnvs());

describe("gatewayForEvents", () => {
  it("finds a gateway that is not the active one, where gatewayByName refuses", () => {
    vi.stubEnv("PAYMENT_GATEWAY", "test");
    expect(() => gatewayByName("paystack")).toThrow(/not the active gateway/);
    expect(gatewayForEvents("paystack").name).toBe("paystack");
    expect(gatewayForEvents("stitch").name).toBe("stitch");
  });

  it("still refuses a name that is no gateway at all", () => {
    expect(() => gatewayForEvents("nonsense")).toThrow(/Unknown/);
  });
});
