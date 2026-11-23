import "server-only";
import { paystackGateway } from "./paystack";
import { stitchGateway } from "./stitch";
import { testGateway } from "./test-gateway";
import type { PaymentGateway } from "./types";

export type { PaymentGateway } from "./types";
export { GatewayError, isGatewayDecline, isGatewayRefusal } from "./types";

/** The gateway in use, chosen by the PAYMENT_GATEWAY environment variable. */
export function getGateway(): PaymentGateway {
  return adapterFor(process.env.PAYMENT_GATEWAY ?? "test");
}

function adapterFor(name: string): PaymentGateway {
  if (name === "paystack") return paystackGateway;
  if (name === "stitch") return stitchGateway;
  if (name === "test") {
    // Never on the live site: its public page would let anyone mark their own gift paid. A preview
    // or test deployment may switch it on with ALLOW_TEST_GATEWAY=yes.
    if (process.env.VERCEL_ENV === "production") throw new Error("The test gateway is never allowed on the live site.");
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_TEST_GATEWAY !== "yes") {
      throw new Error("The test gateway is not allowed in production.");
    }
    return testGateway;
  }
  throw new Error(`Unknown PAYMENT_GATEWAY "${name}".`);
}

/**
 * The adapter for a gateway name even when it is no longer the one used for new checkouts (23/11/2026): a refund,
 * a dispute or a late charge on a former gateway is still verified and handled by that gateway's own adapter.
 * Checkout itself never uses this: it stays on getGateway().
 */
export function gatewayForEvents(name: string): PaymentGateway {
  return adapterFor(name);
}

/** The adapter for a gateway name stored on a donation or charity. */
export function gatewayByName(name: string): PaymentGateway {
  const current = getGateway();
  if (name !== current.name) throw new Error(`Gateway "${name}" is not the active gateway.`);
  return current;
}
