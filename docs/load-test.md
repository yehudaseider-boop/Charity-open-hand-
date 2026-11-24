# Load test for the busy times

Built 24/11/2026. **Not yet run.** It needs Yehuda's go (the cost and a target). The script is `scripts/loadtest/run.mjs`. It uses plain Node and no packages (k6 is not on npm and could not be downloaded here, so the script does the same job with Node 22).

It sends many pretend donors at a **test** site and reports how many requests failed and how slow they were. It never makes a real payment and refuses to run against givezy.co.za.

## What each scenario tests

| Scenario | What it does | What it shows |
|---|---|---|
| `checkout` | Starts a gift through `/api/app/checkout` (a new pretend donor each time), then stops. It never opens the payment page. | Whether many donors can start a gift at once: the website, the database and the "too many attempts" limits. |
| `webhook` | Sends signed "payment succeeded" receipts to `/api/webhooks/test`, the way the stand-in gateway does, for gifts the run just started (a made-up reference if none is waiting). | Whether a burst of payment confirmations is stored once and marks gifts paid without errors. |
| `dashboard` | Signed-in charity user opens the dashboard, donations, donors, receipts, monthly and report pages. | The speed of the charity pages with many gifts in the database. |
| `receipts` | Opens the charity and Givezy admin s18A receipts pages. | The speed of the lists used on the receipt run. |
| `busy` | A mix: 30% checkout, 20% webhook, 50% dashboard. | Everything together, like a campaign day. |

**What this cannot test.** The s18A receipt run itself (approve, sign off, make the PDFs, email) is not a web address the script can call. It is a person's sign-off in Admin and `npm run receipts -- <year> --finish`. Time that by hand on the test site once the test database holds a realistic number of receipts, and write the time here. The `receipts` scenario only covers the pages around it.

## Before a run: what the test site needs

- The **test site** only: a copy with a **test** database holding no real donors, `PAYMENT_GATEWAY=test`, `APP_GIVING=yes` and `TEST_GATEWAY_SECRET` set. The script stops at once if checkout hands back anything other than the stand-in test payment page.
- The run **records real rows** (pending gifts, gateway events) in that test database. Clean it afterwards.
- A signed-in charity user on the test site and its session cookie, plus the charity's slug and id. Use the load-test charity seed (`npm run db:seed` on the test database) so the pages have many gifts.
- **The site's own limits will bite.** One email may start 5 gifts in 10 minutes and one address 30 in 10 minutes (`src/lib/donations/checkout.ts`). The script uses a new email each time, but one machine is one address. Expect `rate_limited` in the checkout results. Either run from several machines, or raise the address limit **on the test site only** for the run. Do not change the live limits.
- Secrets are read from the environment, never from a file: `TEST_GATEWAY_SECRET` and `LOADTEST_COOKIE`.
- `--base-url` must be exactly the test site's own `SITE_URL` (the stand-in payment page is built from it; any other address and every checkout stops the run, safely).
- `EMAIL_ALLOWLIST` set on the test site, so the pretend donors' thank-you and receipt emails are skipped rather than bounced.
- **Never** the live site's own Vercel addresses (`*.vercel.app` of the live project) either: they reach the live database just as givezy.co.za does. Only givezy.co.za is refused by the script itself; the rest rests on the allow list and the approval below.
- The receipts scenario reads the charity's own receipt page only (a charity user's cookie cannot open Givezy's admin pages).

## How to run

```
export TEST_GATEWAY_SECRET=...   # the test site's value
export LOADTEST_COOKIE='...'     # a signed-in test charity user's cookie
node scripts/loadtest/run.mjs --base-url https://<test-site> --allow-host <test-site-host> \
  --approved-by "Yehuda, dd/mm/yyyy" --scenario busy --rate 10 --duration 10m --ramp 2m \
  --charity-slug <slug> --charity-id <uuid> \
  --max-error-pct <n> --max-p95-ms <n> --json result.json
```

Add `--dry-run` first: it checks everything and sends nothing. The script refuses without `--base-url`, refuses any host not given with `--allow-host`, refuses givezy.co.za, and refuses a rate above `--max-rate` (50 unless raised on purpose). It ramps up over `--ramp`, holds the target, then prints the numbers.

## Numbers to watch

