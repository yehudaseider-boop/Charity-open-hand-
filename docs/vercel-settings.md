# Vercel settings sheet (23/10/2026)

For session 1 (see `docs/launch-plan.md`). Vercel, project `charity-open-hand`, Settings, Environment Variables. Add each one for **Production** (and Preview if you want preview links to work). Never paste a secret into chat: paste it straight into Vercel's box.

Where a value is "generate", Claude gives you a one-line command or a way to make it that never leaves your screen. Where it is "copy from", you open that page and copy.

## The test site (test.givezy.co.za)

| Setting | Value | Where it comes from |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | the test project's address | Supabase, Project Settings, API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key | Supabase, Project Settings, API Keys |
| `SUPABASE_SECRET_KEY` | secret key (server only) | Supabase, Project Settings, API Keys. Never in the app or in chat |
| `ENCRYPTION_KEY` | 32 random bytes, base64 | Already set 16/10/2026. **Keep a backup copy**: losing it makes bank, ID and tax numbers unreadable |
| `SITE_URL` | `https://test.givezy.co.za` | After the domain works. No slash at the end |
| `CLIENT_IP_HEADER` | `x-real-ip` | Fixed value |
| `CRON_SECRET` | long random string | Generate. Vercel then sends it to the daily job by itself |
| `PAYMENT_GATEWAY` | `test` first, then `paystack` | Switch after the first checks |
| `PAYSTACK_SECRET_KEY` | `sk_test_...` | Paystack, test mode, Settings, API Keys & Webhooks |
| `PAYSTACK_SPLITS` | `yes` | Only on this test site |
| `TEST_GATEWAY_SECRET`, `ALLOW_TEST_GATEWAY` | only while `PAYMENT_GATEWAY=test` | Remove both once on `paystack` |
| `EMAIL_TRANSPORT` | `resend` | After the email service is set up |
| `RESEND_API_KEY` | key | Resend, API Keys |
| `EMAIL_FROM` | for example `Givezy <hello@givezy.co.za>` | Your choice, on the verified domain |
| `EMAIL_ALLOWLIST` | `givezy.co.za` and your own address, comma separated | **Must be set on the test site**, so a test never emails a real donor |
| `ADMIN_NOTIFY_EMAIL` | your address | Chargebacks, new applications and the daily "needs a person" email come here |
| `APP_GIVING` | leave empty | The app sends people to the website to give until the stores answer |
| `SAVED_CARDS` | leave empty | Off for launch |
| `RECEIPTS_ENABLED`, `RECEIPT_WORDING_CONFIRMED` | leave empty | Receipts stay drafts until Yosef approves the wording |

Leave empty on Vercel (they are for your own computer): `CHROME_PATH`, `CHROME_NO_SANDBOX`, `TEST_GATEWAY_SPLITS`, `TEST_GATEWAY_FEE_PPM`.

## The live site later (givezy.co.za)

Same list, with these differences:
- A separate Supabase project (the live one), so the three Supabase settings and `ENCRYPTION_KEY` are **new** (never reuse the test key).
- `SITE_URL=https://givezy.co.za`, `PAYSTACK_SECRET_KEY` is the **live** key (`sk_live_...`), `PAYMENT_GATEWAY=paystack`.
- Remove `TEST_GATEWAY_SECRET`, `ALLOW_TEST_GATEWAY` and `EMAIL_ALLOWLIST`.
- The code refuses the test payment gateway on the live site whatever the settings say.

## The phone app (EAS, later)

In the Expo project's environment (production): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_SITE_URL` (https), `EXPO_PUBLIC_SUPPORT_EMAIL`. Leave `EXPO_PUBLIC_IN_APP_GIVING`, `EXPO_PUBLIC_SAVED_CARDS` and `EXPO_PUBLIC_SOCIAL_SIGN_IN` empty for the first store build. Without the Supabase pair, a store build quietly shows sample data, so check them before every build.

## After saving

1. Redeploy (Deployments, the latest one, Redeploy).
2. Open `/api/health`. Expect `{"ok":true}`.
3. Settings, Cron Jobs: one job, `/api/jobs/daily`. (If Vercel refuses the schedule on the free plan, tell Claude what it says.)
