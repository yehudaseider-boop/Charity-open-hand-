/**
 * The steps around erasing a donor: who is found, the email first, the account only for ordinary
 * donors, and an audit entry with counts only. The database, email and audit log are stand-ins.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const USER = "11111111-1111-1111-1111-111111111111";

const calls: string[] = [];
let donorsByUser: string[];
let donorsByEmail: string[];
let profile: { email?: string; role?: string } | null;
let charityAdminCount: number;
let rpcError: { message: string } | null;
let deleteUserError: { message: string } | null;
let rpcIds: string[] | null;
const audits: Record<string, unknown>[] = [];
const emails: { to: string; text: string }[] = [];
let mailFails = false;

vi.mock("@/lib/audit", () => ({ logAudit: async (e: Record<string, unknown>) => void (calls.push("audit"), audits.push(e)) }));
vi.mock("@/lib/email", () => ({
  getEmailTransport: () => ({
    send: async (m: { to: string; text: string }) => {
      calls.push("email");
      if (mailFails) throw new Error("mail down");
      emails.push(m);
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const f: Record<string, unknown> = {};
      const q = {
        select: (_c?: string, o?: { head?: boolean }) => (o?.head ? { eq: async () => ({ count: charityAdminCount }) } : q),
        eq: (c: string, v: unknown) => ((f[c] = v), q),
        maybeSingle: async () => ({ data: profile, error: null }),
        delete: () => ({
          // The charities' personal thank-yous to the erased donors: .in("donor_id", ids)
          in: async () => ({ error: null }),
          eq: (c1: string, v1: unknown) => ({
            // consents: .eq("user_id").eq("kind"); the person's own tables: one .eq("user_id")
            eq: async (c: string, v: unknown) => (calls.push(`consents:${c}=${v}`), { error: null }),
            then: (resolve: (v: { error: null }) => void) => (calls.push(`${table}:deleted:${c1}=${v1}`), resolve({ error: null })),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({ eq: async () => (calls.push(`${table}:update:${JSON.stringify(patch)}`), { error: null }) }),
        then: (resolve: (v: { data: unknown[]; error: null }) => void) => {
          const ids = table === "donors" ? (f.user_id ? donorsByUser : donorsByEmail) : [];
          resolve({ data: ids.map((id) => ({ id })), error: null });
        },
      };
      return q;
    },
    rpc: async (_name: string, args: { p_donor_ids: string[] }) => {
      calls.push("rpc");
      rpcIds = args.p_donor_ids;
      return rpcError ? { data: null, error: rpcError } : { data: { donors: args.p_donor_ids.length, checkout_details: 2, monthly_stopped: 1, giving_choices: 2, messages: 0, gateway_records: 3 }, error: null };
    },
    auth: {
      admin: {
        deleteUser: async () => {
          calls.push("deleteUser");
          return { error: deleteUserError };
        },
      },
    },
  }),
}));

const { eraseDonor } = await import("@/lib/privacy/erase");

beforeEach(() => {
  calls.length = 0;
  audits.length = 0;
  emails.length = 0;
  donorsByUser = ["d1"];
  donorsByEmail = ["d1", "d2"];
  profile = { email: "Erin@Example.co.za", role: "user" };
  charityAdminCount = 0;
  rpcError = null;
  deleteUserError = null;
  rpcIds = null;
  mailFails = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("erasing a donor by their account", () => {
  it("finds every donor record that is theirs (by account or by email, once each), erases, emails them, then deletes the account", async () => {
    const s = await eraseDonor({ userId: USER, actorUserId: "admin1" });
    expect(rpcIds?.sort()).toEqual(["d1", "d2"]);
    expect(calls).toEqual([
      "rpc",
      "email",
      ...["maaser_income_entries", "external_giving_entries", "donation_private_notes", "favourites", "maaser_settings", "saved_cards", "card_save_requests"].map((t) => `${t}:deleted:user_id=${USER}`),
      "consents:kind=account",
      "deleteUser",
      "audit",
    ]);
    expect(emails[0].to).toBe("erin@example.co.za");
    expect(emails[0].text).toContain("tax law requires");
    expect(emails[0].text).not.toMatch(/[!—]/);
    expect(s).toMatchObject({ donors: 2, checkout_details: 2, monthly_stopped: 1, accountDeleted: true });
  });

  it("the audit entry has counts only: no name, email or address", async () => {
    await eraseDonor({ userId: USER, actorUserId: "admin1" });
    expect(audits[0]).toMatchObject({ action: "privacy.donor_erased", actorUserId: "admin1", entityType: "user", entityId: USER });
    expect(JSON.stringify(audits)).not.toMatch(/erin|example\.co\.za/i);
  });

  it("keeps the sign-in account of someone who runs the platform or a charity, and says why", async () => {
    profile = { email: "boss@example.co.za", role: "platform_admin" };
    let s = await eraseDonor({ userId: USER, actorUserId: "admin1" });
    expect(s.accountDeleted).toBe(false);
    expect(s.note).toMatch(/platform admin/);
    expect(calls).not.toContain("deleteUser");

    calls.length = 0;
    profile = { email: "chair@example.co.za", role: "user" };
    charityAdminCount = 1;
    s = await eraseDonor({ userId: USER, actorUserId: "admin1" });
    expect(s.accountDeleted).toBe(false);
    expect(s.note).toMatch(/manage a charity/);
    expect(calls).toContain("rpc");
    // The account stays, but their own giving records and their name as a donor go.
    for (const t of ["maaser_income_entries", "external_giving_entries", "donation_private_notes", "favourites", "maaser_settings"]) {
      expect(calls).toContain(`${t}:deleted:user_id=${USER}`);
    }
    expect(calls).toContain('profiles:update:{"full_name":null}');
  });

  it("reports an account that could not be deleted, after the information was erased", async () => {
    deleteUserError = { message: "constraint" };
    const s = await eraseDonor({ userId: USER, actorUserId: "admin1" });
    expect(s.accountDeleted).toBe(false);
    expect(s.note).toMatch(/could not be deleted/);
  });

  it("a failed email does not stop the erasure", async () => {
    mailFails = true;
    const s = await eraseDonor({ userId: USER, actorUserId: "admin1" });
    expect(s.donors).toBe(2);
  });

  it("a failed erasure is an error, and the account is not deleted", async () => {
    rpcError = { message: "boom" };
    await expect(eraseDonor({ userId: USER, actorUserId: "admin1" })).rejects.toThrow(/Could not erase/);
    expect(calls).not.toContain("deleteUser");
    expect(audits).toHaveLength(0);
  });
});

describe("erasing a donor with no account", () => {
  it("finds them by the email they gave with and deletes no account", async () => {
    const s = await eraseDonor({ email: "Guest@Example.co.za", actorUserId: "admin1" });
    expect(rpcIds).toEqual(["d1", "d2"]);
    expect(emails[0].to).toBe("guest@example.co.za");
    expect(calls).not.toContain("deleteUser");
    expect(s.accountDeleted).toBe(false);
    expect(audits[0]).toMatchObject({ entityType: "donor", entityId: null });
  });

  it("needs someone to erase", async () => {
    await expect(eraseDonor({ actorUserId: "admin1" })).rejects.toThrow(/whose information/);
  });

  it("ignores an id that is not a user id", async () => {
    await eraseDonor({ userId: "not-a-uuid", email: "guest@example.co.za", actorUserId: "admin1" });
    expect(calls).not.toContain("deleteUser");
  });
});
