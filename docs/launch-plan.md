# Givezy launch plan (written 22/10/2026)

Goal: live before January 2027. This is the plan from here to launch, with the step-by-step for the first session on the payment provider and the domain. The full list of every item is still `docs/go-live-checklist.md`; this page is the order to do them in.

Nothing here costs money until a step says **Approval needed**. Claude stops at every one of those.

## Where we are

- **Built and tested (908 automated tests):** website (charity pages, giving, monthly giving, account, tax pack), charity dashboard (donations, donors, CRM, campaigns, thank-yous, appeals, imports, deposit report, exports), Givezy admin (charity review, payments, s18A receipts, causes, cause of the week, privacy requests), phone app (Expo), s18A receipts with two approvals.
- **Checked today (22/10/2026):** three fresh reviews of the money path, security and launch operations. No blockers. Every confirmed finding is fixed except the decisions listed under "Decisions still needed".
- **Never run against the real payment provider yet.** The code for Paystack is written from its published instructions; the first test-mode session is how we prove it. That is the biggest unknown left.

## How s18A receipts work (start to finish)

1. **At the gift.** The donor ticks "I want an s18A receipt" and gives their ID number (or tax number) and address. The website and app ask for these only when the box is ticked. The ID number is kept encrypted; only the last 4 digits are ever shown.
2. **During the tax year** (1 March to end February). Nothing is issued. The donor sees each gift in their account and app; the charity sees the gift and that a receipt was asked for.
3. **After the tax year closes** (from 1 March). One receipt per donor, per charity, per tax year, adding up all that donor's s18A gifts to that charity (online gifts plus any EFT or cash gifts the charity recorded).
   - The **charity approves** its list on its dashboard (s18A receipts): donor, number of gifts, amount, total.
   - **Givezy signs it off** in Admin, s18A receipts.
   - The system then **issues** the receipts with numbers in order per charity, **makes the PDFs** and **emails** each donor theirs. The donor can also download it from their account and the app at any time.
   - If the list changes between the charity's approval and Givezy's sign-off (a refund, a late payment), nothing is issued and it goes back to the charity.
4. **Nobody uploads receipts anywhere.** They are made by the system from the gifts already recorded.
5. **SARS (the IT3(d) return).** The charity reports its receipts to SARS each year, as it does today. Givezy gives the charity its receipt list as a spreadsheet. A file in SARS's own IT3(d) layout is **not built on purpose**: we need the current layout from the charity's accountant (Martine's contact at Howard Joel, or Alza's SARS tool). Once we have it, it is a few days' work.
6. **Switched off until Yosef approves the wording.** Two settings (`RECEIPTS_ENABLED`, `RECEIPT_WORDING_CONFIRMED`) keep receipts as marked drafts until then. The first real receipt run is March 2027, after launch, so this does not hold up a January launch, but the wording must be approved before then.
7. **PDFs on the hosted site.** Fixed today: the website now carries its own copy of Chrome for making PDFs (free), so sign-off works on the hosted site, not only on a laptop.

## Session 1: payment provider and domain (with Yehuda)

Each step: Yehuda clicks, Claude checks. About 2 to 3 hours. Bring: GoDaddy login, Vercel login, Supabase login, an email address for Paystack.

### 1. Test database up to date (Supabase, 10 minutes)
1. Yehuda says yes to the four waiting changes. Claude runs them on the test project:
   `20261022000003_charity_impact_unit.sql`, `20261022000004_monthly_new_card.sql`, `20261022000005_recorded_gifts_need_approval.sql`, and the cause list (Admin, Causes, "Add the launch list" once the site is up).
2. Yehuda pastes three files into the Supabase SQL editor (the connector times out on them): `docs/test-site/2026-10-22-no-truncate.sql`, the erasure function from `20261020000001_review_fixes.sql` (section 7), and `20261016000016_remove_group_challenges.sql`. Claude gives the exact clicks on the day.

