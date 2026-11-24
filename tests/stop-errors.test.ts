/**
 * A stop click that hits a problem on our side (review 24/11/2026): the stop functions throw instead of answering a
 * silent "no", so the page says plainly that nothing was changed and to try again, never "that link didn't work",
 * which would send the donor off with their stop lost. (A mail app's one-click POST gets a 503: one-click-stop.test.ts.)
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const outcome = vi.hoisted(() => ({ value: "ok" as "ok" | "not ours" | "down" }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));
vi.mock("@/lib/charity/thank-you-send", () => ({
  stopThankYous: async () => {
    if (outcome.value === "down") throw new Error("database down");
    return outcome.value === "ok";
  },
  thankYousStopped: async () => false,
}));
vi.mock("@/lib/charity/appeals", () => ({
  stopAppeals: async () => {
    if (outcome.value === "down") throw new Error("database down");
    return outcome.value === "ok" ? { charityName: "Meals Fund" } : null;
  },
  appealsStopped: async () => false,
}));

const { confirmStop } = await import("@/app/thanks/stop/actions");
const { confirmStopNews } = await import("@/app/news/stop/actions");
const { default: StopThanksPage } = await import("@/app/thanks/stop/page");
const { default: StopNewsPage } = await import("@/app/news/stop/page");

const TOKEN = "a".repeat(43);
const form = () => {
  const f = new FormData();
  f.set("t", TOKEN);
  return f;
};
const props = (sp: Record<string, string>) => ({ searchParams: Promise.resolve(sp), params: Promise.resolve({}) }) as never;

beforeEach(() => {
  outcome.value = "ok";
});

describe("a stop click that fails on our side", () => {
  for (const [name, action, page, Page] of [
    ["thanks/stop", confirmStop, "/thanks/stop", StopThanksPage],
    ["news/stop", confirmStopNews, "/news/stop", StopNewsPage],
  ] as const) {
    it(`${name}: done, not ours and a failure each go to their own page`, async () => {
      await expect(action(form())).rejects.toThrow(`redirect:${page}?t=${TOKEN}&done=1`);
      outcome.value = "not ours";
      await expect(action(form())).rejects.toThrow(`redirect:${page}?t=${TOKEN}&error=1`);
      outcome.value = "down";
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      await expect(action(form())).rejects.toThrow(`redirect:${page}?t=${TOKEN}&error=2`);
      err.mockRestore();
    });

    it(`${name}: the failure says nothing was changed and to try again, and keeps the button`, async () => {
      const html = renderToStaticMarkup(await Page(props({ t: TOKEN, error: "2" })));
      expect(html).toContain("Something went wrong on our side, so nothing was changed. Please try again in a few minutes.");
      expect(html).not.toContain("That link didn&#x27;t work");
      expect(html).toContain("Stop");
    });
  }
});
