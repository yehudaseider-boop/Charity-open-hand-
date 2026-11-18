/**
 * The phone app's own screens (its web build, pointed at the TEST project), used the way a person does. The sign-in
 * email is never sent: the robot answers the "send me a code" request itself and takes a real code from Supabase.
 * Skipped unless E2E_APP_URL says where the build is served (GitHub builds and serves it; see .github/workflows/e2e.yml).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";
import { APP_URL, BROKEN, ROBOT_EMAIL, canSignIn, ensureRobot, freshSignIn, openBrowser } from "./setup";

let browser: Browser;
beforeAll(async () => {
  if (!APP_URL) return;
  if (canSignIn) await ensureRobot();
  browser = await openBrowser();
});
afterAll(async () => {
  await browser?.close();
});

/** A phone-sized page on the app's sign-in screen with the email typed and "send" pressed (no email goes out). */
async function atCodeBox(): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/auth/v1/otp**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await page.getByText("I already have an account").click();
  await page.getByLabel("Email").fill(ROBOT_EMAIL);
  await page.getByRole("button", { name: "Send me a sign-in code" }).click();
  await page.getByText("Check your email").waitFor({ timeout: 20_000 });
  return { page, errors };
}

describe.skipIf(!APP_URL)("the phone app", () => {
  it("opens on the welcome screen without an error", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(APP_URL, { waitUntil: "networkidle" });
    const text = await page.locator("body").innerText();
    expect(text).toContain("I already have an account");
    expect(text).not.toMatch(BROKEN);
    expect(errors).toEqual([]);
    await page.close();
  });

  it("takes an 8-digit code to Supabase, and says plainly when it is wrong (the 18/11/2026 break)", async () => {
    const { page, errors } = await atCodeBox();
    await page.getByLabel("Code").fill("1234 5678");
    await page.getByRole("button", { name: "Sign in" }).click();
    // Refused by Supabase (a made-up code), not by the app for its length.
    await expect.poll(async () => page.locator("body").innerText(), { timeout: 20_000 }).toMatch(/didn.t work or has expired/);
    expect(await page.locator("body").innerText()).not.toMatch(/Enter the code from the email/);
    expect(errors).toEqual([]);
    await page.close();
  });

  it.skipIf(!canSignIn)("signs in with the real code, then Account and Progress load", async () => {
    const { page, errors } = await atCodeBox();
    const { code } = await freshSignIn();
    await page.getByLabel("Code").fill(code);
    await page.getByRole("button", { name: "Sign in" }).click();
    // A first sign-in asks to agree to the Terms once (two ticks, then Continue).
    const agree = page.getByRole("checkbox");
    if (await agree.first().isVisible({ timeout: 15_000 }).catch(() => false)) {
      for (const box of await agree.all()) await box.click();
      await page.getByRole("button", { name: /continue|agree/i }).first().click();
    }
    await expect.poll(async () => page.locator("body").innerText(), { timeout: 30_000 }).toContain(ROBOT_EMAIL);
    await page.getByText("Progress", { exact: true }).last().click();
    await page.waitForTimeout(3_000);
    expect(await page.locator("body").innerText()).not.toMatch(BROKEN);
    expect(errors).toEqual([]);
    await page.close();
  });
});
