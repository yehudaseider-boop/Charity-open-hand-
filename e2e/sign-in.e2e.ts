/**
 * Signing in, end to end, with a real code from the TEST project (no email is sent: Supabase hands the robot the code
 * directly). This is the check that would have caught the 8-digit code the app refused (18/11/2026).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "playwright-core";
import { cleanCode } from "../apps/mobile/src/lib/live-giving";
import { SIGN_IN_CODE } from "../src/lib/sign-in-code";
import { BROKEN, SITE, canSignIn, ensureRobot, freshSignIn, openBrowser } from "./setup";

let browser: Browser;
beforeAll(async () => {
  if (!canSignIn) return;
  await ensureRobot();
  browser = await openBrowser();
});
afterAll(async () => {
  await browser?.close();
});

describe.skipIf(!canSignIn)("signing in with the code Supabase really sends", () => {
  it("the code is one the phone app and the website both accept", async () => {
    const { code } = await freshSignIn();
    expect(cleanCode(code)).toBe(code);
    expect(SIGN_IN_CODE.test(code)).toBe(true);
    // Typed the way people do: with a space in the middle.
    expect(cleanCode(`${code.slice(0, 4)} ${code.slice(4)}`)).toBe(code);
  });

  it("signs in on the website, and the account page loads without an error", async () => {
    const { tokenHash } = await freshSignIn();
    const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${SITE}/auth/callback?token_hash=${tokenHash}&type=email&next=/account`, { waitUntil: "networkidle" });
    // A first sign-in asks to agree to the Terms once.
    if (new URL(page.url()).pathname === "/agree") {
      await page.locator('input[name="agree"]').check();
      await page.locator('input[name="age"]').check();
      await page.getByRole("button", { name: "Continue" }).click();
      await page.waitForURL("**/account", { timeout: 20_000 });
    }
    expect(new URL(page.url()).pathname).toBe("/account");
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(BROKEN);
    // Signed in: not sent back to the sign-in form.
    expect(text).not.toMatch(/Email me a sign-in code/);
    expect(errors).toEqual([]);
    await page.close();
  });

  it("refuses a code that has already been used", async () => {
    const { tokenHash } = await freshSignIn();
    const page = await browser.newPage();
    await page.goto(`${SITE}/auth/callback?token_hash=${tokenHash}&type=email&next=/account`, { waitUntil: "networkidle" });
    await page.context().clearCookies();
    await page.goto(`${SITE}/auth/callback?token_hash=${tokenHash}&type=email&next=/account`, { waitUntil: "networkidle" });
    expect(new URL(page.url()).pathname).toBe("/login");
    await page.close();
  });
});
