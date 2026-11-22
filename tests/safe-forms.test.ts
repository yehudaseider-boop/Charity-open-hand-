// @vitest-environment jsdom
/**
 * The forms the "try to break it" pass (21/11/2026) found throwing a dropped connection to the page's error screen,
 * now SafeForms (or, for the authenticator set-up, a caught action state). For each kind of form:
 * - before the page's script has loaded it is still an ordinary post, never a GET with what was typed;
 * - a failed send keeps the form and what was typed, says what happened, and can be sent again;
 * - a confirmation step still asks first, and the pressed button still shows it is working.
 */
import { act, createElement } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// One stand-in for every server action: records what it was sent, and fails (as a dropped connection does) when told to.
const ctl = vi.hoisted(() => {
  // A held send is let go after each test: React holds every later transition while one is still on its way.
  const state = { sent: [] as { name: string; data: FormData | undefined }[], fail: true, hang: false, held: [] as (() => void)[] };
  const make = (name: string) =>
    Object.assign(
      async (...args: unknown[]) => {
        state.sent.push({ name, data: args.find((a): a is FormData => a instanceof FormData) });
        if (state.hang) return new Promise<void>((resolve) => void state.held.push(resolve));
        if (state.fail) throw new TypeError("Failed to fetch");
      },
      // As Next hands a server action to the page: it can post itself before the page's script has loaded.
      { $$FORM_ACTION: () => ({ name: `$ACTION_ID_${name}`, action: "", encType: "multipart/form-data", method: "POST", data: null }) },
    );
  return { state, make };
});
vi.mock("@/app/news/stop/actions", () => ({ confirmStopNews: ctl.make("confirmStopNews") }));
vi.mock("@/app/thanks/stop/actions", () => ({ confirmStop: ctl.make("confirmStop") }));
// The pages check a real stop before saying "Done" (server-only lookups, not reached without ?done=1).
vi.mock("@/lib/charity/thank-you-send", () => ({ thankYousStopped: async () => false }));
vi.mock("@/lib/charity/appeals", () => ({ appealsStopped: async () => false }));
vi.mock("@/app/account/monthly/actions", () => ({ changeMonthly: ctl.make("changeMonthly") }));
vi.mock("@/app/mfa/actions", () => ({
  verifyCode: ctl.make("verifyCode"),
  startEnrol: async () => {
    ctl.state.sent.push({ name: "startEnrol", data: undefined });
    if (ctl.state.fail) throw new TypeError("Failed to fetch");
    return { factorId: "00000000-0000-0000-0000-000000000001", qr: "data:image/png;base64,", secret: "ABC" };
  },
}));

const SafeForm = (await import("@/components/forms/safe-form")).SafeForm as unknown as React.FC<{ action: unknown; className?: string; children?: React.ReactNode }>;
const { RemoveButton } = await import("@/components/forms/remove-button");
const { UndoButton } = await import("@/components/done-panel-parts");
const { DocumentList } = await import("@/components/charity-summary");
const { MonthlyButton } = await import("@/app/account/monthly-button");
const { Enrol } = await import("@/app/mfa/enrol");
const { default: StopNewsPage } = await import("@/app/news/stop/page");
const { default: StopThanksPage } = await import("@/app/thanks/stop/page");

const OFFLINE = "You're offline, so this wasn't sent. What you typed is still here. Check your connection and try again.";
/** A button with nothing to type (Stop emails, Remove, a confirmed change) says nothing about typing. */
const OFFLINE_NOTHING_TYPED = "You're offline, so this wasn't sent. Check your connection and try again.";

