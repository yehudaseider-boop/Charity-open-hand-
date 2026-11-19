/**
 * The charity dashboard at a real charity's size (19/11/2026). The TEST project holds "Load test charity (made-up
 * data)": 3 000 made-up donors, about 20 000 gifts over two years and 400 monthly donations, all with addresses at
 * example.invalid (which can never receive mail) and monthly charges dated 2099 (so nothing is ever collected).
 * The robot is a Viewer of it. Each page is timed and must open without an error within the limit below; the times
 * are printed so a slow page shows up before a real charity finds it. Skipped when that charity isn't there.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, BrowserContext } from "playwright-core";
import { BROKEN, SITE, canSignIn, charityViewerCookies, ensureRobot, openBrowser, removeRobotAuthenticators } from "./setup";

const SLUG = "load-test-charity";
/** Slower than this is a problem a charity would feel. */
const LIMIT_MS = 6_000;

let browser: Browser;
let context: BrowserContext;
let id = "";
const times: [string, number][] = [];
const errors: string[] = [];

async function findCharity(): Promise<string> {
  if (!canSignIn) return "";
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(process.env.E2E_SUPABASE_URL ?? "", process.env.E2E_SUPABASE_SECRET_KEY ?? "", { auth: { persistSession: false } });
  const { data } = await db.from("charities").select("id").eq("slug", SLUG).maybeSingle();
  return (data?.id as string | undefined) ?? "";
}

beforeAll(async () => {
  id = await findCharity();
  if (!id) return;
  await ensureRobot();
  const { cookies, error } = await charityViewerCookies();
  if (error) throw new Error(`The robot could not sign in with its second step: ${error}`);
  browser = await openBrowser();
  context = await browser.newContext({ viewport: { width: 375, height: 800 } });
  await context.addCookies(cookies);
});

afterAll(async () => {
  await browser?.close();
  if (id) await removeRobotAuthenticators();
  if (times.length) {
    console.log("\n[dashboard at size] seconds to open each page (3 000 donors, ~20 000 gifts):");
    for (const [name, ms] of times) console.log(`  ${(ms / 1000).toFixed(2).padStart(6)}  ${name}`);
  }
});

describe.skipIf(!canSignIn)("the charity dashboard with 3 000 donors and 20 000 gifts", () => {
  for (const [name, path] of [
    ["overview", ""],
    ["donations", "/donations"],
    ["donations, page 10", "/donations?page=10"],
    ["donations, searching a surname", "/donations?q=Naidoo"],
    ["donors", "/donors"],
    ["donors, searching a surname", "/donors?q=Pillay"],
    ["monthly donations", "/monthly"],
    ["stopped monthly donations", "/monthly/stopped"],
    ["campaigns", "/campaigns"],
    ["activity", "/activity"],
    ["report", "/report"],
    ["s18A receipts", "/receipts"],
    ["keeping donors", "/keeping"],
  ] as const) {
    it(`opens ${name} in under ${LIMIT_MS / 1000} seconds`, async (ctx) => {
      if (!id) ctx.skip();
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
      // Once to wake the hosting (a cold start is not the page's own speed), then timed.
      await page.goto(`${SITE}/charity-admin/${id}${path}`, { waitUntil: "networkidle" });
      const started = Date.now();
      const res = await page.goto(`${SITE}/charity-admin/${id}${path}`, { waitUntil: "networkidle" });
      const ms = Date.now() - started;
      times.push([name, ms]);
      const text = await page.locator("body").innerText();
      const where = new URL(page.url()).pathname;
      await page.close();
      expect(res?.status() ?? 0).toBeLessThan(400);
      expect(where).toBe(`/charity-admin/${id}${path.split("?")[0]}`);
      expect(text).not.toMatch(BROKEN);
      expect(ms).toBeLessThan(LIMIT_MS);
    });
  }

  it("had no script errors on any page", (ctx) => {
    if (!id) ctx.skip();
    expect(errors).toEqual([]);
  });
});
