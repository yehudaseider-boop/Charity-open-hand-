import { describe, expect, it } from "vitest";
import { POLICY_VERSION, policyVersionLabel } from "@/lib/policy";

describe("policyVersionLabel", () => {
  it("shows the version date the South African way", () => {
    expect(policyVersionLabel("2026-10-08-draft")).toBe("08/10/2026 (draft)");
    expect(policyVersionLabel("2027-01-15")).toBe("15/01/2027");
  });
  it("leaves an unusual version as it is", () => {
    expect(policyVersionLabel("v3")).toBe("v3");
  });
  it("never shows a year-first date for the current version", () => {
    expect(policyVersionLabel(POLICY_VERSION)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
