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
/** The address on each donor record linked to their account, when it differs from the account's. */
let donorEmails: Record<string, string>;
let profile: { email?: string; role?: string } | null;
let charityAdminCount: number;
let rpcError: { message: string } | null;
let deleteUserError: { message: string } | null;
let rpcIds: string[] | null;
const audits: Record<string, unknown>[] = [];
/** Which rows each update was for ("table:column=value"). */
const updateFilters: string[] = [];
const emails: { to: string; text: string }[] = [];
let mailFails = false;
/** Rows the receipt-check scan finds: the donor's gifts, their receipt decisions, and the charity's certificate actions. */
let giftRows: Record<string, unknown>[];
let decisionRows: Record<string, unknown>[];
let certificateActionRows: Record<string, unknown>[];
/** Tables a bulk delete by donor id ran on. */
const deletedByDonor: string[] = [];

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
        in: (c: string, v: unknown) => ((f[c] = v), q),
        ilike: (c: string, v: unknown) => ((f[c] = v), q),
        order: () => q,
        // Pages of the history scans: nothing on the page past the first.
        range: async (from: number) => {
          if (from !== 0) return { data: [], error: null };
          if (table === "donors") return { data: (f.user_id ? donorsByUser : donorsByEmail).map((id) => ({ id })), error: null };
          if (table === "donations") return { data: giftRows, error: null };
          if (table === "receipt_plan_decisions") return { data: decisionRows, error: null };
          if (table === "charity_actions" && Array.isArray(f.kind) && (f.kind as string[]).includes("certificate_approved")) return { data: certificateActionRows, error: null };
          return { data: [], error: null };
        },
        maybeSingle: async () => ({ data: profile, error: null }),
        delete: () => ({
          // The charities' personal thank-yous to the erased donors: .in("donor_id", ids)
          in: async (c: string) => (c === "donor_id" && deletedByDonor.push(table), { error: null }),
          // The rate limiter's rows for an email together with an internet address: .like("key", "<stand-in>|%")
          like: async (c: string, v: unknown) => (calls.push(`${table}:deleted:${c}~${v}`), { error: null }),
          eq: (c1: string, v1: unknown) => ({
            // consents: .eq("user_id").eq("kind"); the person's own tables: one .eq("user_id")
            eq: async (c: string, v: unknown) => (calls.push(`consents:${c}=${v}`), { error: null }),
            // charity_requests: .eq("notify_email").is("requested_by", null)
            is: async (c: string, v: unknown) => (calls.push(`${table}:deleted:${c1}=${v1},${c}=${v}`), { error: null }),
            // gift starts: .eq("bucket", "checkout-start").like("key", "%|<stand-in>")
            like: async (c: string, v: unknown) => (calls.push(`${table}:deleted:${c1}=${v1},${c}~${v}`), { error: null }),
            then: (resolve: (v: { error: null }) => void) => (calls.push(`${table}:deleted:${c1}=${v1}`), resolve({ error: null })),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          // receipt_plan_decisions: the private note cleared for all their donor records
          in: async (c: string, v: unknown) => (calls.push(`${table}:update:${JSON.stringify(patch)}`), updateFilters.push(`${table}:${c}=${JSON.stringify(v)}`), { error: null }),
          eq: async (c: string, v: unknown) => (calls.push(`${table}:update:${JSON.stringify(patch)}`), updateFilters.push(`${table}:${c}=${v}`), { error: null }),
        }),
        then: (resolve: (v: { data: unknown[]; error: null }) => void) => {
          const ids = table === "donors" ? (f.user_id ? donorsByUser : donorsByEmail) : [];
          resolve({ data: ids.map((id) => ({ id, ...(donorEmails[id] ? { email: donorEmails[id] } : {}) })), error: null });
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
const { hashedKey } = await import("@/lib/rate-limit");
/**
 * The rate limiter's three deletes for an address: its keyed stand-in exactly, it with an internet address, and the
 * gift starts that pair one of their gifts with it (review 23/11/2026).
 */
const limitRows = (address: string) => {
  const key = hashedKey("email", address) as string;
  // An "_" in the stand-in is a wildcard in a pattern, so it is escaped: only this stand-in can match.
  const escaped = key.replace(/_/g, "\\_");
  return [
    `rate_limit_events:deleted:key=${key}`,
    `rate_limit_events:deleted:key~${escaped}|%`,
    `rate_limit_events:deleted:bucket=checkout-start,key~%|${escaped}`,
  ];
};

beforeEach(() => {
  calls.length = 0;
  audits.length = 0;
  updateFilters.length = 0;
  emails.length = 0;
  donorsByUser = ["d1"];
  donorsByEmail = ["d1", "d2"];
  donorEmails = {};
  profile = { email: "Erin@Example.co.za", role: "user" };
  charityAdminCount = 0;
  rpcError = null;
  deleteUserError = null;
  rpcIds = null;
  mailFails = false;
  giftRows = [];
  decisionRows = [];
  certificateActionRows = [];
  deletedByDonor.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("erasing a donor by their account", () => {
  it("finds every donor record that is theirs (by account or by email, once each), erases, deletes the account, then emails them", async () => {
    const s = await eraseDonor({ userId: USER, actorUserId: "admin1" });
    expect(rpcIds?.sort()).toEqual(["d1", "d2"]);
    expect(calls).toEqual([
      // What a charity wrote on a receipt decision about them: its private note is cleared (review 23/11/2026).
      'receipt_plan_decisions:update:{"note":null}',
      // Their email on the landing page's launch list goes too (10/11/2026).
      "launch_list:deleted:email=erin@example.co.za",
      // Their "Request a charity" asks, by account and by the email left to hear back (15/11/2026).
      "charity_requests:deleted:requested_by=11111111-1111-1111-1111-111111111111",
      // By the email: only a request made without signing in goes; one another signed-in donor made keeps their
      // part, and only this person's address and agreement are cleared (review 23/11/2026).
      "charity_requests:deleted:notify_email=erin@example.co.za,requested_by=null",
      'charity_requests:update:{"notify_email":null,"consent_version":null}',
      // A charity's imported copy of them (its contact list) goes too, with its tags (20/11/2026).
      "charity_contacts:deleted:email=erin@example.co.za",
      // Their address in the rate limiter, by the limiter's own keyed stand-in (review 23/11/2026).
      ...limitRows("erin@example.co.za"),
      // The database erasure comes after everything that finds them by address or donor record (13/11/2026), so an
      // erasure that stops part way can be finished by running it again.
      "rpc",
      ...["maaser_income_entries", "external_giving_entries", "donation_private_notes", "favourites", "maaser_settings", "saved_cards", "card_save_requests"].map((t) => `${t}:deleted:user_id=${USER}`),
      // Charities' thank-yous shown in the app (24/11/2026).
      `donor_messages:deleted:user_id=${USER}`,
      "consents:kind=account",
      "deleteUser",
      // The email goes once the account is gone, so someone with an account but no gifts hears too (18/11/2026).
      "email",
      "audit",
    ]);
    expect(emails[0].to).toBe("erin@example.co.za");
    expect(emails[0].text).toContain("tax law requires");
    expect(emails[0].text).not.toMatch(/[!—]/);
    expect(s).toMatchObject({ donors: 2, checkout_details: 2, monthly_stopped: 1, accountDeleted: true });
  });

  it("emails someone who signed in but never gave, once their account is deleted (the delete page promises it)", async () => {
    donorsByUser = [];
    donorsByEmail = [];
    const s = await eraseDonor({ userId: USER, actorUserId: "admin1" });
    expect(s.accountDeleted).toBe(true);
    expect(emails.map((e) => e.to)).toEqual(["erin@example.co.za"]);
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
    // The email tells the truth: the sign-in account (and its email address) stays (reading pass, 19/11/2026).
    expect(emails.at(-1)?.text).toMatch(/One exception: your sign-in account stays/);
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
    expect(calls).toContain('profiles:update:{"full_name":null,"giver_type":null}');
  });

  it("reports an account that could not be deleted, after the information was erased", async () => {
    deleteUserError = { message: "constraint" };
    const s = await eraseDonor({ userId: USER, actorUserId: "admin1" });
    expect(s.accountDeleted).toBe(false);
    expect(s.note).toMatch(/could not be deleted/);
    // Not kept on purpose: the email must not claim they run a charity or the platform (review of 19/11/2026).
    expect(emails.at(-1)?.text ?? "").not.toMatch(/One exception/);
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

describe("their address in the rate limiter (review 23/11/2026)", () => {
  it("is found by the limiter's keyed stand-in, never the address itself, alone or with an internet address", async () => {
    vi.stubEnv("ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    try {
      await eraseDonor({ email: "Guest@Example.co.za", actorUserId: "admin1" });
      const rows = calls.filter((c) => c.startsWith("rate_limit_events:"));
      expect(rows).toEqual(limitRows("guest@example.co.za"));
      expect(rows[0]).toMatch(/^rate_limit_events:deleted:key=email#/);
      expect(rows[1]).toMatch(/\|%$/);
      expect(rows.join()).not.toMatch(/guest|example/i);
      expect(calls.indexOf(rows[1])).toBeLessThan(calls.indexOf("rpc"));
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("covers every address linked to their account, once each, and skips ones already erased", async () => {
    donorEmails = { d1: "Erin.Work@Example.co.za" };
    await eraseDonor({ userId: USER, actorUserId: "admin1" });
    const rows = calls.filter((c) => c.startsWith("rate_limit_events:"));
    expect(rows.sort()).toEqual([...limitRows("erin@example.co.za"), ...limitRows("erin.work@example.co.za")].sort());
    calls.length = 0;
    donorEmails = { d1: "erased+d1@erased.invalid" };
    await eraseDonor({ userId: USER, actorUserId: "admin1" });
    expect(calls.filter((c) => c.startsWith("rate_limit_events:"))).toEqual(limitRows("erin@example.co.za"));
  });
});

describe("their \"Request a charity\" asks (review 23/11/2026)", () => {
  it("never deletes a request another signed-in donor made with their address: it clears only the address and its agreement", async () => {
    await eraseDonor({ email: "Guest@Example.co.za", actorUserId: "admin1" });
    const requests = calls.filter((c) => c.startsWith("charity_requests:"));
    expect(requests).toEqual(["charity_requests:deleted:notify_email=guest@example.co.za,requested_by=null", 'charity_requests:update:{"notify_email":null,"consent_version":null}']);
    // No delete by the email alone, which would take other people's requests with it.
    expect(calls).not.toContain("charity_requests:deleted:notify_email=guest@example.co.za");
    expect(updateFilters).toContain("charity_requests:notify_email=guest@example.co.za");
  });
});

describe("a charity's imported copy of them (20/11/2026)", () => {
  it("is deleted by the whole address, never a pattern: a _ or % in it matches only itself", async () => {
    await eraseDonor({ email: "A_B%c@Example.co.za", actorUserId: "admin1" });
    expect(calls).toContain("charity_contacts:deleted:email=a_b%c@example.co.za");
    expect(calls.filter((c) => c.startsWith("charity_contacts:"))).toHaveLength(1);
  });

  it("also goes by the address on any donor record linked to their account, once each, before the database erasure", async () => {
    donorEmails = { d1: "Erin.Work@Example.co.za" };
    await eraseDonor({ userId: USER, actorUserId: "admin1" });
    const contacts = calls.filter((c) => c.startsWith("charity_contacts:"));
    expect(contacts.sort()).toEqual(["charity_contacts:deleted:email=erin.work@example.co.za", "charity_contacts:deleted:email=erin@example.co.za"]);
    expect(calls.indexOf(contacts[0])).toBeLessThan(calls.indexOf("rpc"));
  });

  it("running it again skips addresses already erased", async () => {
    donorEmails = { d1: "erased+d1@erased.invalid" };
    await eraseDonor({ userId: USER, actorUserId: "admin1" });
    expect(calls.filter((c) => c.startsWith("charity_contacts:"))).toEqual(["charity_contacts:deleted:email=erin@example.co.za"]);
  });

  it("the email says so", async () => {
    await eraseDonor({ userId: USER, actorUserId: "admin1" });
    expect(emails[0].text).toMatch(/any copy of your details a charity imported into its own contact list/);
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
    // A guest has no sign-in account: no "your account stays" line.
    expect(emails[0].text).not.toMatch(/One exception|sign-in account/);
  });

  it("needs someone to erase", async () => {
    await expect(eraseDonor({ actorUserId: "admin1" })).rejects.toThrow(/whose information/);
  });

  it("ignores an id that is not a user id", async () => {
    await eraseDonor({ userId: "not-a-uuid", email: "guest@example.co.za", actorUserId: "admin1" });
    expect(calls).not.toContain("deleteUser");
  });
});

describe("what charities kept about them (review 23/11/2026)", () => {
  it("clears the private note on their receipt decisions and removes them from appeal send lists, before the database erasure", async () => {
    await eraseDonor({ userId: USER, actorUserId: "admin1" });
    // Charities' thank-yous shown in the app to them (24/11/2026).
    expect(deletedByDonor).toContain("donor_messages");
    expect(updateFilters).toContain('receipt_plan_decisions:donor_id=["d1","d2"]');
    expect(deletedByDonor).toContain("charity_appeal_recipients");
    expect(calls.indexOf('receipt_plan_decisions:update:{"note":null}')).toBeLessThan(calls.indexOf("rpc"));
  });

  it("removes their name from a receipt-check record by its certificate key, also when an earlier gift spelt the name differently", async () => {
    const { certificateKey } = await import("@/lib/receipts/review");
    const key = certificateKey("c1", 2026, "d1", "fp");
    // The gifts now say "Erin Smith"; the record was made when the name was "Erin Smyth".
    giftRows = [{ id: "g1", charity_id: "c1" }];
    decisionRows = [{ id: "x1", charity_id: "c1", tax_year: 2026, donor_id: "d1", donor_identity: "fp" }];
    certificateActionRows = [
      { id: "a1", details: { key, name: "Erin Smyth", total: "R100" } },
      { id: "a2", details: { key: "f".repeat(32), name: "Someone Else" } },
    ];
    await eraseDonor({ userId: USER, actorUserId: "admin1" });
    expect(updateFilters).toContain("charity_actions:id=a1");
    expect(updateFilters).not.toContain("charity_actions:id=a2");
    expect(calls.some((c) => c.startsWith("charity_actions:update:") && c.includes('"name":"a donor"') && c.includes('"total":"R100"'))).toBe(true);
  });
});

describe("deleting your own account in the app (25/11/2026)", () => {
  it("sends the app's own confirmation after the work (not before), records its own audit action, and sends one email only", async () => {
    await eraseDonor({
      userId: USER,
      actorUserId: USER,
      auditAction: "privacy.account_deleted_in_app",
      confirmationEmail: () => ({ subject: "Your Givezy account has been deleted", text: "Draft confirmation" }),
    });
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ to: "erin@example.co.za", text: "Draft confirmation" });
    // After the database erasure and the account deletion, before the audit entry.
    expect(calls.indexOf("email")).toBeGreaterThan(calls.indexOf("rpc"));
    expect(calls.indexOf("email")).toBeGreaterThan(calls.indexOf("deleteUser"));
    expect(audits[0]).toMatchObject({ action: "privacy.account_deleted_in_app", actorUserId: USER });
    expect(JSON.stringify(audits)).not.toMatch(/erin|example\.co\.za/i);
  });

  it("run again after the sign-in account is already gone: nothing left to erase, no second email, no failure", async () => {
    donorsByUser = [];
    donorsByEmail = [];
    profile = null;
    const s = await eraseDonor({ userId: USER, actorUserId: USER, auditAction: "privacy.account_deleted_in_app", confirmationEmail: () => ({ subject: "x", text: "y" }) });
    expect(s.donors).toBe(0);
    expect(emails).toHaveLength(0);
  });
});
