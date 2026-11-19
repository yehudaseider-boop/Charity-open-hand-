/** A full privacy request box with line breaks is accepted: the browser counts a line break as 1 and sends \r\n. */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({ requireViewer: async () => ({ userId: "u1" }) }));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/rate-limit", () => ({ hitRateLimit: async () => false }));
vi.mock("@/lib/email", () => ({ getEmailTransport: () => ({ send: async () => {} }) }));
const inserted: Record<string, unknown>[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ insert: async (row: Record<string, unknown>) => (inserted.push(row), { error: null }) }) }),
}));

const { sendDataRequest } = await import("@/app/account/data/actions");

describe("privacy request details", () => {
  it("counts a line break as one character, as the box does", async () => {
    const f = new FormData();
    f.set("kind", "correct");
    f.set("details", `${"a\r\n".repeat(999)}a`); // 1 999 in the box, 2 998 as sent
    const r = await sendDataRequest({ ok: false }, f);
    expect(r.ok).toBe(true);
    expect(inserted[0].details).toBe(`${"a\n".repeat(999)}a`);
  });
  it("still refuses more than 2 000 characters", async () => {
    const f = new FormData();
    f.set("kind", "correct");
    f.set("details", "a".repeat(2001));
    expect((await sendDataRequest({ ok: false }, f)).ok).toBe(false);
  });
});
