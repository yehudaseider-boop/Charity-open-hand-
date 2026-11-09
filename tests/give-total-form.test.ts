// @vitest-environment jsdom
/**
 * The give form's total and the server's check at Give (04/11/2026): the form sends the figures on screen, the
 * server works the total out again (checkShownTotal, the same check startDonation runs) and refuses a total the
 * donor did not see. Driven through the real form, as a donor would: type an amount, choose a contribution (a
 * button, Other or No thanks), press Give.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkShownTotal } from "@/lib/donations/quote";
import { platformConfig } from "@/config/platform";
import { formatRand } from "@/lib/money";

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

async function choose(value: string) {
  await act(async () => $<HTMLInputElement>(`input[name="contribution_choice"][value="${value}"]`).click());
}
const breakdown = () => host.querySelector("dl")?.textContent ?? "";

describe("the contribution to Givezy: buttons, Other and No thanks (decided 09/11/2026)", () => {
  it("starts on the configured default, shown as its own line in the total", () => {
    const def = platformConfig.contributionDefaultCents;
    const checked = $<HTMLInputElement>('input[name="contribution_choice"]:checked');
    expect(checked.value).toBe(String(def));
    expect(breakdown()).toContain(`Contribution to Givezy${formatRand(def)}`);
    expect(giveButton().textContent).toBe(`Give ${formatRand(25_000 + def)}`);
  });

  it("is one radio group: the presets from the config, Other and No thanks", () => {
    const values = [...host.querySelectorAll<HTMLInputElement>('input[name="contribution_choice"]')].map((i) => i.value);
    expect(values).toEqual([...platformConfig.contributionPresetsCents.map(String), "other", "none"]);
    expect(host.querySelector('input[name="give_extra"]')).toBeNull();
    // The group has its own name for screen readers, and its explainer is read with it.
    expect(host.querySelector("fieldset legend")?.textContent).toBe("Contribution to Givezy");
  });

  it("No thanks makes it R0, says so, and an amount can be chosen again", async () => {
    await choose("none");
    expect(breakdown()).toContain("Contribution to GivezyR0");
    expect(host.textContent).toContain("No contribution this time. Choose an amount above to add one.");
    expect(giveButton().textContent).toBe("Give R250");
    await give();
    expect(sent.at(-1)).toEqual({ giftCents: 25_000, contributionCents: 0, cover: false, shownTotalCents: 25_000 });
    expect(alertText()).toContain("Accepted by the server.");

    await choose("2000");
    expect(giveButton().textContent).toBe("Give R270");
    expect(host.textContent).not.toContain("No contribution this time");
  });

  it("Other takes a typed amount from the minimum, refuses less, and keeps what was typed when switching", async () => {
    await choose("other");
    await type("#contribution", "5");
    await give();
    expect(sent).toHaveLength(0);
    expect(alertText()).toContain("The minimum contribution to Givezy is R10.");
    await type("#contribution", "45");
    expect(giveButton().textContent).toBe("Give R295");
    await choose("1000");
    await choose("other");
    expect($<HTMLInputElement>("#contribution").value).toBe("45");
  });

  it("says a month on the buttons and in the total when the gift is monthly", async () => {
    await tick("monthly");
    const labels = [...host.querySelectorAll('input[name="contribution_choice"]')].map((i) => i.closest("label")?.textContent);
    expect(labels).toContain("R10 a month");
    expect(breakdown()).toContain("Contribution to GivezyR10 a month");
    expect(breakdown()).toContain("Total each month");
  });
});

describe("the form sends the total on screen, and the server's own re-quote agrees", () => {
  it("with the contribution changed and then typed under Other", async () => {
    await choose("1000");
    expect(giveButton().textContent).toBe("Give R260");
    await give();
    expect(sent.at(-1)).toEqual({ giftCents: 25_000, contributionCents: 1_000, cover: false, shownTotalCents: 26_000 });
    expect(alertText()).toContain("Accepted by the server.");

    // The donor types their own contribution: the button follows, and what is sent still matches the server's sum.
    await choose("other");
    await type("#contribution", "25.50");
    expect(giveButton().textContent).toBe("Give R275.50");
    await give();
    expect(sent.at(-1)).toEqual({ giftCents: 25_000, contributionCents: 2_550, cover: false, shownTotalCents: 27_550 });
    expect(alertText()).toContain("Accepted by the server.");
  });
});

describe("a total the server refuses", () => {
  it("shows the server's figures and message, sends exactly those next time, and goes back to the live total once the donor edits", async () => {
    await choose("1000");
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
