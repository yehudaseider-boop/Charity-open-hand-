/**
 * The brand fonts are our own files (17/11/2026): a build must never depend on downloading fonts from Google (a failed
 * download stopped three builds in a row). Guards the layout against going back to next/font/google, and every weight
 * the layout names must have its file next to its licence.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const layout = readFileSync(join(root, "src/app/layout.tsx"), "utf8");

describe("brand fonts", () => {
  it("are not downloaded from Google while building", () => {
    expect(layout).not.toMatch(/next\/font\/google/);
    expect(layout).toMatch(/next\/font\/local/);
  });

  // Bricolage only in 700 and 800, as the brand says (500 dropped 19/11/2026); DM Sans 400 to 700.
  it("have a file for every weight the layout names, and a licence beside them", () => {
    const paths = [...layout.matchAll(/path: "\.\.\/fonts\/([^"]+)"/g)].map((m) => m[1]);
    expect(paths.sort()).toEqual([
      "bricolage-grotesque-latin-700-normal.woff2",
      "bricolage-grotesque-latin-800-normal.woff2",
      "dm-sans-latin-400-normal.woff2",
      "dm-sans-latin-500-normal.woff2",
      "dm-sans-latin-600-normal.woff2",
      "dm-sans-latin-700-normal.woff2",
    ]);
    for (const p of paths) {
      const file = join(root, "src/fonts", p);
      expect(existsSync(file), p).toBe(true);
      // A real woff2 file starts with "wOF2".
      expect(readFileSync(file).subarray(0, 4).toString("latin1"), p).toBe("wOF2");
    }
    expect(existsSync(join(root, "src/fonts/OFL-bricolage-grotesque.txt"))).toBe(true);
    expect(existsSync(join(root, "src/fonts/OFL-dm-sans.txt"))).toBe(true);
  });
});
