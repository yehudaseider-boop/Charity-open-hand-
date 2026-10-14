import { describe, expect, it } from "vitest";
import { isValidSaIdNumber } from "@/lib/sa-id";

/** Build a valid test ID: date + sequence + citizenship + 8 + Luhn digit. */
function makeId(first12: string): string {
  for (let d = 0; d <= 9; d++) if (isValidSaIdNumber(first12 + d)) return first12 + d;
  throw new Error("no check digit");
}

describe("SA ID number check", () => {
  const valid = makeId("800101500908");

  it("accepts a well-formed number, with or without spaces", () => {
    expect(isValidSaIdNumber(valid)).toBe(true);
    expect(isValidSaIdNumber(`${valid.slice(0, 6)} ${valid.slice(6)}`)).toBe(true);
  });

  it("rejects a wrong check digit", () => {
    const wrong = valid.slice(0, 12) + ((Number(valid[12]) + 1) % 10);
    expect(isValidSaIdNumber(wrong)).toBe(false);
  });

  it("rejects impossible dates and wrong lengths", () => {
    expect(isValidSaIdNumber("8013015009080")).toBe(false); // month 13
    expect(isValidSaIdNumber("8002305009080")).toBe(false); // 30 Feb
    expect(isValidSaIdNumber("12345")).toBe(false);
    expect(isValidSaIdNumber("abcdefghijklm")).toBe(false);
  });
});
