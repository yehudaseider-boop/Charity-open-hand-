// @vitest-environment jsdom
/**
 * Found in a "try to break it" pass on the test site (21/11/2026), with Wi-Fi off and a refresh part-way:
 * - Sign in: pressing "Email me a sign-in code" offline replaced the page with "this page couldn't open" and lost
 *   the email. A SafeForm keeps the form and says what happened.
 * - Find a charity: typing a search offline sent the browser to its own "No internet" page. The box now keeps what
 *   was typed, says it is offline, and searches once the connection is back.
 * - The give form: a refresh part-way kept every box but the amount. The amount now goes in the address as it is
 *   chosen (only one the page would take back).
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { platformConfig } from "@/config/platform";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const replaced: string[] = [];
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: (u: string) => replaced.push(u) }) }));
vi.mock("@/app/c/[slug]/donate/actions", () => ({ submitDonation: async () => ({ ok: false }) }));
vi.mock("@/components/forms/use-form-draft", () => ({ useFormDraft: () => {}, ClearFormDraft: () => null }));
vi.mock("@/components/legal", () => ({ SupportContact: () => null, TermsAndPrivacyLinks: () => null }));

const { connectionTroubleMessage } = await import("@/components/forms/action-form");
const { SafeForm } = await import("@/components/forms/safe-form");
const { PendingButton } = await import("@/components/forms/pending-button");
const { CharitySearch } = await import("@/components/charity-search");
const { DonateFlow } = await import("@/app/c/[slug]/donate/donate-flow");

let root: Root;
let host: HTMLDivElement;
let online = true;
beforeEach(() => {
  online = true;
  replaced.length = 0;
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function goOffline(off: boolean) {
  online = !off;
  await act(async () => window.dispatchEvent(new Event(off ? "offline" : "online")));
}

describe("connectionTroubleMessage", () => {
  it("says offline plainly, and that what was typed is kept", () => {
    online = false;
    expect(connectionTroubleMessage(new TypeError("Failed to fetch"))).toBe(
      "You're offline, so this wasn't sent. What you typed is still here. Check your connection and try again.",
    );
    online = true;
    expect(connectionTroubleMessage(new Error("500"))).toContain("What you typed is still here.");
  });

  it("passes Next's own redirects on, never swallowing them", () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login?sent=1;307;" });
    expect(() => connectionTroubleMessage(redirect)).toThrow(redirect);
  });
});

describe("SafeForm (Sign in)", () => {
  it("keeps the form and what was typed when sending fails offline, and can be sent again", async () => {
    let calls = 0;
    const action = async () => {
      calls++;
      throw new TypeError("Failed to fetch");
    };
    await act(async () => {
      root.render(
        createElement(
          SafeForm as unknown as React.FC<{ action: typeof action }>,
          { action },
          createElement("input", { name: "email", defaultValue: "" }),
          createElement(PendingButton as unknown as React.FC<{ pendingLabel: string }>, { pendingLabel: "Sending…" }, "Email me a sign-in code"),
        ),
      );
    });
    const email = host.querySelector<HTMLInputElement>("input[name=email]")!;
    await type(email, "thandi@example.co.za");
    online = false;
    await act(async () => host.querySelector("form")!.requestSubmit());
    expect(calls).toBe(1);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("You're offline, so this wasn't sent.");
    expect(host.querySelector<HTMLInputElement>("input[name=email]")!.value).toBe("thandi@example.co.za");
    expect(host.querySelector("button")!.disabled).toBe(false);
    online = true;
    await act(async () => host.querySelector("form")!.requestSubmit());
    expect(calls).toBe(2);
  });
});

describe("CharitySearch offline", () => {
  it("doesn't search while offline, says so, and searches once back online", async () => {
    vi.useFakeTimers();
    await act(async () => root.render(createElement(CharitySearch, { initial: "", category: "" })));
    await goOffline(true);
    const box = host.querySelector<HTMLInputElement>("#q")!;
    await type(box, "meals");
    await act(async () => vi.advanceTimersByTime(1000));
    expect(replaced).toEqual([]);
    expect(box.value).toBe("meals");
    expect(host.querySelector('[role="status"]')?.textContent).toContain("You're offline, so the list can't update.");
    // Search (or Enter) offline stays on the page instead of the browser's "No internet" page.
    const submit = new Event("submit", { bubbles: true, cancelable: true });
    await act(async () => host.querySelector("form")!.dispatchEvent(submit));
    expect(submit.defaultPrevented).toBe(true);

    await goOffline(false);
    await act(async () => vi.advanceTimersByTime(1000));
    expect(replaced).toEqual(["/charities?q=meals"]);
    expect(host.textContent).not.toContain("You're offline");
  });
});

describe("the give form's amount survives a refresh", () => {
  beforeEach(async () => {
    window.history.replaceState(null, "", "/c/meals/donate?amount=250&from=app");
    await act(async () => {
      root.render(createElement(DonateFlow, { slug: "meals", charityName: "Meals for All", receiptsAvailable: false, minimumLabel: "R30", contributionMinimumLabel: "R10", fromApp: true, suggestedCents: [10_000, 25_000] }));
    });
  });
  const params = () => new URLSearchParams(window.location.search);

  it("puts a typed amount in the address, in cents, keeping the rest", async () => {
    await type(host.querySelector<HTMLInputElement>("#amount")!, "1 250.50");
    expect(params().get("cents")).toBe("125050");
    expect(params().get("amount")).toBeNull();
    expect(params().get("from")).toBe("app");
  });

  it("and a chosen suggested amount", async () => {
    const button = [...host.querySelectorAll("button")].find((b) => b.textContent === "R100")!;
    await act(async () => button.click());
    expect(params().get("cents")).toBe("10000");
  });

  it("takes it out for an amount the page wouldn't take back", async () => {
    const amount = host.querySelector<HTMLInputElement>("#amount")!;
    await type(amount, "500");
    expect(params().get("cents")).toBe("50000");
    for (const silly of ["", "abc", "0", String(platformConfig.maxDonationCents / 100 + 1)]) {
      await type(amount, silly);
      expect(params().get("cents")).toBeNull();
    }
  });
});