### 2. Test website on Vercel (20 minutes)
1. Vercel, project `charity-open-hand`, Settings, Git: production branch `milestone-1-foundation`.
2. Settings, Environment Variables: Claude reads the list out one by one (site address, database keys, `ENCRYPTION_KEY`, `CRON_SECRET`, `CLIENT_IP_HEADER=x-real-ip`, `EMAIL_ALLOWLIST`, `ADMIN_NOTIFY_EMAIL`, test gateway for now). Never pasted into chat.
3. Redeploy, then open `https://charity-open-hand.vercel.app/api/health`. Expect `{"ok":true}`.
   Then sign in as admin and open **Admin, Settings check** (`/admin/settings`): a tick or a plain-words fix for every setting and the newest database changes, never showing a value. Open it again after each step below.

### 3. test.givezy.co.za (20 minutes, plus waiting for DNS)
1. Vercel, Settings, Domains, add `test.givezy.co.za`. Vercel shows a record to add.
2. GoDaddy, givezy.co.za, DNS: add that record exactly as Vercel shows it (usually a CNAME named `test`).
3. Wait until Vercel shows the domain as valid (minutes to an hour).
4. Set `SITE_URL=https://test.givezy.co.za` in Vercel, redeploy.
5. Supabase, Authentication, URL configuration: Site URL `https://test.givezy.co.za`.
6. Check: sign in on test.givezy.co.za with an emailed code.

### 4. Paystack test mode (60 minutes)
1. Sign up at paystack.com for South Africa. Only test mode is needed today; check on the day that test mode needs no business documents.
2. Test mode, Settings, API Keys & Webhooks: copy the Test Secret Key into Vercel as `PAYSTACK_SECRET_KEY` (never into chat), set `PAYMENT_GATEWAY=paystack`, `PAYSTACK_SPLITS=yes`, redeploy.
3. Same page: Test Webhook URL `https://test.givezy.co.za/api/webhooks/paystack`.
4. Work through `docs/paystack-test-script.md` together: connect a charity, a once-off gift, a declined card, a monthly gift, "Update my card", a refund, the deposit report. Claude fixes anything that doesn't match, the same day.

### 5. Email sending: needed before anyone but you can sign in (30 minutes)

Checked against Supabase's own documentation on 23/10/2026: until a custom email service is connected, Supabase refuses to send sign-in codes to anyone who is not on your Supabase team ("Email address not authorized"), and its built-in sender is limited and "not meant for production". Sign-in codes are the only way to log in, so **no pilot charity, donor or app user can sign in until this is done.** It is the first thing that would otherwise look like "the site is broken" on the first demo.

1. **Approval needed first:** Resend has a free allowance; Claude checks the current free limit and price on the day and shows you in Rand before you sign up. Nothing paid without your yes.
2. Create the Resend account under Givezy, add `givezy.co.za` as a sending domain, and put the records it shows (SPF, DKIM) into GoDaddy DNS. Wait until Resend shows the domain as verified.
3. Resend, API Keys: create a key for the website. Vercel settings: `EMAIL_TRANSPORT=resend`, `RESEND_API_KEY`, `EMAIL_FROM` (for example `hello@givezy.co.za`), and on the **test** site `EMAIL_ALLOWLIST` so a test can never email a real donor. Redeploy.
4. Supabase, Authentication, Emails, SMTP Settings: switch on custom SMTP with Resend's SMTP host, port, user and password, and the same From address. (This is what sends the sign-in codes.)
5. Supabase, Authentication, Emails, the Magic Link template: include the code (`{{ .Token }}`) as the app needs (see `docs/decisions.md`, "To switch on").
6. Check: sign in to test.givezy.co.za with a non-team email address. A code arrives within a minute.

## From session 1 to launch

