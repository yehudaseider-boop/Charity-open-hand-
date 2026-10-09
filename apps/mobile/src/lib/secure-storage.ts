import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Where the sign-in session is kept on the phone: the iOS Keychain / Android
 * Keystore (expo-secure-store), never plain storage. Secure store values are
 * kept small, so a long session is split into chunks.
 *
 * On the web preview it falls back to the browser's storage.
 */
const CHUNK = 1800;
const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, "_");

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === "web") return globalThis.localStorage?.getItem(key) ?? null;
    const k = safeKey(key);
    const count = Number(await SecureStore.getItemAsync(`${k}.n`));
    if (!count) return null;
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${k}.${i}`);
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join("");
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") return globalThis.localStorage?.setItem(key, value);
    const k = safeKey(key);
    await secureStorage.removeItem(key);
    const count = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < count; i++) await SecureStore.setItemAsync(`${k}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    await SecureStore.setItemAsync(`${k}.n`, String(count));
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === "web") return globalThis.localStorage?.removeItem(key);
    const k = safeKey(key);
    const count = Number(await SecureStore.getItemAsync(`${k}.n`)) || 0;
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${k}.${i}`);
    await SecureStore.deleteItemAsync(`${k}.n`);
  },
};
