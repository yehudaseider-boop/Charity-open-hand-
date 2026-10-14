import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

/**
 * Field encryption for sensitive values (bank account numbers, ID numbers,
 * tax reference numbers, maaser income). AES-256-GCM with a key held only in
 * the ENCRYPTION_KEY environment variable, never in the database.
 *
 * Stored format: "v1.<iv>.<auth tag>.<ciphertext>", each part base64url.
 * The version prefix lets us rotate keys later without a rewrite.
 */

const VERSION = "v1";

function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("Missing ENCRYPTION_KEY. See .env.example.");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  return buf;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ct].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decrypt(stored: string): string {
  const [version, iv, tag, ct] = stored.split(".");
  if (version !== VERSION || !iv || !tag || ct === undefined) throw new Error("Unrecognised encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

/** Last 4 characters, for masked display ("•••• 1234"). */
export function last4(value: string): string {
  return value.replace(/\s/g, "").slice(-4);
}

/**
 * A keyed fingerprint of the s18A identity a donor typed (never the number
 * itself), so receipts can tell two people apart who share an email address.
 * Same person, same number: same fingerprint.
 */
export function receiptIdentity(v: { donorType: string; idNumber?: string; taxReference?: string; registrationNumber?: string }): string {
  const clean = (s?: string) => (s ?? "").replace(/[\s/-]/g, "").toUpperCase();
  const basis =
    v.donorType === "individual"
      ? clean(v.idNumber)
        ? `id:${clean(v.idNumber)}`
        : `tax:${clean(v.taxReference)}`
      : `reg:${clean(v.registrationNumber)}`;
  return createHmac("sha256", key()).update(`receipt-identity|${v.donorType}|${basis}`).digest("base64url");
}