| When | What | Who |
| --- | --- | --- |
| Week of 26/10 | Session 1 above. Fix whatever Paystack test mode shows | Yehuda + Claude |
| Late October | Pilot charities on the test site (PSFA, Angel Network, Feed a Child): connect, try giving, try the dashboard | Yehuda invites, Claude supports |
| Early November | Legal: Yosef approves Privacy Policy, Terms, s18A wording, monthly authorisation, direct-marketing wording | Yosef |
| Early November | Apple and Google: ask in writing about donations inside the app. Until they answer, the app sends people to the website to give | Yehuda |
| Mid November | **Approval needed:** paid plans before real money: Vercel Pro (about USD 20 a month) and Supabase Pro (about USD 25 a month). Claude gives the Rand figure with the day's rate before you decide | Yehuda |
| Mid November | Paystack live: business verification (Givezy's company documents and bank account) | Yehuda |
| Late November | Live database set up, every change run in order, backups on, test gateway off, live keys in | Claude with Yehuda |
| Late November | Phone app: store builds and submission (in-app giving off until the stores answer) | Claude, Yehuda's approval to submit |
| Early December | First live day: one small real gift with Yehuda's card, refund it, check everything (go-live checklist section C) | Yehuda + Claude |
| December | Open to the pilot charities, then to donors | |

## Two things about the hosting I could not verify

I could not open Vercel's own pages from here, so these are from memory and need checking on the day (Vercel dashboard, Settings, or its Pricing page):
1. **A daily scheduled job on the free plan, and nothing more often.** The job is set to once a day on purpose. If Vercel refuses the schedule when the project is deployed, that is the first thing to look at.
2. **A 60-second limit per job run.** The daily job and the receipt pages ask for 60 seconds; that is within what I believe every plan allows. On Pro the limit and the schedule both loosen: then add an hourly monthly collection (`/api/jobs/monthly-giving`) to `vercel.json`, and raise the receipt pages to 300 seconds.

Because one run handles 50 monthly donations, the daily job now repeats the collection (up to 40 seconds' worth) until none are due. A charity with more than a few hundred monthly donors on one day (Heroes with Halos has about 130) still needs the hourly job on Pro to be sure everyone is charged the same day.

## Decisions still needed (none of these can be guessed)

1. **Support email address** for donors and charities (shown on every error screen and in the declined-card emails).
2. **Givezy's registered company name and number** for the Privacy Policy and Terms.
3. **Who gets the daily "needs a person" email** (`ADMIN_NOTIFY_EMAIL`). Without it, chargebacks and stuck payments alert nobody.
4. **Paystack's rates** (from the Paystack sign-up), so fees can be shown. Left empty until then.
5. **Partial refunds and s18A** (found today): a part-refunded gift keeps its full amount on the s18A receipt. Decide how a partial refund should count (only the amount kept, most likely). Needed before the first receipt run in March, not before launch.
6. **Refunds and chargebacks** (open since 16/10): what the donor is told when a receipt is withdrawn, and whether a chargeback the charity wins goes back to paid.
7. The rest of section A of `docs/go-live-checklist.md` (Yosef's items, sign-in lockout, look decisions).

## Built today for launch (22/10/2026)

- Next.js upgraded to 16.4.2: closes two critical remote-code-execution holes and a denial-of-service one in the version we had.
- s18A receipt PDFs work on the hosted site (its own Chrome, fonts and logo shipped with the receipt pages).
- One daily job (`/api/jobs/daily`, scheduled in `vercel.json` for 08:15 Johannesburg time): collects monthly donations, reads the deposit report, rechecks payments stuck on pending, resends failed confirmation emails, and emails Givezy only when something needs a person. Works on Vercel's free plan (once a day); retries of declined cards line up with it.
- Chargebacks email Givezy straight away (they have a deadline).
- Admin, Causes: add, rename, order and remove the cause list, with the agreed launch list in one click.
- `/api/health` for a free uptime monitor.
- Upload limit 4 MB (the host refuses anything over 4.5 MB).
- Security: only an approved charity can record gifts (a draft one could have put fake gifts into anyone's history); thank-you emails only go to people who gave on Givezy.
- "Update my card": no second payment page within half an hour of the first; a month paid twice goes to Admin, Payments with an email; a new card that can't be charged again stops the monthly donation instead of retrying the declined one.
