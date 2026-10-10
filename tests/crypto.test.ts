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

describe("receipt identity fingerprint", () => {
  it("is the same for the same person however the number is typed, and never contains the number", async () => {
    const { receiptIdentity } = await import("@/lib/crypto");
    const a = receiptIdentity({ donorType: "individual", idNumber: "800101 5009 087" });
    expect(a).toBe(receiptIdentity({ donorType: "individual", idNumber: "8001015009087" }));
    expect(a).not.toContain("8001015009087");
    expect(a).not.toBe(receiptIdentity({ donorType: "individual", idNumber: "8001015009088" }));
    expect(receiptIdentity({ donorType: "individual", taxReference: "0123456789" })).not.toBe(a);
    expect(receiptIdentity({ donorType: "company", registrationNumber: "2020/123456/07" })).toBe(
      receiptIdentity({ donorType: "company", registrationNumber: "2020 123456 07" }),
    );
  });
});