1. **Error rate** (failed requests as a percent, by scenario). The script prints it.
2. **p95 time** (95 of 100 requests were at least this fast, in milliseconds). The script prints it, with p50, p99 and the slowest.
3. **Database connections.** The script cannot see them. Watch the test project's database connections and CPU in the Supabase dashboard (Reports, Database) during the run, and write down the highest number against the plan's limit. A connection count near the limit is a fail even if every request succeeded.
4. **The hosting dashboard** for the same window: function errors, timeouts (the daily job is allowed 60 seconds), and usage.
5. The script also says if it had to **drop requests** because over 1000 were waiting (the site is not keeping up).

## Pass and fail (placeholders: Yehuda to confirm)

These are starting points to talk about, **not decisions and not facts about what Givezy can handle**. Nothing passes or fails until Yehuda sets them: the script says "not set" for any limit not given. The verdict (on screen and in the saved file) is "pass" only when both the error-rate and the p95 limits were given and met; with one missing it is "partial", with none "not judged" (exit code 2 for both), and a stopped or failed run is "fail".

| Measure | Proposed placeholder | Status |
|---|---|---|
| Error rate, checkout and webhook | no more than 1% (excluding `rate_limited` while the test limits are raised) | Yehuda to confirm |
| Error rate, dashboard pages | no more than 1% | Yehuda to confirm |
| p95 checkout start | under 1 500 ms | Yehuda to confirm |
| p95 webhook receipt | under 1 000 ms | Yehuda to confirm |
| p95 dashboard page | under 2 000 ms | Yehuda to confirm |
| Database connections | under 70% of the plan's limit at the peak | Yehuda to confirm |
| Target rate | not set. Needs Yehuda's number for the busiest hour (for example a campaign day) | Yehuda to confirm |

## What it could cost

**Checked 24/11/2026. Only part of this could be verified.**

- **Supabase** (page: Manage Egress usage, https://supabase.com/docs/guides/platform/manage-your-usage/egress, read 24/11/2026 through Supabase's docs search): Pro plan USD 25 a month; 250 GB of uncached egress included, then USD 0.09 per GB. Compute is billed by the hour for the size chosen (the same docs show Small at USD 15 for 730 hours as an example, not a current price list), so a test project already running costs nothing extra for a short run unless it is made bigger for the test. A 10-minute run at 10 requests a second is about 6 000 requests. Assuming (not measured) about 0.2 MB per page, that is roughly 1 GB of egress, far under the 250 GB included, so likely **USD 0 extra** if the test project is on Pro and is not resized. On the free plan the quota is 5 GB, and going over it brings a notice and a grace period (same page).
- **Vercel: not verified.** The pricing page (https://vercel.com/docs/pricing) could not be read from the build environment and the documentation search returned no rates, so **no Vercel figure is given here**. The run uses function time, requests and data transfer on whichever plan the test site is on. Before approving, Yehuda should open the Vercel project's Usage page and the pricing page, and check the included amounts against a run of this size (6 000 to 60 000 requests).
- **Rand.** Rand amounts are not shown because the exchange rate could not be fetched here (no approved rate source reachable). Convert at the day's rate from the South African Reserve Bank (resbank.co.za) or the bank Givezy pays with, and write the rate and date next to the figure.

## Steps for Yehuda to approve a run

1. Decide the **target**: the busiest hour to prove (requests a second, or gifts an hour), and the **pass and fail limits** in the table above.
2. Confirm the **test site and test database** to use (never givezy.co.za, never a database with real donors) and that its database size is the one you want measured.
3. Check the **cost**: the Vercel Usage and pricing pages and the Supabase organisation usage page, against the numbers above. Decide the most you are happy to spend.
4. Say **go** in writing, with the date, the target, the site and the limit. That sentence goes into `--approved-by`.
5. Someone with the test site's access sets the two secrets in their own terminal, runs `--dry-run`, then the real run, and watches Supabase connections during it.
6. Save `result.json`, the highest database connection count and any hosting errors here, with the date. Then clean the test rows and update `docs/go-live-checklist.md`.

## Trying the script without any site

`scripts/loadtest/standin-server.mjs` is a tiny pretend site for checking the script itself. It is not the app. Run it, then point the script at `http://127.0.0.1:4010` with `--allow-host 127.0.0.1`. `tests/loadtest.test.ts` pins the safety checks and that the signed receipt is accepted by the real test-gateway code.
