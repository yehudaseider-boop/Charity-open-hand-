/** The robot's authenticator codes, checked against the published test values of RFC 6238 (SHA-1). */
import { describe, expect, it } from "vitest";
import { totpCode } from "../e2e/totp";

// "12345678901234567890" in base32.
const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("authenticator codes for the robot", () => {
  it("matches the standard's test values", () => {
    expect(totpCode(SECRET, 59_000, 8)).toBe("94287082");
    expect(totpCode(SECRET, 1_111_111_109_000, 8)).toBe("07081804");
    expect(totpCode(SECRET, 1_234_567_890_000, 8)).toBe("89005924");
    expect(totpCode(SECRET, 20_000_000_000_000, 8)).toBe("65353130");
  });
  it("gives the 6 digits an authenticator app shows", () => {
    expect(totpCode(SECRET, 59_000)).toBe("287082");
  });
});
