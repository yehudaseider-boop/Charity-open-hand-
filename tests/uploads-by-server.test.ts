/**
 * Files are written to storage by the website's server only, after it has checked who the person is, their role and the
 * file, never with the signed-in person's own access (security review 18/11/2026; the database refuses browser writes to
 * storage, migration 20261118000001). Reading with the person's own access (a signed link to a document they may see)
 * is fine. This checks every file in src: any upload, removal, move or copy goes through the server's own client.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = new URL("../src/", import.meta.url).pathname;
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
  });
}

const WRITES = /(\w+|\))\s*\.storage\b[\s\S]{0,80}?\.(upload|remove|update|move|copy|createSignedUploadUrl|uploadToSignedUrl)\(/g;

describe("storage writes", () => {
  const all = files(root).map((p) => ({ p: p.slice(root.length), code: readFileSync(p, "utf8") }));

  it("every upload, removal, move or copy uses the server's own client", () => {
    const wrong: string[] = [];
    for (const { p, code } of all) {
      for (const m of code.matchAll(WRITES)) {
        const receiver = m[1];
        // `createAdminClient().storage...`, or a local `db` / `admin` made by `= createAdminClient()` in the same file.
        // The receipt store is handed its client by its callers (checked in the next test): always the server's own.
        if (p === "lib/receipts/store.ts" && receiver === "db") continue;
        const ok = receiver === ")" ? /createAdminClient\(\)\s*\.storage/.test(m[0] + "") || code.slice(Math.max(0, (m.index ?? 0) - 30), (m.index ?? 0) + 1).includes("createAdminClient(") : new RegExp(`(const|let)\\s+${receiver}\\s*=\\s*(await\\s+)?createAdminClient\\(\\)`).test(code);
        if (!ok) wrong.push(`${p}: ${m[0].replace(/\s+/g, " ").slice(0, 80)}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("the receipt store is only ever given the server's own client", () => {
    const wrong: string[] = [];
    let calls = 0;
    for (const { p, code } of all) {
      if (p === "lib/receipts/store.ts") continue;
      for (const m of code.matchAll(/supabaseReceiptStore\(([^()]*(?:\(\))?)\)/g)) {
        calls++;
        const arg = m[1].trim();
        const ok = arg === "createAdminClient()" || new RegExp(`(const|let)\\s+${arg}\\s*=\\s*(await\\s+)?createAdminClient\\(\\)`).test(code);
        if (!ok) wrong.push(`${p}: ${m[0]}`);
      }
    }
    expect(calls).toBeGreaterThan(0);
    expect(wrong).toEqual([]);
  });

  it("the three upload actions are among them", () => {
    for (const file of ["app/charity-admin/[id]/profile/actions.ts", "app/charity-admin/[id]/updates/actions.ts", "app/charity-admin/[id]/application/actions.ts"]) {
      const code = all.find((f) => f.p === file)!.code;
      expect([...code.matchAll(WRITES)].some((m) => m[2] === "upload")).toBe(true);
    }
  });
});
