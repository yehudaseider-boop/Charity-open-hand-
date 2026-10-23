/** The admin Settings check: plain words for each host setting, and never a value. */
import { describe, expect, it } from "vitest";
import { settingsCheck, siteKind } from "@/lib/ops/settings-check";

const KEY = Buffer.alloc(32, 7).toString("base64");
const testSite = {
  VERCEL: "1",
  NEXT_PUBLIC_SUPABASE_URL: "https://bodfyjskiwrwxhagtkxt.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc",
  SUPABASE_SECRET_KEY: "sb_secret_SUPERSECRETVALUE",
  ENCRYPTION_KEY: KEY,
  SITE_URL: "https://test.givezy.co.za",
  CLIENT_IP_HEADER: "x-real-ip",
  CRON_SECRET: "c".repeat(40),
  PAYMENT_GATEWAY: "paystack",
  PAYSTACK_SECRET_KEY: "sk_test_TOPSECRETKEY",
  PAYSTACK_SPLITS: "yes",
  EMAIL_TRANSPORT: "resend",
  RESEND_API_KEY: "re_SECRETRESEND",
  EMAIL_FROM: "Givezy <hello@givezy.co.za>",
  EMAIL_ALLOWLIST: "givezy.co.za",
  ADMIN_NOTIFY_EMAIL: "yehuda@example.com",
};
const status = (env: Record<string, string | undefined>, name: string) => settingsCheck(env).find((c) => c.name === name);
const fixes = (env: Record<string, string | undefined>) => settingsCheck(env).filter((c) => c.status === "fix").map((c) => c.name);

describe("the settings check", () => {
  it("passes a test site set up as the settings sheet says", () => {
    expect(fixes(testSite)).toEqual([]);
  });

  it("never shows a value", () => {
    const text = JSON.stringify(settingsCheck({ ...testSite, PAYSTACK_SECRET_KEY: "sk_live_TOPSECRETKEY", EMAIL_FROM: "nonsense" }));
    for (const secret of ["SUPERSECRETVALUE", "TOPSECRETKEY", "SECRETRESEND", KEY, "c".repeat(40), "sb_publishable_abc", "nonsense"]) expect(text).not.toContain(secret);
  });

  it("tells the test site from the live site", () => {
    expect(siteKind({ SITE_URL: "https://test.givezy.co.za" })).toBe("test");
    expect(siteKind({ SITE_URL: "https://givezy.co.za" })).toBe("live");
    expect(siteKind({})).toBe("unknown");
    expect(siteKind({ SITE_URL: "https://charity-open-hand.vercel.app" })).toBe("test");
  });

  it("catches the payment key mix-ups that cost money or block gifts", () => {
    expect(status({ ...testSite, PAYSTACK_SECRET_KEY: "sk_live_x" }, "PAYSTACK_SECRET_KEY")?.says).toMatch(/real cards/);
    expect(status({ ...testSite, SITE_URL: "https://givezy.co.za", EMAIL_ALLOWLIST: "" }, "PAYSTACK_SECRET_KEY")?.says).toMatch(/no real gift/);
    expect(status({ ...testSite, PAYSTACK_SECRET_KEY: "pk_test_x" }, "PAYSTACK_SECRET_KEY")?.says).toMatch(/public key/);
    expect(status({ ...testSite, PAYSTACK_SECRET_KEY: "" }, "PAYSTACK_SECRET_KEY")?.status).toBe("fix");
    expect(fixes({ ...testSite, ALLOW_TEST_GATEWAY: "yes" })).toEqual(["ALLOW_TEST_GATEWAY"]);
  });

  it("the test gateway: fine on the test site with its two settings, refused on the live site", () => {
    const t = { ...testSite, PAYMENT_GATEWAY: "test", TEST_GATEWAY_SECRET: "s", ALLOW_TEST_GATEWAY: "yes" };
    expect(fixes(t)).toEqual([]);
    expect(fixes({ ...t, ALLOW_TEST_GATEWAY: "" })).toEqual(["ALLOW_TEST_GATEWAY"]);
    // Empty is not "test": the site refuses an empty gateway name, so the check must too.
    expect(fixes({ ...testSite, PAYMENT_GATEWAY: "" })).toEqual(["PAYMENT_GATEWAY"]);
    expect(fixes({ ...t, SITE_URL: "https://givezy.co.za", EMAIL_ALLOWLIST: "" })).toEqual(["PAYMENT_GATEWAY"]);
  });

  it("catches the common pasting mistakes", () => {
    expect(fixes({ ...testSite, SUPABASE_SECRET_KEY: testSite.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY })).toEqual(["SUPABASE_SECRET_KEY"]);
    expect(fixes({ ...testSite, ENCRYPTION_KEY: "short" })).toEqual(["ENCRYPTION_KEY"]);
    expect(fixes({ ...testSite, SITE_URL: "https://test.givezy.co.za/" })).toEqual(["SITE_URL"]);
    expect(fixes({ ...testSite, CRON_SECRET: "abc" })).toEqual(["CRON_SECRET"]);
    expect(fixes({ ...testSite, CLIENT_IP_HEADER: "" })).toEqual(["CLIENT_IP_HEADER"]);
    expect(fixes({ ...testSite, CHROME_PATH: "/usr/bin/chromium" })).toEqual(["CHROME_PATH"]);
  });

  it("email: the test site must keep the allow list, the live site must not have one", () => {
    expect(fixes({ ...testSite, EMAIL_ALLOWLIST: "" })).toEqual(["EMAIL_ALLOWLIST"]);
    expect(fixes({ ...testSite, SITE_URL: "https://givezy.co.za", PAYSTACK_SECRET_KEY: "sk_live_x" })).toEqual(["EMAIL_ALLOWLIST"]);
    expect(status({ ...testSite, EMAIL_TRANSPORT: "" }, "EMAIL_TRANSPORT")?.status).toBe("later");
    expect(fixes({ ...testSite, RESEND_API_KEY: "" })).toEqual(["RESEND_API_KEY"]);
  });

  it("switches that stay off for launch are not problems", () => {
    expect(status(testSite, "APP_GIVING")?.status).toBe("ok");
    expect(status({ ...testSite, APP_GIVING: "yes" }, "APP_GIVING")?.status).toBe("later");
    expect(status(testSite, "RECEIPTS_ENABLED")?.status).toBe("later");
  });
});
