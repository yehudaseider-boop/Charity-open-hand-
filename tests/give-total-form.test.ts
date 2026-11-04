// @vitest-environment jsdom
/**
 * The give form's total and the server's check at Give (04/11/2026): the form sends the figures on screen, the
 * server works the total out again (checkShownTotal, the same check startDonation runs) and refuses a total the
 * donor did not see. Driven through the real form, as a donor would: type an amount, tick the contribution, change
 * it, press Give.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkShownTotal } from "@/lib/donations/quote";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Sent = { giftCents: number; contributionCents: number; cover: boolean; shownTotalCents: number };
const sent: Sent[] = [];
/** What the server does with what it is sent: by default exactly what startDonation does. */
let server: (s: Sent) => { ok: boolean; message?: string; quote?: unknown };

vi.mock("@/app/c/[slug]/donate/actions", () => ({
  submitDonation: async (_slug: string, giftCents: number, contributionCents: number, cover: boolean, shownTotalCents: number) => {
    const s = { giftCents, contributionCents, cover, shownTotalCents };
    sent.push(s);
    const r = server(s);
    // Accepted: the real action would go on to the payment page; here the form stays, saying so.
    return r.ok ? { ok: false, message: "Accepted by the server." } : r;
  },
}));
vi.mock("@/components/forms/use-form-draft", () => ({ useFormDraft: () => {}, ClearFormDraft: () => null }));
vi.mock("@/components/legal", () => ({ SupportContact: () => null, TermsAndPrivacyLinks: () => null }));

const { DonateFlow } = await import("@/app/c/[slug]/donate/donate-flow");

let root: Root;
let host: HTMLDivElement;
beforeEach(async () => {
  sent.length = 0;
  server = (s) => checkShownTotal(s.giftCents, s.contributionCents, s.cover, s.shownTotalCents);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(DonateFlow, { slug: "meals", charityName: "Meals for All", receiptsAvailable: false, minimumLabel: "R30", contributionMinimumLabel: "R10", fromApp: false, initialAmountCents: 25_000 }),
    );
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const $ = <T extends Element>(sel: string) => host.querySelector<T>(sel)!;
async function type(sel: string, value: string) {
  const input = $<HTMLInputElement>(sel);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function tick(name: string) {
  await act(async () => $<HTMLInputElement>(`input[name="${name}"]`).click());
}
const giveButton = () => [...host.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Give"))!;
async function give() {
  await act(async () => {
    $<HTMLFormElement>("form").requestSubmit();
  });
}
const alertText = () => host.querySelector('[role="alert"]')?.textContent ?? "";

describe("the form sends the total on screen, and the server's own re-quote agrees", () => {
  it("with the contribution added and then changed", async () => {
    expect(giveButton().textContent).toBe("Give R250");
    await tick("give_extra");
    await type("#contribution", "10");
    expect(giveButton().textContent).toBe("Give R260");
    await give();
    expect(sent.at(-1)).toEqual({ giftCents: 25_000, contributionCents: 1_000, cover: false, shownTotalCents: 26_000 });
    expect(alertText()).toContain("Accepted by the server.");

    // The donor changes the contribution: the button follows, and what is sent still matches the server's sum.
    await type("#contribution", "25.50");
    expect(giveButton().textContent).toBe("Give R275.50");
    await give();
    expect(sent.at(-1)).toEqual({ giftCents: 25_000, contributionCents: 2_550, cover: false, shownTotalCents: 27_550 });
    expect(alertText()).toContain("Accepted by the server.");
  });
});

describe("a total the server refuses", () => {
  it("shows the server's figures and message, sends exactly those next time, and goes back to the live total once the donor edits", async () => {
    await tick("give_extra");
    await type("#contribution", "10");
    // The server's re-quote sees a different contribution than the one the total was shown for.
    server = (s) => checkShownTotal(s.giftCents, s.contributionCents + 500, s.cover, s.shownTotalCents);
    await give();
    expect(sent.at(-1)?.shownTotalCents).toBe(26_000);
    expect(alertText()).toContain("The total is now R265, not the R260 you saw, so nothing was charged.");
    expect(alertText()).not.toMatch(/!/);
    // The server's figures take over the button and the breakdown: Give never sends a total that isn't on screen.
    expect(giveButton().textContent).toBe("Give R265");
    expect(host.textContent).toContain("R265");

    server = (s) => checkShownTotal(s.giftCents, s.contributionCents, s.cover, s.shownTotalCents);
    await give();
    expect(sent.at(-1)).toEqual({ giftCents: 25_000, contributionCents: 1_500, cover: false, shownTotalCents: 26_500 });
    expect(alertText()).toContain("Accepted by the server.");

    // Editing the amount drops the server's figures: the live total is back.
    await type("#amount", "300");
    expect(giveButton().textContent).toBe("Give R310");
  });
});
