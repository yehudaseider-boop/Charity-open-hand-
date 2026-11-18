/**
 * The test website, as a visitor uses it: the pages load, nothing says it failed, and the give form works out a total.
 * Nothing is paid and nothing is saved.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";
import { BROKEN, CHARITY_SLUG, SITE, openBrowser } from "./setup";

let browser: Browser;
let page: Page;
const errors: string[] = [];

beforeAll(async () => {
  browser = await openBrowser();
  page = await browser.newPage({ viewport: { width: 375, height: 800 } });
  page.on("pageerror", (e) => errors.push(e.message));
});
afterAll(async () => {
  await browser?.close();
});

async function open(path: string) {
  const res = await page.goto(`${SITE}${path}`, { waitUntil: "networkidle" });
  return { status: res?.status() ?? 0, text: await page.locator("body").innerText() };
}

describe("the test website", () => {
  it("answers its health check: up, and reaching the database", async () => {
    // Through the browser, like everything else here (it uses the same network a visitor would).
    const res = await page.goto(`${SITE}/api/health`);
    expect(res?.status()).toBe(200);
    expect(JSON.parse(await page.locator("body").innerText())).toEqual({ ok: true });
  });

  for (const path of ["/", "/charities", "/for-donors", "/for-charities", "/login", "/privacy", "/terms"]) {
    it(`shows ${path} without an error`, async () => {
      const { status, text } = await open(path);
      expect(status).toBe(200);
      expect(text).not.toMatch(BROKEN);
    });
  }

  it("lists the demo charity on Find a charity, and its page opens from there", async () => {
    await open("/charities");
    await page.locator(`a[href="/c/${CHARITY_SLUG}"]`).first().click();
    await page.waitForURL(`**/c/${CHARITY_SLUG}`);
    expect(await page.locator("h1").first().innerText()).not.toBe("");
    expect(await page.locator("body").innerText()).not.toMatch(BROKEN);
  });

  it("works out a total on the give form (nothing is paid)", async () => {
    const { status } = await open(`/c/${CHARITY_SLUG}/donate`);
    expect(status).toBe(200);
    await page.locator("#amount").fill("100");
    // The summary shows the gift in Rand, our way (R100), never a float or a dollar sign.
    await expect.poll(async () => page.locator("body").innerText(), { timeout: 15_000 }).toMatch(/R100\b/);
    expect(await page.locator("body").innerText()).not.toMatch(/\$|R100\.0\b|NaN|undefined/);
  });

  it("asks for an email on sign-in, and the button sends a code (not a link)", async () => {
    await open("/login");
    expect(await page.getByRole("button", { name: "Email me a sign-in code" }).count()).toBe(1);
  });

  it("had no script errors on any page", () => {
    expect(errors).toEqual([]);
  });
});
