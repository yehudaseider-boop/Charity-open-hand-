/**
 * The payment settings, checked for the admin Settings check page. Dependency-free and inside the gateway
 * folder, because it is the one place that knows what each gateway's settings look like. Never returns a value.
 */
import type { SettingCheck } from "@/lib/ops/settings-check";

type Env = Record<string, string | undefined>;

export function gatewaySettings(env: Env, site: "live" | "test" | "unknown"): SettingCheck[] {
  const gateway = env.PAYMENT_GATEWAY ?? "test";
  const out: SettingCheck[] = [];
  if (gateway === "test") {
    out.push(
      site === "live"
        ? { name: "PAYMENT_GATEWAY", status: "fix", says: "Set to the test gateway on the live site. The site refuses to take payments until it is set to paystack." }
        : { name: "PAYMENT_GATEWAY", status: "later", says: "The test gateway: no real card, no money moves. Switch to paystack after the first checks." },
    );
    out.push(env.TEST_GATEWAY_SECRET ? { name: "TEST_GATEWAY_SECRET", status: "ok", says: "Set." } : { name: "TEST_GATEWAY_SECRET", status: "fix", says: "Missing. The test payment page can't work without it." });
    out.push(env.ALLOW_TEST_GATEWAY === "yes" ? { name: "ALLOW_TEST_GATEWAY", status: "ok", says: "Set to yes." } : { name: "ALLOW_TEST_GATEWAY", status: "fix", says: "Must be yes while the test gateway is in use, or every gift stops with an error." });
    return out;
  }
  if (gateway === "stitch") {
    out.push({ name: "PAYMENT_GATEWAY", status: "ok", says: "The payment provider (Stitch)." });
    for (const [name, what] of [["STITCH_CLIENT_ID", "Stitch's client id"], ["STITCH_CLIENT_SECRET", "Stitch's client secret"]] as const) {
      out.push(env[name] ? { name, status: "ok", says: "Set." } : { name, status: "fix", says: `Missing. No gift can start without ${what}.` });
    }
    const secret = env.STITCH_WEBHOOK_SECRET ?? "";
    if (!secret) out.push({ name: "STITCH_WEBHOOK_SECRET", status: "fix", says: "Missing. Payment messages from Stitch can't be checked, so no gift would ever be marked paid by them." });
    else if (!secret.startsWith("whsec_")) out.push({ name: "STITCH_WEBHOOK_SECRET", status: "fix", says: "Doesn't look like Stitch's signing secret. It starts with whsec_." });
    else out.push({ name: "STITCH_WEBHOOK_SECRET", status: "ok", says: "Set." });
    out.push({ name: "STITCH_SPLITS", status: env.STITCH_SPLITS === "yes" ? "ok" : "later", says: env.STITCH_SPLITS === "yes" ? "On: each gift is split to the charity's own Stitch account." : "Off: Stitch takes no gifts, because it only takes them as a split to a charity." });
    for (const name of ["TEST_GATEWAY_SECRET", "ALLOW_TEST_GATEWAY"]) {
      if (env[name]) out.push({ name, status: "fix", says: "Only for the test gateway. Remove it now that payments go to Stitch." });
    }
    // Paystack stays set as the fallback until Stitch has passed its checks (decisions.md, 18/11/2026).
    for (const name of ["PAYSTACK_SECRET_KEY", "PAYSTACK_SPLITS"]) {
      if (env[name]) out.push({ name, status: "later", says: "Paystack is still set, as the fallback until Stitch has passed its checks. Remove it once Paystack is switched off for good." });
    }
    return out;
  }
  if (gateway !== "paystack") return [{ name: "PAYMENT_GATEWAY", status: "fix", says: "Not a gateway we know. Use test, paystack or stitch." }];

  out.push({ name: "PAYMENT_GATEWAY", status: "ok", says: "The payment provider." });
  const key = env.PAYSTACK_SECRET_KEY ?? "";
  if (!key) out.push({ name: "PAYSTACK_SECRET_KEY", status: "fix", says: "Missing. No gift can start without it." });
  else if (key.startsWith("pk_")) out.push({ name: "PAYSTACK_SECRET_KEY", status: "fix", says: "This is the public key (pk_). Paste the secret key (sk_) instead." });
  else if (!/^sk_(test|live)_/.test(key)) out.push({ name: "PAYSTACK_SECRET_KEY", status: "fix", says: "Doesn't look like a secret key. It starts with sk_test_ or sk_live_." });
  else if (site === "test" && key.startsWith("sk_live_")) out.push({ name: "PAYSTACK_SECRET_KEY", status: "fix", says: "The live key on the test site: tests would charge real cards. Use the test key (sk_test_)." });
  else if (site === "live" && key.startsWith("sk_test_")) out.push({ name: "PAYSTACK_SECRET_KEY", status: "fix", says: "The test key on the live site: no real gift would be paid. Use the live key (sk_live_)." });
  else out.push({ name: "PAYSTACK_SECRET_KEY", status: "ok", says: key.startsWith("sk_live_") ? "The live key." : "The test key." });
  out.push({ name: "PAYSTACK_SPLITS", status: env.PAYSTACK_SPLITS === "yes" ? "ok" : "later", says: env.PAYSTACK_SPLITS === "yes" ? "On: each gift is split to the charity's own account." : "Off: gifts are not split to charities' accounts." });
  for (const name of ["TEST_GATEWAY_SECRET", "ALLOW_TEST_GATEWAY"]) {
    if (env[name]) out.push({ name, status: "fix", says: "Only for the test gateway. Remove it now that payments go to the provider." });
  }
  return out;
}
