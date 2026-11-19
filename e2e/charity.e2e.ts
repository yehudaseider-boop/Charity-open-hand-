/**
 * The charity dashboard, as a team member sees it (19/11/2026). The robot is a Viewer of the demo charity on the TEST
 * project: it can look but not change anything, and sees no donor contact details. It signs in with a code and its
 * own authenticator, opens each page a Viewer may see, and checks that the pages a Viewer may not use refuse politely.
 * Nothing is sent, saved or downloaded.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, BrowserContext } from "playwright-core";
import { BROKEN, ROBOT_EMAIL, SITE, canSignIn, charityId, charityViewerCookies, ensureRobot, openBrowser, removeRobotAuthenticators } from "./setup";

let browser: Browser;
let context: BrowserContext;
let id = "";
const errors: string[] = [];

beforeAll(async () => {
  if (!canSignIn) return;
  await ensureRobot();
  id = await charityId();
  const { cookies, error } = await charityViewerCookies();
  if (error) throw new Error(`The robot could not sign in with its second step: ${error}`);
  browser = await openBrowser();
  context = await browser.newContext({ viewport: { width: 375, height: 800 } });
  await context.addCookies(cookies);
});
afterAll(async () => {
  await browser?.close();
  if (canSignIn) await removeRobotAuthenticators();
});

async function open(path: string) {
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${path}: ${e.message}`));
  const res = await page.goto(`${SITE}${path}`, { waitUntil: "networkidle" });
  // A first sign-in asks to agree to the Terms once.
  if (new URL(page.url()).pathname === "/agree") {
    await page.locator('input[name="agree"]').check();
    await page.locator('input[name="age"]').check();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForLoadState("networkidle");
  }
  const text = await page.locator("body").innerText();
  const where = new URL(page.url()).pathname;
  await page.close();
  return { status: res?.status() ?? 0, text, where };
}

describe.skipIf(!canSignIn)("the charity dashboard, as a Viewer", () => {
  for (const [name, path] of [
    ["the overview", ""],
    ["donations", "/donations"],
    ["donors", "/donors"],
    ["monthly donations", "/monthly"],
    ["campaigns", "/campaigns"],
    ["activity", "/activity"],
  ] as const) {
    it(`opens ${name} without an error, past the second step`, async () => {
      const { status, text, where } = await open(`/charity-admin/${id}${path}`);
      expect(status).toBeLessThan(400);
      expect(where).toBe(`/charity-admin/${id}${path}`);
      expect(text).not.toMatch(BROKEN);
    });
  }

  it("shows a Viewer no donor's email address", async () => {
    const { text } = await open(`/charity-admin/${id}/donors`);
    const others = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []).filter((e) => e.toLowerCase() !== ROBOT_EMAIL);
    expect(others).toEqual([]);
  });

  it("tells a Viewer on the team page that only the owner changes the team", async () => {
    const { status, text } = await open(`/charity-admin/${id}/team`);
    expect(status).toBeLessThan(400);
    expect(text).toMatch(/You.re a viewer here/);
    expect(text).not.toMatch(BROKEN);
  });

  it("shows a Viewer the public profile with the forms switched off", async () => {
    const { status, text } = await open(`/charity-admin/${id}/profile`);
    expect(status).toBeLessThan(400);
    expect(text).toMatch(/the forms are switched off/);
    expect(text).not.toMatch(BROKEN);
  });

  it("opens the report without an error (downloads are for other roles)", async () => {
    const { status, text } = await open(`/charity-admin/${id}/report`);
    expect(status).toBeLessThan(400);
    expect(text).not.toMatch(BROKEN);
  });

  it("had no script errors on any page", () => {
    expect(errors).toEqual([]);
  });
});
