import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Where the sign-in session and personal records are kept on the phone: the
 * iOS Keychain / Android Keystore (expo-secure-store), never plain storage.
 * Secure store values are kept small, so a long value is split into chunks.
 *
 * Writes are safe if the app is closed half-way: new chunks are written under
 * a new generation first, and only then does the pointer (`<key>.n`, as
 * "generation:count") switch to them. Operations on one key run one at a time.
 * Values are JSON text. Non-ASCII characters are stored as JSON \u escapes
 * (which JSON.parse reads back as the same text), so a chunk never exceeds
 * its byte limit.
 *
 * On the web preview it falls back to the browser's storage.
 */
const CHUNK = 1800;
const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, "_");
const toAscii = (v: string) => v.replace(/[\u0080-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

/** "3:12" -> generation 3, 12 chunks. Older values were a bare count (generation 0, unprefixed chunks). */
function parsePointer(raw: string | null): { gen: number; count: number } | null {
  if (!raw) return null;
  const m = raw.match(/^(?:(\d+):)?(\d+)$/);
  return m ? { gen: m[1] === undefined ? 0 : Number(m[1]), count: Number(m[2]) } : null;
}
const chunkKey = (k: string, gen: number, i: number) => (gen === 0 ? `${k}.${i}` : `${k}.g${gen}.${i}`);

const queues = new Map<string, Promise<unknown>>();
function serial<T>(key: string, job: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev.then(job, job);
  queues.set(key, next.catch(() => undefined));
  return next;
}

async function readNative(k: string): Promise<string | null> {
  const ptr = parsePointer(await SecureStore.getItemAsync(`${k}.n`));
  if (!ptr || !ptr.count) return null;
  const parts: string[] = [];
  for (let i = 0; i < ptr.count; i++) {
    const part = await SecureStore.getItemAsync(chunkKey(k, ptr.gen, i));
    if (part === null) return null;
    parts.push(part);
  }
  return parts.join("");
}

async function dropChunks(k: string, ptr: { gen: number; count: number } | null) {
  if (!ptr) return;
  for (let i = 0; i < ptr.count; i++) await SecureStore.deleteItemAsync(chunkKey(k, ptr.gen, i)).catch(() => undefined);
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === "web") return globalThis.localStorage?.getItem(key) ?? null;
    const k = safeKey(key);
    return serial(k, () => readNative(k));
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") return globalThis.localStorage?.setItem(key, value);
    const k = safeKey(key);
    return serial(k, async () => {
      const old = parsePointer(await SecureStore.getItemAsync(`${k}.n`));
      const gen = (old?.gen ?? 0) + 1;
      const ascii = toAscii(value);
      const count = Math.max(1, Math.ceil(ascii.length / CHUNK));
      for (let i = 0; i < count; i++) await SecureStore.setItemAsync(chunkKey(k, gen, i), ascii.slice(i * CHUNK, (i + 1) * CHUNK));
      await SecureStore.setItemAsync(`${k}.n`, `${gen}:${count}`);
      await dropChunks(k, old);
    });
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === "web") return globalThis.localStorage?.removeItem(key);
    const k = safeKey(key);
    return serial(k, async () => {
      const old = parsePointer(await SecureStore.getItemAsync(`${k}.n`));
      await SecureStore.deleteItemAsync(`${k}.n`);
      await dropChunks(k, old);
    });
  },
};
