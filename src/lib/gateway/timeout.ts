import { AsyncLocalStorage } from "node:async_hooks";

/**
 * A shorter wait for the payment provider inside one piece of work (the daily job, review 12/11/2026): one slow call
 * must not push the job past its minute before the team's email goes. Outside such work the adapter's own limit applies.
 */
const store = new AsyncLocalStorage<number>();

export function withGatewayTimeout<T>(ms: number, run: () => Promise<T>): Promise<T> {
  return store.run(ms, run);
}

/** The wait set by withGatewayTimeout around this call, if any. */
export function gatewayTimeoutOverride(): number | undefined {
  return store.getStore();
}
