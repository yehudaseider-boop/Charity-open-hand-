import "server-only";
import { demoModeOn, demoModeRequested } from "@/lib/demo/mode";
import { paystackGateway } from "./paystack";
import { testGateway } from "./test-gateway";
import type { PaymentGateway } from "./types";

export type { PaymentGateway } from "./types";
export { GatewayError, isGatewayRefusal } from "./types";

/** The gateway in use, chosen by the PAYMENT_GATEWAY environment variable. */
export function getGateway(): PaymentGateway {
  const name = process.env.PAYMENT_GATEWAY ?? "test";
  // The demo site charges nobody: it only ever runs the test gateway.
  if (demoModeRequested() && name !== "test") throw new Error("Demo mode only runs the test gateway.");
  if (name === "paystack") return paystackGateway;
  if (name === "test") {
    // Never on the live site: its public page would let anyone mark their own gift paid. A preview
    // or test deployment may switch it on with ALLOW_TEST_GATEWAY=yes. The demo site is a production
    // deployment of its own project, on its own made-up database: there demo mode must be on as well.
    if (process.env.VERCEL_ENV === "production" && !(demoModeOn() && process.env.ALLOW_TEST_GATEWAY === "yes")) {
      throw new Error("The test gateway is never allowed on the live site.");
    }
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
