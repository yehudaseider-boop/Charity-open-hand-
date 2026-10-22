# The Givezy demo site

Started 22/10/2026 on branch `demo-site`. A copy of Givezy that anyone can play with: charities (the Angel
Network, Feed a Child), investors, friends. Every charity, donor and rand in it is made up. It runs on its own
database, so it can never touch the real test site or the live site.

## What it does

- **"Try the demo" page** (`/demo`): one button per made-up person, straight in, no email and no phone:
  - Thandi Mokoena, **charity owner** of Northcliff Meals Fund
  - Sipho Ndlovu, **charity admin** at Northcliff Meals Fund (not the owner)
  - Lerato Dube, **Givezy admin**
  - David Levin, **donor** (gives once-off and monthly, has s18A receipts and a tax pack)
- **A banner on every page:** this is a demo, everything is made up, nothing is charged, no real emails are sent,
  it resets every night.
- **Made-up data that shows every feature:** 4 charities (3 approved, 1 application waiting for Givezy's check),
  106 donors (100 people, 5 companies and trusts, and David), about 730 gifts over two tax years, 23 monthly donors
  (plus paused, cancelled and failing cards), 4 campaigns with progress, recorded EFT and cash gifts and a
  spreadsheet import, donor notes, tags, follow-ups (one overdue), 3 saved lists, lapsed donors, 2 emails to donors,
  a monthly thank-you, last tax year's s18A receipts (45, shown as pages marked DRAFT), a receipt list waiting for
  Givezy's sign-off, deposits, updates and four weeks of cause of the week.
- **Nightly reset at 03:00 Johannesburg time** (01:00 UTC): everything goes back as new.

## What is made up, and how

- Names come from two lists of common South African first names and surnames, mixed by a fixed random seed. Any
  match with a real person is chance. Every email address ends in `.test`, which can never receive email.
- ID numbers: every made-up donor carries the well-known sample ID `8001015009087` (stored encrypted, as on the real
  site), so no real person's number is ever stored.
- No fee or rate is invented: card processing fees and deposit fees are zero (the gateway's rates are not set yet).
  Some gifts carry a donor's optional contribution to Givezy (R20, R30 or R50), which is a donor's choice, not a rate.
- Dates count back from today, so "new this month" donors are always new and "lapsed" donors always lapsed.

## Safety: how it is kept away from real people and money

The one-click sign-in is the dangerous part: on the real site it would let anyone in as anyone. It is locked down
four ways, and tests prove each one (`tests/demo-mode.test.ts`):

1. **Not even built** unless `DEMO_MODE=yes` when the site is built. The demo's pages are `page.demo.tsx` and
   `route.demo.ts`; `next.config.ts` only treats those as pages in a demo build. A normal build has no `/demo`.
2. **Off at run time** unless `DEMO_MODE=yes` *and* the setup is safe: the test payment gateway, no real gateway
   key, no real email transport or key (`src/lib/demo/mode.ts`). The live site has a real gateway, so switching the
   demo on there by mistake turns nothing on. The proxy answers "not found" for every demo address when it is off.
3. **Only demo accounts.** Even when on, it signs in only the four fixed `.test` addresses, and only if this
   database marks that account as a demo account (`app_metadata.demo`, set only by the reset). The real databases
   have no such accounts.
4. **Real sign-in steps, done on the server.** It makes a one-time sign-in token on the server (never emailed) and,
   for admins, a real authenticator code from a secret kept encrypted. The site's own checks (second step,
   row-level security) are not loosened anywhere.

Plus: with `DEMO_MODE` set, email always goes to the "log only" transport, the real gateway is refused, the emailed
sign-in code is switched off (the sign-in page sends you to `/demo`), and the reset refuses unless the database is
the demo's own (marked, or empty) and in the same Supabase project as the site.

### What could still go wrong (plainly)

- **Visitors share the same people.** Anyone can change things for the next visitor until the nightly reset: remove
  Sipho from the team, suspend the charity, reset Thandi's authenticator (her button then says "being reset, try in
  a minute" until 03:00), post a rude update. Worst case: a broken or messy demo for up to a day. Fix: I can add a
  "Reset now" button for you, or a more frequent reset (the free Vercel plan allows only daily jobs).
- **Visitors can type real details into forms** (a real email when giving, a real name in a team invite). Nothing is
  emailed or charged, and it is wiped at 03:00, but it sits in the demo database until then. The demo's privacy
  position: say "don't type real details" on the guide (done).
- **The phone app**, if pointed at the demo, signs in with Supabase's own email code. Supabase's built-in email only
  sends to members of your Supabase organisation, and with "Allow new users to sign up" off (step 2 below) nobody new
  can get a code. Leave the app on the test site unless you want it on the demo.
- **The test gateway runs on a live (production) deployment** of the demo project. That is the point of the demo
  (you choose "paid" or "declined" on a pretend page). The rule allowing it needs three settings together
  (`DEMO_MODE=yes`, test gateway, `ALLOW_TEST_GATEWAY=yes`), so the live site cannot fall into it by one mistake.
- **An empty database counts as the demo's.** If someone points the demo's settings at a brand-new, empty real
  database, the first reset would fill it with demo data. That needs the demo switch and the test gateway as well,
  so it is unlikely; never copy the demo project's settings to another project.
- **If `DEMO_MODE=yes` were copied to the real test site** (which also runs the test gateway), the banner would show
  and the sign-in page would send people to `/demo`, where every button says "being reset" (no demo accounts there).
  Annoying, not dangerous: nobody is signed in, emailed or charged. Remove the setting to fix it.

## Hosting plan (needs your yes before anything is created)

Two new things, both separate from the real test site:

| What | Where | Cost |
|---|---|---|
| A second Vercel project, `givezy-demo`, in the `givezy` team, built from branch `demo-site` | Vercel, Frankfurt | R0 if the `givezy` team is already on Pro (see below) |
| A second Supabase project, `givezy-demo`, region eu-central-1 (Frankfurt) | Supabase, organisation `givezy` (free plan, 1 project today) | R0 (the free plan allows 2 active projects) |

**Prices (checked 22/10/2026, not from the official pricing pages, which this session couldn't open: please glance
at vercel.com/pricing and supabase.com/pricing):**
- Vercel Hobby is free but **for non-commercial use only**. Showing Givezy to charities and investors is commercial.
  Vercel Pro is US$20 per member per month ≈ **R327 a month** (US$20 × R16.36). It covers all projects in the team,
  so a second project adds nothing unless usage goes past the included amount (a demo won't come close).
  I couldn't see whether the `givezy` team is already on Pro: Vercel needs your approval for me to see the team.
- Supabase Free: 2 active projects per organisation; a free project **pauses after 7 days without activity**. The
  nightly reset uses the database every day, which should keep it awake. If it ever pauses: Supabase dashboard,
  the project, "Restore" (free). Supabase Pro is US$25 a month ≈ R409 and never pauses; not needed now.
- Exchange rate: R16.36 to the US dollar (XE mid-market rate, 21/10/2026 16:35 UTC). Your card will be charged in
  dollars, so your bank's rate and foreign transaction fee apply on top.

### Steps, once you say yes

What I can do for you (with your yes): create the Supabase project, load the database tables into it, create the
Vercel project and fill in the settings I can make myself (random secrets go straight into Vercel; you never see
them and they are never in chat). What only you can do is marked **(you)**.

1. **Supabase project** (me, or you: supabase.com → your `givezy` organisation → New project → name `givezy-demo`,
   region Central EU (Frankfurt), a strong database password saved in your password manager → Create).
2. **(you) Supabase settings** for `givezy-demo`:
   - Authentication → Sign In / Providers → turn **off** "Allow new users to sign up". Save.
   - Authentication → URL Configuration → Site URL: `https://givezy-demo.vercel.app` (or the address from step 4).
   - Authentication → Multi-Factor → check "TOTP (App Authenticator)" is enabled (it is by default).
3. **Database tables:** every file in `supabase/migrations`, in order (me, through the Supabase connection).
4. **Vercel project** (me, or you: vercel.com → team `givezy` → Add New → Project → import
   `yehudaseider-boop/charity-open-hand-` → Project name `givezy-demo` → Deploy can wait).
   - Settings → Git → **Production Branch: `demo-site`**.
   - Settings → Git → **Ignored Build Step**: "Only build production" (or the command
     `[ "$VERCEL_GIT_COMMIT_REF" != "demo-site" ]`), so other branches never build with demo settings.
   - Settings → Functions → region Frankfurt (fra1) (already set by `vercel.json`).
5. **Vercel settings** (Settings → Environment Variables, **Production** only):

   | Name | Value |
   |---|---|
   | `DEMO_MODE` | `yes` |
   | `PAYMENT_GATEWAY` | `test` |
   | `ALLOW_TEST_GATEWAY` | `yes` |
   | `TEST_GATEWAY_SECRET` | a new long random string (me) |
   | `ENCRYPTION_KEY` | a **new** key, never the real site's (me) |
   | `CRON_SECRET` | a new long random string (me) |
   | `SITE_URL` | `https://givezy-demo.vercel.app` |
   | `NEXT_PUBLIC_SUPABASE_URL` | the demo project's URL (me) |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the demo project's publishable key (me) |
   | `SUPABASE_SECRET_KEY` | **(you)** Supabase → `givezy-demo` → Project Settings → API Keys → secret key → copy into Vercel |
   | `DEMO_DATABASE_URL` | **(you)** Supabase → `givezy-demo` → Connect → "Session pooler" connection string, with your database password in it |

   Leave out every email, Paystack and receipt setting. (Demo mode refuses to switch on if a Paystack or Resend key
   is there.)
6. **(you) First deploy:** Vercel → `givezy-demo` → Deployments → Redeploy (or I push to `demo-site`).
7. **(you) First fill:** Vercel → `givezy-demo` → Settings → Cron Jobs → `/api/jobs/demo-reset` → **Run**. Takes a
   few seconds. Then open `https://givezy-demo.vercel.app/demo`.

## "It updates by itself when I push"

Once the Vercel project is set up as above, every push to `demo-site` builds and replaces the live demo
automatically. No localhost, nothing to click. A build of this site takes a few minutes (I'll time the first one
and note it here). Watch it under Vercel → `givezy-demo` → Deployments; a failed build leaves the previous version up.

How changes reach it: the other session keeps building on `milestone-1-foundation`. When you want the demo to catch
up, a session merges `milestone-1-foundation` into `demo-site` and pushes (never the other way round). That push is
what updates the demo.

**The demo's data does not change on deploy**, only at the 03:00 reset or when someone presses Run on the cron job.
If a new feature needs new demo data, the change to `src/lib/demo/data.ts` shows up after the next reset.

New database tables (a new file in `supabase/migrations`) have to be added to the demo database too: a session does
that with your yes, the same way as the real test site. Listed on the go-live checklist.

## The phone app and the demo (the Expo Go equivalent)

The website demo above is the "Expo Go" experience for the website: push, wait a few minutes, refresh.

For the app to show demo data, it needs three settings pointed at the demo instead of the test site:
`EXPO_PUBLIC_SITE_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Two ways:

- **Expo Go, from a session** (free, nothing published): run `npx expo start --tunnel` with those three settings
  pointed at the demo, and scan the QR code with Expo Go. Works only while that session is running.
- **An EAS Update on a "demo" channel** (free on Expo's free plan within its update limits; I haven't checked them
  today): publish the app's JavaScript with the demo settings to a `demo` channel, and open it in a development build
  of the app. Changes after that are one `eas update --channel demo` away. This publishes something to Expo, so I
  won't do it without your yes.

Either way: signing in in the app uses the emailed code, which the demo turns off (step 2), so in the app you would
browse charities and give as a guest. One-click sign-in in the app is a later job if you want it.
