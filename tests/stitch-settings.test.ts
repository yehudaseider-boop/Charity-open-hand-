/** The Stitch parts around the adapter: the settings check, the payment page origin, and what a gateway that can't save cards says. */
import { describe, expect, it } from "vitest";
import { checkoutOrigins } from "@/lib/gateway/checkout-origins";
import { gatewaySettings } from "@/lib/gateway/settings";

describe("the settings check for Stitch", () => {
  const ok = { PAYMENT_GATEWAY: "stitch", STITCH_CLIENT_ID: "id", STITCH_CLIENT_SECRET: "secret", STITCH_WEBHOOK_SECRET: "whsec_abc", STITCH_SPLITS: "yes", STITCH_SAVED_CARDS: "yes" };
  const status = (env: Record<string, string | undefined>, name: string) => gatewaySettings(env, "test").find((c) => c.name === name)?.status;

  it("is all fine with everything set", () => {
    expect(gatewaySettings(ok, "test").every((c) => c.status === "ok")).toBe(true);
  });

  it("asks for what is missing, and never shows a value", () => {
    expect(status({ PAYMENT_GATEWAY: "stitch" }, "STITCH_CLIENT_ID")).toBe("fix");
    expect(status({ PAYMENT_GATEWAY: "stitch" }, "STITCH_CLIENT_SECRET")).toBe("fix");
    expect(status({ PAYMENT_GATEWAY: "stitch" }, "STITCH_WEBHOOK_SECRET")).toBe("fix");
    expect(status({ ...ok, STITCH_WEBHOOK_SECRET: "not-a-signing-secret" }, "STITCH_WEBHOOK_SECRET")).toBe("fix");
    expect(status({ ...ok, STITCH_SPLITS: undefined }, "STITCH_SPLITS")).toBe("later");
    expect(status({ ...ok, STITCH_SAVED_CARDS: undefined }, "STITCH_SAVED_CARDS")).toBe("later");
    expect(JSON.stringify(gatewaySettings({ ...ok, STITCH_CLIENT_SECRET: "super-secret-value" }, "test"))).not.toContain("super-secret-value");
  });

  it("test gateway leftovers are a fix, Paystack's are only a note while it stays as the fallback", () => {
    expect(status({ ...ok, ALLOW_TEST_GATEWAY: "yes" }, "ALLOW_TEST_GATEWAY")).toBe("fix");
    expect(status({ ...ok, PAYSTACK_SECRET_KEY: "sk_test_x" }, "PAYSTACK_SECRET_KEY")).toBe("later");
  });

  it("an unknown gateway name still says which ones exist", () => {
    expect(gatewaySettings({ PAYMENT_GATEWAY: "nope" }, "test")[0].says).toMatch(/test, paystack or stitch/);
  });
});

describe("the payment page origin", () => {
  it("is Stitch's page when Stitch is the gateway, and nothing for an unknown one", () => {
    expect(checkoutOrigins("stitch")).toEqual(["https://secure.stitch.money"]);
    expect(checkoutOrigins("paystack")).toEqual(["https://checkout.paystack.com"]);
    expect(checkoutOrigins("nope")).toEqual([]);
  });
});
