/**
 * A charity applying, start to "almost submitted" (19/11/2026). A second robot account signs in with a code and its
 * own authenticator, starts (or reopens) one draft application on the TEST project, and fills it in the way a person
 * would: silly input first, then real-looking details. It checks the messages, that saves stick, and that an
 * unfinished application can't be submitted.
 *
 * On purpose it never saves bank details (that would run the bank check), never uploads a document and never
 * submits, so nothing is emailed and Admin gets no application to review. The one draft is reused every run.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { APPLY_ROBOT_CHARITY, APPLY_ROBOT_EMAIL, BROKEN, SITE, applyRobotDraft, canSignIn, charityViewerCookies, ensureRobot, openBrowser, removeRobotAuthenticators } from "./setup";

let browser: Browser;
let context: BrowserContext;
let page: Page;
let id = "";
const errors: string[] = [];
const step = (key: string) => `${SITE}/charity-admin/${id}/application?step=${key}`;

/** First sign-in asks to agree to the Terms once. */
async function passAgree() {
  if (new URL(page.url()).pathname !== "/agree") return;
  await page.locator('input[name="agree"]').check();
  await page.locator('input[name="age"]').check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForLoadState("networkidle");
}

async function save(label = "Save") {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
}

beforeAll(async () => {
  if (!canSignIn) return;
  await ensureRobot(APPLY_ROBOT_EMAIL);
  const { cookies, error, userId } = await charityViewerCookies(APPLY_ROBOT_EMAIL);
  if (error || !userId) throw new Error(`The apply robot could not sign in with its second step: ${error}`);
  browser = await openBrowser();
  context = await browser.newContext({ viewport: { width: 375, height: 800 } });
  await context.addCookies(cookies);
  page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));

  id = (await applyRobotDraft(userId)) ?? "";
  if (!id) {
    // First run only: start the application the way a signed-in person does, on the apply page.
    await page.goto(`${SITE}/apply`, { waitUntil: "networkidle" });
    await passAgree();
    if (new URL(page.url()).pathname !== "/apply") await page.goto(`${SITE}/apply`, { waitUntil: "networkidle" });
    await page.getByLabel("Organisation name").fill(APPLY_ROBOT_CHARITY);
    await page.getByRole("button", { name: "Start application" }).click();
    await page.waitForURL(/\/charity-admin\/[0-9a-f-]+\/application/, { timeout: 30_000 });
    id = new URL(page.url()).pathname.split("/")[2];
  }
}, 120_000);

afterAll(async () => {
  await browser?.close();
  if (canSignIn) await removeRobotAuthenticators(APPLY_ROBOT_EMAIL);
});

