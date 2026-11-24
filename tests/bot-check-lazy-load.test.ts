// @vitest-environment jsdom
/**
 * The bot check's browser half loads Cloudflare's script only when the form is about to be used (24/11/2026): not at
 * page load, but on a touch or keypress in the form, when the check scrolls into view (if it was not already on
 * screen), or at the latest when the button is pressed. The server still requires and verifies the token (see
 * bot-check-forms.test.ts): a visitor who never loads the script has no token and is refused there. A slow or failed
 * load still ends in the plain message with Try again, and what was typed stays.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { botCheckConfig } from "@/config/bot-check";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("@/components/forms/fields", () => ({ ErrorMark: () => null }));

const { BotCheck } = await import("@/components/forms/bot-check");

/** A stand-in for the browser's scroll watcher that only fires when told to. */
let watchers: { cb: IntersectionObserverCallback; el: Element }[] = [];
class FakeObserver {
  constructor(private cb: IntersectionObserverCallback) {}
  observe(el: Element) { watchers.push({ cb: this.cb, el }); }
  disconnect() { watchers = watchers.filter((w) => w.cb !== this.cb); }
  unobserve() {}
  takeRecords() { return []; }
}
const sawScroll = async (isIntersecting: boolean) => {
  await act(async () => { for (const w of [...watchers]) w.cb([{ isIntersecting, target: w.el } as IntersectionObserverEntry], {} as IntersectionObserver); });
};

const scripts = () => [...document.head.querySelectorAll("script")].filter((s) => s.src.startsWith(botCheckConfig.origin));
let root: Root;
let host: HTMLDivElement;
let submitted = 0;

beforeEach(async () => {
  vi.useFakeTimers();
  watchers = [];
  submitted = 0;
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeObserver;
  document.head.querySelectorAll("script").forEach((s) => s.remove());
  delete (window as { turnstile?: unknown }).turnstile;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        "form",
        { onSubmit: () => void submitted++ },
        createElement("input", { name: "email", defaultValue: "" }),
        createElement(BotCheck, { siteKey: "0xFAKE-SITE-KEY", action: "sign-in", kind: "sign-in", button: "Email me a sign-in code", guardForm: true }),
        createElement("button", { type: "submit" }, "Email me a sign-in code"),
      ),
    );
  });
});
afterEach(async () => {
  // The page-wide "script is loading" memory is cleared the way a real failure clears it, so each test starts afresh.
  await act(async () => { scripts().forEach((sc) => sc.dispatchEvent(new Event("error"))); });
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
});

describe("the bot check's script", () => {
  it("is not loaded when the page opens, even with the form on screen", async () => {
    expect(scripts()).toHaveLength(0);
    await sawScroll(true); // the first report: already on screen at load
    expect(scripts()).toHaveLength(0);
  });

  it("loads when the form is touched or focused", async () => {
    const email = host.querySelector("input")!;
    await act(async () => { email.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });
    expect(scripts()).toHaveLength(1);
    expect(scripts()[0].src).toBe(botCheckConfig.scriptUrl);
  });

  it("loads when the check scrolls into view after the page opened (the end of a long form)", async () => {
    await sawScroll(false); // off screen at load
    expect(scripts()).toHaveLength(0);
    await sawScroll(true); // scrolled to
    expect(scripts()).toHaveLength(1);
  });

  it("loads at the latest when the button is pressed, and that press waits for the token instead of sending without one", async () => {
    const form = host.querySelector("form")!;
    await act(async () => { form.requestSubmit(); });
    expect(scripts()).toHaveLength(1);
    expect(submitted).toBe(0); // nothing was sent without a token
  });

  it("a script that fails to load ends in the plain message with Try again, and what was typed stays", async () => {
    const email = host.querySelector("input")!;
    await act(async () => {
      email.value = "sam@example.com";
      email.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    await act(async () => { scripts()[0].dispatchEvent(new Event("error")); });
    const alert = host.querySelector("[role=alert]");
    expect(alert?.textContent).toMatch(/Try again/);
    expect(alert?.textContent).toMatch(/security check couldn.t load/);
    expect(email.value).toBe("sam@example.com");
    expect(submitted).toBe(0);
  });

  it("a script that never answers ends the same way after the wait, not a press that hangs", async () => {
    const form = host.querySelector("form")!;
    await act(async () => { form.requestSubmit(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(botCheckConfig.tokenWaitMs + 100); });
    expect(host.querySelector("[role=alert]")?.textContent).toMatch(/Try again/);
    expect(submitted).toBe(0);
  });
});

describe("the server's half is untouched", () => {
  it("every protected form action still requires and verifies the token on the server", () => {
    const read = (p: string) => readFileSync(`${process.cwd()}/${p}`, "utf8");
    for (const p of ["src/app/c/[slug]/donate/actions.ts", "src/app/login/actions.ts", "src/app/charities/request/actions.ts", "src/app/donate/return/actions.ts"]) {
      expect(read(p), p).toContain("verifyBotCheck(");
    }
  });
});
