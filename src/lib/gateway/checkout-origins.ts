/**
 * Where each gateway's own payment page lives. Dependency-free: next.config.ts reads it to allow a form on our
 * site to land on that page. A tap on "Pay" before the page has finished loading is an ordinary form post,
 * and the browser follows our redirect to the payment page only if the security policy names its address.
 * (The test gateway's page is on our own site.)
 */
export const CHECKOUT_ORIGINS: Record<string, string[]> = {
  paystack: ["https://checkout.paystack.com"],
  test: [],
};

/** The payment page addresses for the gateway chosen by PAYMENT_GATEWAY. */
export function checkoutOrigins(gateway: string | undefined): string[] {
  const name = gateway ?? "test";
  return Object.hasOwn(CHECKOUT_ORIGINS, name) ? CHECKOUT_ORIGINS[name] : [];
}
