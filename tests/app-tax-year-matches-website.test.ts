/**
 * The app keeps its own copy of the tax-year rule (it can't read src/config/platform.ts). This keeps the copy honest:
 * for every day across several years, including the 28/29 February and 1 March edges, the app and the website name
 * the same tax year. If the start month in platform.ts ever changes, this fails until the app follows (18/11/2026).
 */
import { describe, expect, it } from "vitest";
import { taxYearFor as websiteTaxYear, taxYearName as websiteName } from "@/lib/dates";
import { taxYearFor as appTaxYear, taxYearName as appName } from "../apps/mobile/src/lib/tax-year";

describe("the app's tax year matches the website's", () => {
  it("agrees on every day from 2024 to 2029", () => {
    const mismatches: string[] = [];
    for (let t = Date.UTC(2024, 0, 1); t <= Date.UTC(2029, 11, 31); t += 86_400_000) {
      const iso = new Date(t).toISOString().slice(0, 10);
      const [y, m, d] = iso.split("-").map(Number);
      // The app is handed a Johannesburg calendar day (its own date fields); the website takes the date itself.
      const app = appTaxYear(new Date(y, m - 1, d));
      const web = websiteTaxYear(`${iso}T12:00:00+02:00`);
      if (app !== web) mismatches.push(`${iso}: app ${app}, website ${web}`);
    }
    expect(mismatches).toEqual([]);
  });

  it("names a tax year the same way", () => {
    for (const y of [2025, 2026, 2027, 2100]) expect(appName(y)).toBe(websiteName(y));
  });
});
