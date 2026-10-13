/** An in-memory keychain for unit tests, with a switch to make writes fail. */
export const keychain = new Map<string, string>();
export const fail = { writeAfter: Infinity, writes: 0 };
export async function getItemAsync(k: string) {
  return keychain.get(k) ?? null;
}
export async function setItemAsync(k: string, v: string) {
  if (++fail.writes > fail.writeAfter) throw new Error("keychain full");
  keychain.set(k, v);
}
export async function deleteItemAsync(k: string) {
  keychain.delete(k);
}
