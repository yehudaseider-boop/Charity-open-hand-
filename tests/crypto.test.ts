import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

beforeAll(() => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("field encryption", () => {
  it("round-trips and never stores plaintext", async () => {
    const { encrypt, decrypt } = await import("@/lib/crypto");
    const stored = encrypt("62812345678");
    expect(stored).not.toContain("62812345678");
    expect(stored.startsWith("v1.")).toBe(true);
    expect(decrypt(stored)).toBe("62812345678");
  });

  it("gives different ciphertext each time", async () => {
    const { encrypt } = await import("@/lib/crypto");
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });

  it("detects tampering", async () => {
    const { encrypt, decrypt } = await import("@/lib/crypto");
    const parts = encrypt("62812345678").split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
  });

  it("masks to last 4", async () => {
    const { last4 } = await import("@/lib/crypto");
    expect(last4("6281 2345 678")).toBe("5678");
  });
});
