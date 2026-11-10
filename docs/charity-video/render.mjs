// Plays video.built.html frame by frame in headless Chrome and encodes the frames to an MP4 with ffmpeg.
// Every frame is drawn at an exact time, so the video is smooth whatever the machine's speed.
// Run from the repo root, after build.mjs:   node docs/charity-video/render.mjs [out.mp4] [--stills]
//   --stills writes a few still frames (PNG) next to the MP4 to check the look, without making the video.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const dir = join(process.cwd(), "docs", "charity-video");
const out = process.argv.find((a) => a.endsWith(".mp4")) ?? join(dir, "Givezy-for-charities-45s.mp4");
const stills = process.argv.includes("--stills");
const FPS = 30;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto("file://" + join(dir, "video.built.html"), { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
const duration = await page.evaluate(() => window.DURATION);

if (stills) {
  const at = process.argv.filter((a) => /^\d+(\.\d+)?$/.test(a)).map(Number);
  for (const t of at.length ? at : [2.8, 7.4, 9.4, 14.5, 18.4, 20.5, 25.6, 31.6, 36.8, 40.9, 44]) {
    await page.evaluate((x) => window.renderAt(x), t);
    await page.screenshot({ path: join(dirname(out), `still-${String(t).replace(".", "_")}.png`) });
  }
  await browser.close();
  console.log("stills written to", dirname(out));
  process.exit(0);
}

const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "slow", "-crf", "18", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
const frames = Math.round(duration * FPS);
for (let i = 0; i < frames; i++) {
  await page.evaluate((x) => window.renderAt(x), i / FPS);
  const buf = await page.screenshot({ type: "jpeg", quality: 95 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  if (i % 150 === 0) console.log(`frame ${i} of ${frames}`);
}
ff.stdin.end();
await new Promise((r, j) => ff.on("close", (c) => (c === 0 ? r() : j(new Error("ffmpeg failed " + c)))));
await browser.close();
console.log("written", out);
