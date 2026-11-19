# When something goes wrong (DRAFT for Yehuda, 19/11/2026)

One page for a bad day: the site is down, payments fail, money looks wrong, or data may have leaked. Blanks marked ____ are for Yehuda to fill in. Nothing here is switched on by this page; it says what to do and where.

## Who is told, and how

| Who | Their job on a bad day | How to reach them |
|---|---|---|
| Yehuda | Decides, tells charities and donors | ____ |
| Back-up when Yehuda is away | Same | ____ |
| Yosef (legal) | Data leaks, fake charities, anything a regulator may need to hear | ____ |
| Claude Code | Finds the cause, fixes, checks | A session on the Givezy repository |

**What tells us today:**
- The daily check emails `ADMIN_NOTIFY_EMAIL` every morning (08:15 Johannesburg time) with anything that needs a person: payments stuck, chargebacks, failed monthly collections.
- The end-to-end robot fails on GitHub (Actions, End-to-end checks) when the site or sign-in breaks after an update.
- **Gap:** nothing tells you within minutes that the site is down. An uptime check on `/api/health` with a phone alert is on the go-live list and needs your choice of service.

## 1. The site is down or showing errors

1. Open `/api/health` on the site. `{"ok":true}` means the site and database are up; anything else means they're not.
2. If it broke after an update: Vercel, the project, **Deployments**, the last one that worked, **Instant Rollback**. The site is back on the old version in about a minute. Then tell Claude Code what broke.
3. If Vercel or Supabase itself is down, check their status pages (vercel-status.com, status.supabase.com). There is nothing to fix on our side; wait, and post the notice below.

## 2. Payments are failing

1. Is it every gift, or one charity? Look at Admin, **Payments**.
2. **One charity:** Admin, the charity, **Suspend** (give a reason). It disappears from the site and can't receive gifts. Reinstate it when it's sorted.
3. **Every gift:** check the payment provider's status page and dashboard. Donors are already told "nothing was charged" and can try again, so the site stays up. If gifts are going wrong rather than just failing, use the pause switch (section 5) so nobody is charged while you look.
4. **Gifts started in the app only:** Vercel, Settings, Environment Variables, remove `APP_GIVING`, redeploy. The app then sends donors to give on the website.
5. Gifts that were paid but whose confirmation never arrived are found by the daily check, which asks the provider and marks them paid. Don't mark anything paid by hand.

## 3. Money looks wrong (wrong amount, charged twice, wrong charity)

1. Don't change anything in the database. Note the gift's reference (GZ-...) and the time.
2. Admin, Payments: the gift shows what the provider confirmed. A gift whose amount didn't match is already held for a person.
3. Refunds are made in the payment provider's dashboard, then recorded in Admin, Payments (**Mark refunded**).
4. **Monthly collections:** if a collection is charging wrongly, stop the daily job: Vercel, Settings, **Cron Jobs**, disable `/api/jobs/daily`. This also stops the morning check and its email, so turn it back on as soon as the cause is fixed.

## 4. Data may have leaked, or a charity isn't real

1. Tell Yosef the same day. The law on personal information (POPIA) requires telling the Information Regulator and the people affected as soon as reasonably possible: Yosef confirms what, how and when.
2. Fake or suspected charity: follow `docs/charity-approval-checklist.md`, "If a charity turns out not to be real".
3. A key may have leaked (Supabase, payment provider, email service): change it in that service, then put the new one in Vercel and redeploy. Claude Code can walk through each one.

## 5. Taking everything offline (last resort)

Vercel, Settings, Environment Variables, set `COMING_SOON_HOSTS` to the site's address, redeploy: every page shows the holding page. **Careful:** this also stops the payment provider reaching us, so payments already made wait until it is switched back (the provider tries again for a while, and the daily check catches the rest).

