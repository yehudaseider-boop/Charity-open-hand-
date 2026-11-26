// @vitest-environment jsdom
/**
 * The charity demo's yearly s18A list (25/11/2026): Preview, Approve, Approve all (asking first) and Undo, all kept in
 * the visitor's own browser. Driven through the real component, as a visitor would.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetDemo } from "@/app/demo/dashboard/store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { DemoReceiptsList } = await import("@/app/demo/dashboard/receipts-list");

const rows = [
  { id: "a", name: "Thandi Mokoena", initials: "TM", totalCents: 30_000, gifts: [{ date: "05/04/2026", cents: 10_000 }, { date: "05/05/2026", cents: 20_000 }] },
  { id: "b", name: "Pieter Botha", initials: "PB", totalCents: 12_500, gifts: [{ date: "01/06/2026", cents: 12_500 }] },
];

let root: Root;
let host: HTMLDivElement;
beforeEach(async () => {
  resetDemo();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(createElement(DemoReceiptsList, { rows, taxYearName: "2026/27", endsOn: "28/02/2027" }));
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const button = (label: string) => [...host.querySelectorAll("button")].find((b) => (label === "Approve" ? b.textContent?.trim() === label : b.textContent?.trim().startsWith(label)));
const click = async (label: string) => {
  const b = button(label);
  expect(b, `a "${label}" button`).toBeTruthy();
  await act(async () => b!.click());
};
const text = () => host.textContent ?? "";

describe("the demo's yearly s18A list", () => {
  it("starts with everything still to check and says nothing is sent", () => {
    expect(text()).toContain("2 to check · 0 approved");
    expect(text()).toContain("no one is emailed");
  });

  it("opens a sample preview with the donor's donations and closes it again", async () => {
    await act(async () => button("Preview")!.click());
    expect(text()).toContain("Sample preview, not a real receipt");
    expect(text()).toContain("R100");
    expect(text()).toContain("R300");
    await click("Close preview");
    expect(text()).not.toContain("Sample preview");
  });

  it("approves one donor, then takes it back with Undo", async () => {
    await act(async () => button("Approve")!.click());
    expect(text()).toContain("1 to check · 1 approved");
    expect(text()).toContain("Approved the receipt for Thandi Mokoena.");
    await click("Undo");
    expect(text()).toContain("2 to check · 0 approved");
    expect(text()).toContain("Nothing had been sent");
  });

  it("asks before approving them all, and Not yet changes nothing", async () => {
    await click("Approve all 2");
    expect(host.querySelector('[role="alertdialog"]')).toBeTruthy();
    await click("Not yet");
    expect(text()).toContain("2 to check · 0 approved");
    await click("Approve all 2");
    await click("Yes, approve all");
    expect(text()).toContain("0 to check · 2 approved");
    expect(text()).toContain("R425");
  });

  it("shows the first six donors of a long list, and all of them on request", async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ id: `d${i}`, name: `Donor ${i}`, initials: "D", totalCents: 5_000, gifts: [{ date: "01/06/2026", cents: 5_000 }] }));
    await act(async () => root.render(createElement(DemoReceiptsList, { rows: many, taxYearName: "2026/27", endsOn: "28/02/2027" })));
    expect(host.querySelectorAll("li").length).toBe(6);
    await click("Show all 9 donors");
    expect(host.querySelectorAll("li").length).toBe(9);
    await click("Show fewer");
    expect(host.querySelectorAll("li").length).toBe(6);
  });

  it("Undo after Approve all takes back only what Approve all approved, never an earlier one (QA 26/11/2026)", async () => {
    await act(async () => button("Approve")!.click());
    expect(text()).toContain("1 to check · 1 approved");
    await click("Approve all");
    await click("Yes, approve all");
    expect(text()).toContain("0 to check · 2 approved");
    expect(text()).toContain("Approved 1 receipt.");
    await click("Undo");
    expect(text()).toContain("1 to check · 1 approved");
  });

  it("an approved donor can be taken back on its own row, and a name ending in a full stop gets just one", async () => {
    await act(async () => button("Approve")!.click());
    await click("Take back");
    expect(text()).toContain("2 to check · 0 approved");
    expect(text()).toContain("Approval taken back for Thandi Mokoena. Nothing had been sent.");
    expect(text()).not.toContain("..");
  });
});
