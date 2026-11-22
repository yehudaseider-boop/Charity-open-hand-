/**
 * The "stop emails" pages say "Done" only after a real stop (22/11/2026): "?done=1" opened by hand, or with a link
 * that hasn't stopped anything, shows the question (or the plain "open the link" line) instead.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const stopped = vi.hoisted(() => ({ thanks: false, news: false, fail: false }));
vi.mock("@/lib/charity/thank-you-send", () => ({
  thankYousStopped: async () => {
    if (stopped.fail) throw new Error("database down");
    return stopped.thanks;
  },
}));
vi.mock("@/lib/charity/appeals", () => ({
  appealsStopped: async () => {
    if (stopped.fail) throw new Error("database down");
    return stopped.news;
  },
}));
vi.mock("@/app/thanks/stop/actions", () => ({ confirmStop: async () => {} }));
vi.mock("@/app/news/stop/actions", () => ({ confirmStopNews: async () => {} }));

const { default: StopThanksPage } = await import("@/app/thanks/stop/page");
const { default: StopNewsPage } = await import("@/app/news/stop/page");

const props = (sp: Record<string, string>) => ({ searchParams: Promise.resolve(sp), params: Promise.resolve({}) }) as never;
const TOKEN = "a".repeat(43);

beforeEach(() => {
  stopped.thanks = false;
  stopped.news = false;
  stopped.fail = false;
});

describe("Stop emails: Done only after a real stop", () => {
  for (const [name, Page, button, flag] of [
    ["thanks/stop", StopThanksPage, "Stop emails from charities", "thanks"],
    ["news/stop", StopNewsPage, "Stop these emails", "news"],
  ] as const) {
    it(`${name}: ?done=1 on its own says nothing was stopped`, async () => {
      const html = renderToStaticMarkup(await Page(props({ done: "1" })));
      expect(html).not.toContain("Done.");
      expect(html).toContain("Open the link");
    });
    it(`${name}: ?done=1 with a link that stopped nothing asks the question again`, async () => {
      const html = renderToStaticMarkup(await Page(props({ done: "1", t: TOKEN })));
      expect(html).not.toContain("Done.");
      expect(html).toContain(button);
    });
    it(`${name}: a failed check never claims it was done`, async () => {
      stopped.fail = true;
      stopped[flag] = true;
      vi.spyOn(console, "error").mockImplementation(() => {});
      const html = renderToStaticMarkup(await Page(props({ done: "1", t: TOKEN })));
      expect(html).not.toContain("Done.");
    });
    it(`${name}: after a real stop it says Done`, async () => {
      stopped[flag] = true;
      const html = renderToStaticMarkup(await Page(props({ done: "1", t: TOKEN })));
      expect(html).toContain("Done.");
      expect(html).not.toContain(button);
    });
  }
});
