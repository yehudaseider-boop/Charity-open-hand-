import "server-only";
import { paystackGateway } from "./paystack";
import { testGateway } from "./test-gateway";
import type { PaymentGateway } from "./types";

export type { PaymentGateway } from "./types";
export { GatewayError } from "./types";

/** The gateway in use, chosen by the PAYMENT_GATEWAY environment variable. */
export function getGateway(): PaymentGateway {
  const name = process.env.PAYMENT_GATEWAY ?? "test";
  if (name === "paystack") return paystackGateway;
  if (name === "test") {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_TEST_GATEWAY !== "yes") {
      throw new Error("The test gateway is not allowed in production.");
    }
    return testGateway;
  }
  throw new Error(`Unknown PAYMENT_GATEWAY "${name}".`);
}

/** The adapter for a gateway name stored on a donation or charity. */
export function gatewayByName(name: string): PaymentGateway {
  const current = getGateway();
  if (name !== current.name) throw new Error(`Gateway "${name}" is not the active gateway.`);
  return current;
}