**The pause switch (built 19/11/2026, off; tried on the test site the same day: the give pages showed the paused message with no Give button and the app's server answered paused, then giving opened again):** a softer stop that keeps the site up. Vercel, Settings, **Environment Variables**, add `GIVING_PAUSED` with the value `yes` (all environments), then **Redeploy**. Every Give button on the website and in the app then says "Giving is paused for a short while. Nothing has been charged. Please try again later." Payment confirmations still arrive, charities and donors still sign in, and monthly collections wait (they are taken on the first day after it is off, and no donation is counted as failed). To open giving again: delete `GIVING_PAUSED` (or set it to `no`, as on the test site) and redeploy. Admin, Settings check shows it in red while it is on, so it can't be forgotten. **Use this one first** and keep the holding page above for when nothing else will do.

## Keys: what each one is, and what happens if it leaks or must be replaced

A key lives in Vercel (Settings, Environment Variables) and in the service that made it. To replace one: make a new key in the service, put it in Vercel, redeploy, then delete the old key in the service. Never paste a key in a chat or an email.

| Key (Vercel name) | Whose it is | If it leaks | If it is lost or replaced |
|---|---|---|---|
| `SUPABASE_SECRET_KEY` | Supabase | Full access to the database. Replace at once. | Replace in Supabase, then Vercel and GitHub (`E2E_SUPABASE_SECRET_KEY` for the robot). |
| `ENCRYPTION_KEY` | Ours (no service holds a copy) | Saved bank, ID and tax numbers could be read with a copy of the database. | **Never replace casually: nothing encrypted with the old one can be read again.** Needs a planned re-encryption (Claude Code writes it) and a safe backup copy of the old key first. **Keep a backup copy somewhere safe (not in the repository).** |
| Payment provider keys (`PAYSTACK_*` today, `STITCH_*` next) | The provider | Someone could start or refund payments. Replace in the provider's dashboard at once, then Vercel. | Replace in the provider's dashboard, then Vercel. |
| `RESEND_API_KEY` | Resend | Someone could send email as Givezy. Replace at once. | Replace in Resend, then Vercel. |
| `CRON_SECRET` | Ours (Vercel's scheduler uses it) | Someone could run the daily job on demand. Replace. | Change it in Vercel and redeploy; the scheduler picks the new one up. |
| `HEARTBEAT_DAILY_URL` | The monitoring service | Someone could fake a "the daily job ran" check-in. Make a new address in the service. | Same. |
| `E2E_SUPABASE_SECRET_KEY` (GitHub) | The test database | Test project only. Replace in Supabase, then GitHub. | Same. |

## What we say

In plain words, short, no blame, no exclamation marks. The site has no notice banner yet: Claude Code can add one to the home page in minutes, or post it wherever donors follow Givezy. Draft wording, for Yehuda to adjust:

- **Site down:** "Givezy is down for a short while. No gifts are being taken, and nothing has been charged. We'll be back as soon as we can. Questions: hello@givezy.co.za."
- **Payments failing:** "Gifts aren't going through right now. If you tried, nothing was charged. Please try again later. Questions: hello@givezy.co.za."
- **To a charity (payments or its page affected):** "Hi ____, a quick note: gifts to [charity] weren't going through between [time] and [time]. Nothing was charged to donors, and nothing is lost: [what happens next]. We're sorry for the trouble. Yehuda"

## Quiet things that can take everything down (check now and then)

- **The domain.** If `givezy.co.za` lapses at GoDaddy, the site and every email stop at once. Check that it is on auto-renew with a card that won't expire, and that the renewal reminders go to an address you read. *Yehuda: 2 minutes in GoDaddy.*
- **The email domain's records** (SPF, DKIM, DMARC at GoDaddy for Resend): if they are changed or deleted, emails start landing in spam. Don't touch them without checking with Claude Code.
- **Package security alerts.** GitHub can tell us when a package we use has a known security hole: GitHub, the repository, Settings, Code security, turn on **Dependabot alerts** (free). *Yehuda: 3 taps.*
- **The daily job's check-in.** If `HEARTBEAT_DAILY_URL` is set and the monitoring service says the daily job didn't check in, nothing was collected or checked that day: open Vercel, Settings, Cron Jobs, run `/api/jobs/daily` by hand, and tell Claude Code.
- **Backups.** Supabase's Pro plan keeps a daily backup of the database for 7 days; we still owe one practice restore on the live project before launch (restoring overwrites the database, so never on a project in use).

## Afterwards (within a week)

1. What happened, when, who was affected, what fixed it: a few lines in `docs/decisions.md`.
2. Was anyone charged wrongly, or did anyone miss a receipt? Fix each one and tell them.
3. One change so it can't happen the same way again, and a robot check for it if it can be checked.
