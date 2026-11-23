// @vitest-environment jsdom
/**
 * The give form remembers the donor's choices across "Try again" and a reload (tester, 23/11/2026): "Add them now"
 * (s18A details now) sits inside "I'd like an s18A receipt", which is disabled until that box is ticked, so a
 * restore that clicked everything at once left it on "Add my details after paying". Driven through the real form and
 * the real useFormDraft: choose, type, leave the page, open it again. Also: switching "A company" to "A trust" checks
 * the registration number again, instead of keeping the company's message until the next press of Give.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no layout: the form scrolls to the first thing to fix after a refusal.
Element.prototype.scrollIntoView ??= () => {};

/** What the server answers at Give. */
let answer: Record<string, unknown> = { ok: false, message: "Not sent in this test." };
vi.mock("@/app/c/[slug]/donate/actions", () => ({ submitDonation: async () => answer }));
vi.mock("@/components/legal", () => ({ SupportContact: () => null, TermsAndPrivacyLinks: () => null }));

const { DonateFlow } = await import("@/app/c/[slug]/donate/donate-flow");

let root: Root | null = null;
let host: HTMLDivElement;
async function open() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(createElement(DonateFlow, { slug: "meals", charityName: "Meals for All", receiptsAvailable: true, minimumLabel: "R30", contributionMinimumLabel: "R10", fromApp: false, initialAmountCents: 25_000 }));
  });
  // The restore takes a few turns: one per section a choice opens.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}
async function leave() {
  await act(async () => root?.unmount());
  root = null;
  host.remove();
}
beforeEach(() => sessionStorage.clear());
afterEach(async () => {
  if (root) await leave();
});

const $ = <T extends Element>(sel: string) => host.querySelector<T>(sel)!;
async function type(name: string, value: string) {
  const input = $<HTMLInputElement>(`input[name="${name}"]`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function click(sel: string) {
  await act(async () => $<HTMLInputElement>(sel).click());
}

describe("the give form after Try again or a reload", () => {
  it("keeps \"Add them now\" and the s18A details typed", async () => {
    await open();
    await type("first_name", "Thandi");
    await click('input[name="wants_18a"]');
    await click('input[name="s18a_when"][value="now"]');
    await type("address_line1", "12 Main Road");
    await type("city", "Johannesburg");
    await leave();

    await open();
    expect($<HTMLInputElement>('input[name="wants_18a"]').checked).toBe(true);
    expect($<HTMLInputElement>('input[name="s18a_when"][value="now"]').checked).toBe(true);
    expect($<HTMLInputElement>('input[name="s18a_when"][value="later"]').checked).toBe(false);
    // The details boxes are open and sent, with what was typed.
    expect($<HTMLInputElement>('input[name="address_line1"]').matches(":disabled")).toBe(false);
    expect($<HTMLInputElement>('input[name="address_line1"]').value).toBe("12 Main Road");
    expect($<HTMLInputElement>('input[name="city"]').value).toBe("Johannesburg");
    expect($<HTMLInputElement>('input[name="first_name"]').value).toBe("Thandi");
    expect(host.textContent).not.toContain("Until then this gift can't go on your s18A receipt");
  });

  it("keeps \"Add my details after paying\" and a company, too", async () => {
    await open();
    await click('input[name="donor_type"][value="company"]');
    await type("organisation_name", "Acme Holdings");
    await click('input[name="wants_18a"]');
    await click('input[name="s18a_when"][value="later"]');
    await leave();

    await open();
    expect($<HTMLInputElement>('input[name="donor_type"][value="company"]').checked).toBe(true);
    expect($<HTMLInputElement>('input[name="organisation_name"]').value).toBe("Acme Holdings");
    expect($<HTMLInputElement>('input[name="wants_18a"]').checked).toBe(true);
    expect($<HTMLInputElement>('input[name="s18a_when"][value="later"]').checked).toBe(true);
  });

  it("an unticked s18A box stays unticked", async () => {
    await open();
    await click('input[name="wants_18a"]');
    await click('input[name="s18a_when"][value="now"]');
    await click('input[name="wants_18a"]');
    await leave();

    await open();
    expect($<HTMLInputElement>('input[name="wants_18a"]').checked).toBe(false);
  });
});

describe("switching between a company and a trust after Give", () => {
  const cipc = "Use the company's CIPC number, for example 2015/123456/07";
  async function giveAsCompanyWith(reg: string) {
    await open();
    await click('input[name="donor_type"][value="company"]');
    await click('input[name="wants_18a"]');
    await click('input[name="s18a_when"][value="now"]');
    await type("registration_number", reg);
    answer = { ok: false, message: "Please check the highlighted fields.", fieldErrors: { registration_number: cipc } };
    await act(async () => {
      $<HTMLFormElement>("form").requestSubmit();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(host.textContent).toContain(cipc);
  }

  it("a trust number that is fine for a trust loses the company's message at once", async () => {
    await giveAsCompanyWith("IT1234/2015");
    await click('input[name="donor_type"][value="trust"]');
    expect(host.textContent).not.toContain(cipc);
    expect($<HTMLInputElement>('input[name="registration_number"]').getAttribute("aria-invalid")).toBeNull();
    // Back to a company: the number is checked again as a company's.
    await click('input[name="donor_type"][value="company"]');
    expect(host.textContent).toContain(cipc);
  });

  it("a trust number SARS can't take says so, in the trust's words", async () => {
    await giveAsCompanyWith("IT123456789012345678901234/2015");
    await click('input[name="donor_type"][value="trust"]');
    expect(host.textContent).not.toContain(cipc);
    expect(host.textContent).toContain("A trust number is at most 30 characters for SARS");
  });
});