let root: Root;
let host: HTMLDivElement;
let online = true;
beforeEach(() => {
  online = true;
  ctl.state.sent.length = 0;
  ctl.state.fail = true;
  ctl.state.hang = false;
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => ctl.state.held.splice(0).forEach((let_go) => let_go()));
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

const render = async (el: React.ReactElement) => act(async () => root.render(el));
const submit = async (button?: HTMLButtonElement) => act(async () => host.querySelector("form")!.requestSubmit(button));
const alertText = () => host.querySelector('[role="alert"]')?.textContent ?? "";
const pagePost = (html: string) => {
  const form = html.match(/<form[^>]*>/)?.[0] ?? "";
  expect(form).toMatch(/method="POST"/);
  expect(form).not.toMatch(/method="get"/i);
};
const pageProps = (sp: Record<string, string>) => ({ searchParams: Promise.resolve(sp), params: Promise.resolve({}) }) as never;

describe("Stop emails pages (news/stop and thanks/stop)", () => {
  for (const [name, Page, button] of [
    ["news/stop", StopNewsPage, "Stop these emails"],
    ["thanks/stop", StopThanksPage, "Stop emails from charities"],
  ] as const) {
    it(`${name}: posts before the script loads, with the link's token`, async () => {
      const html = renderToStaticMarkup(await Page(pageProps({ t: "tok-123" })));
      pagePost(html);
      expect(html).toContain('name="t" value="tok-123"');
    });

    it(`${name}: offline, the question stays, says it wasn't sent, and sends on the next press`, async () => {
      await render(await Page(pageProps({ t: "tok-123" })));
      online = false;
      await submit();
      expect(alertText()).toBe(OFFLINE_NOTHING_TYPED);
      expect(host.textContent).toContain(button);
      expect(host.querySelector<HTMLInputElement>("input[name=t]")!.value).toBe("tok-123");
      online = true;
      ctl.state.fail = false;
      await submit();
      expect(ctl.state.sent).toHaveLength(2);
      expect(ctl.state.sent[1].data?.get("t")).toBe("tok-123");
      expect(alertText()).toBe("");
    });
  }
});

describe("Monthly donation buttons (Pause, Resume, Cancel for good)", () => {
  it("post before the script loads, with the donation and the new status", () => {
    const html = renderToStaticMarkup(createElement(MonthlyButton, { id: "m-1", status: "paused", label: "Pause" }));
    pagePost(html);
    expect(html).toContain('name="status" value="paused"');
  });

  it("one that asks first can't be sent before the script loads: no post and the button off, so the question is never skipped (review 21/11/2026)", () => {
    const html = renderToStaticMarkup(createElement(MonthlyButton, { id: "m-1", status: "cancelled", label: "Cancel for good", danger: true, confirmText: "Cancel this monthly donation for good?" }));
    const form = html.match(/<form[^>]*>/)?.[0] ?? "";
    expect(form).not.toMatch(/method=/i);
    expect(form).not.toMatch(/action=/i);
    expect(html).not.toContain("$ACTION_ID_");
    expect(html.match(/<button[^>]*>/)?.[0]).toMatch(/ disabled=""/);
    expect(html).toContain(">Cancel for good</button>");
    // Without a question, the same button posts before the script loads, as before.
    const plain = renderToStaticMarkup(createElement(MonthlyButton, { id: "m-1", status: "paused", label: "Pause" }));
    pagePost(plain);
    expect(plain).toContain("$ACTION_ID_changeMonthly");
    expect(plain.match(/<button[^>]*>/)?.[0]).not.toMatch(/ disabled=""/);
  });

  it("once the script has taken over the server's markup, the button is on and asks first", async () => {
    const el = createElement(MonthlyButton, { id: "m-1", status: "cancelled", label: "Cancel for good", danger: true, confirmText: "Cancel this monthly donation for good?" });
    await act(async () => root.unmount());
    host.innerHTML = renderToStaticMarkup(el);
    expect(host.querySelector("button")!.disabled).toBe(true);
    await act(async () => void (root = hydrateRoot(host, el)));
    expect(host.querySelector("button")!.disabled).toBe(false);
    const ask = vi.spyOn(window, "confirm").mockReturnValue(false);
    await submit();
    expect(ask).toHaveBeenCalledWith("Cancel this monthly donation for good?");
    expect(ctl.state.sent).toHaveLength(0);
  });

  it("still ask first where it can't be taken back, and send nothing on No", async () => {
    const ask = vi.spyOn(window, "confirm").mockReturnValue(false);
    await render(createElement(MonthlyButton, { id: "m-1", status: "cancelled", label: "Cancel for good", danger: true, confirmText: "Cancel this monthly donation for good?" }));
    await submit();
    expect(ask).toHaveBeenCalledWith("Cancel this monthly donation for good?");
    expect(ctl.state.sent).toHaveLength(0);

    ask.mockReturnValue(true);
    online = false;
    await submit();
    expect(ctl.state.sent).toHaveLength(1);
    expect(ctl.state.sent[0].data?.get("status")).toBe("cancelled");
    expect(alertText()).toBe(OFFLINE_NOTHING_TYPED);
    expect(host.querySelector("button")!.disabled).toBe(false);
  });

  it("say they're working while the send is on its way", async () => {
    ctl.state.hang = true;
    await render(createElement(MonthlyButton, { id: "m-1", status: "paused", label: "Pause" }));
    await submit();
    expect(host.querySelector("button")!.textContent).toBe("Saving…");
    expect(host.querySelector("button")!.disabled).toBe(true);
  });
});

describe("Dashboard Undo and Remove (done panel, documents, updates, photos, campaigns)", () => {
  it("Undo says it's working, then, if the send fails, stays and can be pressed again", async () => {
    ctl.state.hang = true;
    const undo = ctl.make("undo");
    await render(createElement(SafeForm, { action: undo, className: "flex" }, createElement(UndoButton)));
    await submit();
    expect(host.querySelector("button")!.textContent).toBe("Taking it back…");
    ctl.state.hang = false;
    await act(async () => ctl.state.held.splice(0).forEach((let_go) => let_go()));
    expect(host.querySelector("button")!.textContent).toBe("Undo");

    online = false;
    await submit();
    expect(alertText()).toBe(OFFLINE);
    expect(host.querySelector("button")!.textContent).toBe("Undo");
    expect(host.querySelector("button")!.disabled).toBe(false);
  });

  it("a document's Remove posts before the script loads, and a failed send keeps the list and says so", async () => {
    const docs = [{ id: "d-1", document_type: "bank_letter" as never, file_name: "bank-letter.pdf", signed_on: null, uploaded_at: "2026-11-20T08:00:00Z" }];
    const removeAction = () => ctl.make("removeDocument") as unknown as () => Promise<void>;
    pagePost(renderToStaticMarkup(createElement(DocumentList, { docs, removeAction })));

    await render(createElement(DocumentList, { docs, removeAction }));
    await submit();
    expect(ctl.state.sent.map((s) => s.name)).toEqual(["removeDocument"]);
    expect(alertText()).not.toContain("What you typed");
    expect(host.textContent).toContain("bank-letter.pdf");
    expect(host.querySelector("button")!.textContent).toBe("Remove");
  });

  it("End (a campaign) shows Ending… while it works", async () => {
    ctl.state.hang = true;
    await render(createElement(SafeForm, { action: ctl.make("endCampaign") }, createElement(RemoveButton, { label: "End", what: "Winter appeal", ask: false })));
    await submit();
    expect(host.querySelector("button")!.textContent).toBe("Ending…");
  });
});

describe("Second step (authenticator set-up and code)", () => {
  it("Set up: a failed send says so on the page instead of the error screen, and can be pressed again", async () => {
    online = false;
    await render(createElement(Enrol, { next: "/charity-admin" }));
    await submit();
    expect(alertText()).toBe(OFFLINE);
    online = true;
    ctl.state.fail = false;
    await submit();
    expect(host.querySelector("img[alt^='QR code']")).not.toBeNull();
  });

  it("the code: a failed send keeps the typed code and the hidden factor", async () => {
    ctl.state.fail = false;
    await render(createElement(Enrol, { next: "/charity-admin" }));
    await submit();
    ctl.state.fail = true;
    const code = host.querySelector<HTMLInputElement>("input[name=code]")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(code, "123456");
      code.dispatchEvent(new Event("input", { bubbles: true }));
    });
    online = false;
    await submit();
    expect(ctl.state.sent.at(-1)?.name).toBe("verifyCode");
    expect(ctl.state.sent.at(-1)?.data?.get("factorId")).toBe("00000000-0000-0000-0000-000000000001");
    expect(alertText()).toBe(OFFLINE);
    expect(host.querySelector<HTMLInputElement>("input[name=code]")!.value).toBe("123456");
  });
});
