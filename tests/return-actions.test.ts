import { describe, expect, it } from "vitest";
import { cameFromApp, returnActions } from "@/lib/donations/return-actions";

describe("returnActions", () => {
  it("app gift: only the way back, never a website retry", () => {
    for (const status of ["failed", "pending", "paid"] as const) {
      expect(returnActions({ cameFrom: "app", status })).toEqual({ backToApp: true, tryAgain: false });
    }
  });
  it("website gift: retry on failed and pending, nothing on paid", () => {
    expect(returnActions({ cameFrom: "website", status: "failed" })).toEqual({ backToApp: false, tryAgain: true });
    expect(returnActions({ cameFrom: "website", status: "pending" })).toEqual({ backToApp: false, tryAgain: true });
    expect(returnActions({ cameFrom: "website", status: "paid" })).toEqual({ backToApp: false, tryAgain: false });
  });
  it("the address mark is only an extra hint", () => {
    expect(cameFromApp({ cameFrom: "website", fromParam: true })).toBe(true);
    expect(cameFromApp({ cameFrom: "app", fromParam: false })).toBe(true);
  });
  it("a missing hint keeps the website retry", () => {
    expect(returnActions({ status: "failed" }).tryAgain).toBe(true);
    expect(returnActions({ cameFrom: null, fromParam: false, status: "pending" }).tryAgain).toBe(true);
  });
});
