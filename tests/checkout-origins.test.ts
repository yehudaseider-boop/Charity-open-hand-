/** A form on our site may land on the chosen gateway's payment page, and nowhere else. */
import { describe, expect, it } from "vitest";
import { checkoutOrigins } from "@/lib/gateway/checkout-origins";

describe("payment page addresses for the security policy", () => {
  it("names only the chosen gateway's page, over https", () => {
    expect(checkoutOrigins("paystack")).toEqual(["https://checkout.paystack.com"]);
    for (const o of checkoutOrigins("paystack")) expect(o).toMatch(/^https:\/\/[a-z0-9.-]+$/);
  });
  it("adds nothing for the test gateway, an unknown name or none", () => {
    expect(checkoutOrigins("test")).toEqual([]);
    expect(checkoutOrigins(undefined)).toEqual([]);
    expect(checkoutOrigins("toString")).toEqual([]);
  });
});
