// Clicks through the demo like a presenter would, at phone and laptop width, and fails loudly on anything off.
//   python3 demo/charity-dashboard/build.py && node demo/charity-dashboard/tests/walkthrough.mjs
// Uses the Playwright that comes with the cloud session (NODE_PATH=$(npm root -g)). SHOTS=<folder> saves screenshots.
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const here = path.dirname(fileURLToPath(import.meta.url));
const URL_ = "file://" + path.join(here, "..", "dist", "givezy-charity-dashboard-demo.html");
const SHOTS = process.env.SHOTS;
let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.log("FAIL:", msg); } else console.log("ok:", msg); };

const browser = await chromium.launch();
for (const width of [390, 1280]) {
  console.log(`\n--- ${width}px ---`);
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${width}.png`, fullPage: true }); };
  const noOverflow = async (where) => ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `no sideways scroll on ${where}`);
  const text = () => page.locator("main").innerText();
  const goto = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(150); };

  await page.goto(URL_ + "#overview");
  ok(await page.getByText("Sample data").first().isVisible(), "Sample data tag shows");
  for (const h of ["overview", "donations", "deposits", "donors", "donor-d22", "receipts", "campaigns"]) { await goto(h); await noOverflow(h); ok(await page.getByText("Sample data").first().isVisible(), `Sample data tag on ${h}`); }
  await goto("overview");
  const before = await page.locator(".stat.strong .value").innerText();
  const labels = await page.locator(".chart text[text-anchor=middle]").evaluateAll((els) => els.map((e) => e.textContent));
  ok(labels.length === 12 && labels.every((t) => /^(0[1-9]|1[0-2])$/.test(t)), `chart months as numbers, as on the real dashboard (${labels.join(" ")})`);

  // a. a new gift arrives: Saving… then Saved, on Overview and Donations
  await page.getByRole("button", { name: "Show a new gift" }).click();
  ok(await page.getByText("Saving…").first().isVisible(), "new gift shows Saving…");
  await page.waitForTimeout(1400);
  ok((await text()).includes("A new gift arrived: R1 500 from Naledi Example"), "what happened card for the new gift");
  ok(await page.locator(".pill.saved").first().isVisible(), "new gift shows Saved");
  const after = await page.locator(".stat.strong .value").innerText();
  ok(before !== after, `this month moved (${before} to ${after})`);
  await shot("a-new-gift");
  await goto("donations");
  const freshRow = page.locator("main tr.fresh, main li.fresh-row");
  ok(await freshRow.count() === 1 && (await freshRow.innerText()).includes("Naledi Example"), "new gift at the top of Donations");

  // b. issue its s18A receipt, then Undo, then issue again
  await goto("receipts");
  await page.locator("li.fresh-row").getByRole("button", { name: "Issue" }).click();
  await page.waitForTimeout(1000);
  ok((await text()).includes("s18A receipt issued to Naledi Example for R1 500"), "receipt issued");
  ok(await page.locator("li.fresh-row .s18a").count() === 1, "new gift is under Issued with a number");
  await page.getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(200);
  ok((await text()).includes("back to a draft"), "Undo puts the receipt back to a draft");
  await page.getByRole("button", { name: /^Drafts/ }).click();
  await page.locator("li.fresh-row").getByRole("button", { name: "Preview" }).click();
  ok(await page.locator(".dialog").getByText("SAMPLE: not a tax receipt").isVisible(), "receipt preview marked SAMPLE");
  await shot("b-receipt-preview");
  await page.keyboard.press("Escape");
  await page.locator("li.fresh-row").getByRole("button", { name: "Issue" }).click();
  await page.waitForTimeout(1000);
  await shot("b-receipt-issued");

  // c. a follow-up note for Naledi: empty first (kept, plain error), then saved, Undo, saved again
  await page.locator("main").getByRole("link", { name: /Add a follow-up note/ }).click();
  await page.waitForTimeout(150);
  await page.getByRole("button", { name: "Save note" }).click();
  ok((await text()).includes("Write a note first. Nothing was saved."), "empty note refused in plain words");
  await page.fill("#n-text", "Called to say thank you. Wants photos of the blankets.");
  await page.selectOption("#n-due", { index: 2 });
  await page.getByRole("button", { name: "Save note" }).click();
  await page.waitForTimeout(1000);
  ok((await text()).includes("Note saved for Naledi Example, with a reminder on"), "note saved with a reminder");
  await page.getByRole("button", { name: "Undo" }).click(); await page.waitForTimeout(150);
  ok(!(await text()).includes("Wants photos of the blankets"), "Undo takes the note off");
  await page.fill("#n-text", "Called to say thank you. Wants photos of the blankets.");
  await page.getByRole("button", { name: "Save note" }).click(); await page.waitForTimeout(1000);
  await shot("c-note");

  // d. Deposits: the gift is matched to a deposit
  await page.locator("main").getByRole("link", { name: /See where the money lands: Deposits/ }).click(); await page.waitForTimeout(200);
  ok((await text()).includes("Matched: Naledi Example's R1 500 is in this deposit"), "gift matched to a deposit");
  ok(await page.locator("main tr.fresh").count() === 1, "the gift is picked out in the deposit");
  ok((await text()).includes("Deposit of ") && (await text()).includes("Reached the bank"), "deposit page as in the real dashboard");
  await page.getByRole("link", { name: "← Deposits" }).click(); await page.waitForTimeout(150);
  ok(await page.locator(".deposit-row.fresh-dep").count() === 1, "deposit list picks out the new gift's deposit");
  ok(!(await page.locator("nav").innerText()).includes("Payouts"), "no Payouts tab");
  ok((await page.locator(".walk").innerText()).includes("4 of 4") || width < 600, "walkthrough shows 4 of 4");
  await shot("d-deposits");

  // CSV download (works from the file; the dialog has the copy fallback)
  await goto("donations");
  await page.selectOption("#f-campaign", "winter");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download CSV" }).click()]);
  const csv = await (await import("fs")).promises.readFile(await dl.path(), "utf8");
  ok(csv.split("\r\n")[0].includes("Date,Time,Donor,Email,Amount (rand)"), "CSV has its header");
  ok(csv.includes("Naledi Example") && !csv.includes("No campaign"), "CSV follows the campaign filter");
  ok(await page.locator(".dialog").getByText(/Your CSV/).isVisible(), "CSV dialog offers copy");
  await page.keyboard.press("Escape");
  await page.fill("#f-q", "zzzz");
  ok((await text()).includes("No donations match these filters"), "empty filter result explained");
  await page.getByRole("button", { name: "Clear the filters" }).first().click();

  // the failure done well
  ok((await text()).includes("Nothing was charged"), "declined monthly donation says nothing was charged");
  await page.getByRole("button", { name: /update-card link again/ }).click(); await page.waitForTimeout(1000);
  ok((await text()).includes("no email leaves this demo"), "resend link says no email leaves the demo");
  await shot("failure");

  // offline status
  await ctx.setOffline(true); await page.waitForTimeout(100);
  ok((await page.locator("#status").innerText()).includes("Offline"), "status says offline");
  await ctx.setOffline(false); await page.waitForTimeout(100);

  // e. reset asks first, then puts everything back
  const openReset = async () => { if (width < 600) { await page.locator(".walk-head button").first().click(); await page.locator(".walk").getByRole("button", { name: "Reset demo" }).click(); } else await page.getByRole("button", { name: "Reset demo" }).first().click(); };
  await openReset();
  await page.getByRole("button", { name: "Keep going" }).click();
  ok(await page.locator(".dialog").count() === 0, "Keep going closes the question");
  if (width < 600) await page.getByRole("button", { name: "Reset demo" }).click(); else await openReset();
  await page.getByRole("button", { name: "Yes, reset the demo" }).click(); await page.waitForTimeout(200);
  ok((await text()).includes("The demo is back to the start"), "reset confirmed");
  ok(await page.getByRole("button", { name: "Show a new gift" }).isVisible(), "Show a new gift is back");
  ok((await page.locator(".stat.strong .value").innerText()) === before, "this month back to the start figure");
  await page.reload(); await page.waitForTimeout(200);
  ok(await page.getByRole("button", { name: "Show a new gift" }).isVisible(), "still at the start after reloading");

  // a brand-new charity: every screen empty, and designed
  await page.evaluate(() => document.querySelector('[data-act="mode-empty"]').click()); await page.waitForTimeout(150);
  for (const h of ["overview", "donations", "deposits", "donors", "receipts", "campaigns"]) {
    await goto(h); await noOverflow(`empty ${h}`);
    ok(/No donations yet|No donors yet|No drafts|No deposits yet|No campaigns yet/.test(await text()), `empty ${h} says what will appear`);
    if (h === "overview") ok((await page.locator(".stat.strong .value").innerText()) === "R0", "zero shows as R0");
    await shot(`empty-${h}`);
  }
  await page.evaluate(() => document.querySelector('[data-act="mode-full"]').click()); await page.waitForTimeout(150);
  ok(await page.getByRole("button", { name: "Show a new gift" }).isVisible(), "back to the full sample");

  ok(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await ctx.close();
}
await browser.close();
console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