describe.skipIf(!canSignIn)("a charity filling in its application", () => {
  it("opens its draft past the second step, with the steps shown", async () => {
    const res = await page.goto(step("organisation"), { waitUntil: "networkidle" });
    await passAgree();
    if (!page.url().includes("/application")) await page.goto(step("organisation"), { waitUntil: "networkidle" });
    expect(res?.status() ?? 0).toBeLessThan(400);
    const text = await page.locator("body").innerText();
    expect(text).toMatch(/Step 1 of \d+/);
    expect(text).toMatch(/steps done/);
    expect(text).not.toMatch(BROKEN);
  });

  it("asks for an NPO or PBO number, and keeps what was typed", async () => {
    await page.goto(step("organisation"), { waitUntil: "networkidle" });
    await page.getByLabel("Name donors will see").fill(APPLY_ROBOT_CHARITY);
    await page.getByLabel("Registered legal name").fill(APPLY_ROBOT_CHARITY);
    await page.getByLabel("NPO number").fill("");
    await page.getByLabel("PBO reference number").fill("");
    await page.getByLabel("s18A reference number").fill("");
    await save();
    expect(await page.locator("body").innerText()).toMatch(/Enter an NPO number or a PBO reference number/);
    expect(await page.getByLabel("Name donors will see").inputValue()).toBe(APPLY_ROBOT_CHARITY);
  });

  it("refuses an s18A reference without a PBO number", async () => {
    await page.getByLabel("NPO number").fill("000-000 NPO");
    await page.getByLabel("s18A reference number").fill("TEST-18A");
    await save();
    expect(await page.locator("body").innerText()).toMatch(/must have a PBO reference number/);
  });

  it("saves the organisation step and says so", async () => {
    await page.getByLabel("s18A reference number").fill("");
    await page.getByLabel("NPO number").fill("000-000 NPO");
    await save();
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(BROKEN);
    expect(text).not.toMatch(/Enter an NPO number or a PBO reference number/);
    expect(text).toMatch(/Your organisation details are saved/);
    await page.goto(step("organisation"), { waitUntil: "networkidle" });
    expect(await page.getByLabel("NPO number").inputValue()).toBe("000-000 NPO");
  });

  it("refuses a postal code that isn't 4 digits, then saves a proper address", async () => {
    await page.goto(step("address"), { waitUntil: "networkidle" });
    await page.getByLabel("Street address").fill("1 Test Street");
    await page.getByLabel("City").fill("Johannesburg");
    await page.getByLabel("Postal code").fill("12");
    await save();
    expect(await page.locator("body").innerText()).toMatch(/Postal code is 4 digits/);
    expect(await page.getByLabel("Street address").inputValue()).toBe("1 Test Street");
    await page.getByLabel("Postal code").fill("2000");
    await save();
    await page.goto(step("address"), { waitUntil: "networkidle" });
    expect(await page.getByLabel("Postal code").inputValue()).toBe("2000");
    expect(await page.getByLabel("City").inputValue()).toBe("Johannesburg");
  });

  it("refuses a phone number that isn't South African, without saving the contact", async () => {
    await page.goto(step("contact"), { waitUntil: "networkidle" });
    await page.getByLabel("Full name").fill("Robot Tester");
    await page.getByLabel("Phone").fill("12345");
    await save();
    const text = await page.locator("body").innerText();
    expect(text).toMatch(/Use a South African number/);
    expect(text).not.toMatch(BROKEN);
  });

  it("refuses bank details that are wrong, and never saves any", async () => {
    await page.goto(step("bank"), { waitUntil: "networkidle" });
    await page.getByLabel("Account holder").fill("Robot test charity");
    await page.getByLabel("Account number").fill("12");
    await page.getByLabel("Branch code").fill("1");
    await save("Save bank details");
    const text = await page.locator("body").innerText();
    expect(text).toMatch(/Choose your bank|Account number is 6 to 16 digits|Branch code is 6 digits/);
    expect(text).not.toMatch(BROKEN);
    // Nothing was saved: a saved account would show "Saved account ends in".
    await page.goto(step("bank"), { waitUntil: "networkidle" });
    expect(await page.locator("body").innerText()).not.toMatch(/Saved account ends in/);
  });

  it("says which papers are needed on the documents step", async () => {
    await page.goto(step("documents"), { waitUntil: "networkidle" });
    const text = await page.locator("body").innerText();
    expect(text).toMatch(/PDF, JPG or PNG, up to 4 MB/);
    expect(text).not.toMatch(BROKEN);
  });

  it("won't let an unfinished application be submitted, and says what is left", async () => {
    await page.goto(step("submit"), { waitUntil: "networkidle" });
    const text = await page.locator("body").innerText();
    expect(text).toMatch(/A few steps still need finishing before you can submit/);
    expect(await page.getByRole("button", { name: /submit/i }).count()).toBe(0);
  });

  it("fits a phone screen on every step, with no script errors", async () => {
    for (const key of ["organisation", "address", "contact", "bank", "documents", "submit"]) {
      await page.goto(step(key), { waitUntil: "networkidle" });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `sideways scroll on the ${key} step`).toBeLessThanOrEqual(1);
    }
    expect(errors).toEqual([]);
  });
});
