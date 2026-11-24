import "server-only";
import { createHash, createHmac, hkdfSync } from "node:crypto";

/**
 * Email fingerprints (decided 24/11/2026): how opt-outs, stop links and "already thanked" claims remember an address
 * without keeping it. Keyed, so someone who can read the database can't test a list of known addresses against them:
 * HMAC-SHA256 of the address's plain hash, with a key derived from ENCRYPTION_KEY (never stored in the database).
 *
 * Version 1 (before 24/11/2026) was the plain sha256 of the address, trimmed and in lower case. Version 2 is
 * HMAC(key, version 1), so every stored version 1 value can be turned into version 2 from the stored value alone
 * (`keyLegacyHash`, used by ./email-fingerprint-convert). Until every row is converted, lookups match both
 * (`emailHashesToMatch`), so an opt-out made before the change is never missed. Nothing is written at version 1 again.
 */

/** The version every new fingerprint is written at. */
export const EMAIL_HASH_VERSION = 2;

const LABEL = "givezy email fingerprint v1";

let cached: { raw: string; key: Buffer } | null = null;

function fingerprintKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  // Never falls back to the unkeyed hash: without the key nothing is fingerprinted, so nothing is sent or saved.
  if (!raw) throw new Error("Missing ENCRYPTION_KEY: email fingerprints need it. See .env.example.");
  if (cached?.raw === raw) return cached.key;
  const secret = Buffer.from(raw, "base64");
  if (secret.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  const key = Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), LABEL, 32));
  cached = { raw, key };
  return key;
}

/** The address as it is fingerprinted: trimmed, in lower case. */
const normalise = (email: string) => email.trim().toLowerCase();

/** Version 1: the plain sha256 of the address. Only to find rows not converted yet; never written again. */
function legacyEmailHash(email: string): string {
  return createHash("sha256").update(normalise(email)).digest("hex");
}

/** A stored version 1 value turned into version 2 (64 hex characters, like before). */
export function keyLegacyHash(legacy: string): string {
  return createHmac("sha256", fingerprintKey()).update(legacy).digest("hex");
}

/** The keyed fingerprint of an address: the one way every part of Givezy turns an address into a stored value. */
export function emailHash(email: string): string {
  return keyLegacyHash(legacyEmailHash(email));
}

/** The columns to write for an address: the keyed fingerprint, marked as version 2. */
export function storedEmailHash(email: string): { email_hash: string; email_hash_v: typeof EMAIL_HASH_VERSION } {
  return { email_hash: emailHash(email), email_hash_v: EMAIL_HASH_VERSION };
}

/**
 * The values to look these addresses up by: the keyed fingerprint, and the plain hash for rows not converted yet.
 * Two values per address, so callers ask for half as many addresses per request as before. Read rows back with
 * `keyedFromStored`, so a row found by its plain hash counts as the address's keyed fingerprint.
 */
export function emailHashesToMatch(emails: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const e of emails) {
    if (!e || !e.trim()) continue;
    const legacy = legacyEmailHash(e);
    out.add(keyLegacyHash(legacy));
    out.add(legacy);
  }
  return [...out];
}

/**
 * An address's keyed fingerprint and its plain hash, for a claim that must not succeed when either is stored already
 * (claim_thank_you_recipient). The plain value is only ever compared, never written.
 */
export function emailHashPair(email: string): { keyed: string; plain: string } {
  const plain = legacyEmailHash(email);
  return { keyed: keyLegacyHash(plain), plain };
}

/** A stored fingerprint as the keyed one: a version 1 row is keyed here, as the converter will key it. */
export function keyedFromStored(hash: string, version: unknown): string {
  return version === 1 ? keyLegacyHash(hash) : hash;
}
