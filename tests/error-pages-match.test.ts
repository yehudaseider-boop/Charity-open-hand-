// @vitest-environment jsdom
/**
 * One product, not a pile of screens (24/11/2026): the site's general error (a charity page or the give form that
 * couldn't open) has the same card, role and buttons as the charities list's error, so a donor sees one way of
 * saying "that didn't work" and one "Try again".
 */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("@/components/legal", () => ({ SupportContact: () => null }));

const { default: SiteError } = await import("@/app/error");
const { default: CharitiesError } = await import("@/app/charities/error");

async function render(component: typeof SiteError) {
  const host = document.createElement("div");
  const root = createRoot(host);
  const err = Object.assign(new Error("boom"), { digest: "123" });
  vi.spyOn(console, "error").mockImplementation(() => {});
  await act(async () => root.render(createElement(component, { error: err, retry: () => {} })));
  const alert = host.querySelector('[role="alert"]');
  const tryAgain = [...host.querySelectorAll("button")].find((b) => b.textContent === "Try again");
  const home = [...host.querySelectorAll("a")].find((a) => a.textContent === "Go to the home page");
  const out = { alert: alert?.className, tryAgain: tryAgain?.className, home: home?.className, h1: host.querySelector("h1")?.className };
  await act(async () => root.unmount());
  return out;
}

describe("the error pages look the same", () => {
  it("same card, heading and buttons, read out as an alert", async () => {
    const site = await render(SiteError);
    const list = await render(CharitiesError);
    expect(site.alert).toBe(list.alert);
    expect(site.h1).toBe(list.h1);
    expect(site.tryAgain).toBe(list.tryAgain);
    expect(site.home).toBe(list.home);
    expect(site.tryAgain).toContain("pressable");
  });
});
