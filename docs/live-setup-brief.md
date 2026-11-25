# Live setup brief: start here (written 25/11/2026, for the week of 30/11/2026)

You are setting up Givezy's **live** systems in a new chat. Yehuda is the founder and is not a coder. Read this whole file, then `CLAUDE.md`, then the team file (https://claude.ai/artifact/UR8s67afWim3h4Ks2zdmPz, open it with the Claude Docs tools), before you touch anything. Use the givezy-cto way of working: plain words, one recommendation, his yes at every gate.

## The goal of the week

Build the live systems next to the test ones, and **keep the public seeing only the coming-soon page**. Nothing takes real money and no real donor or charity is switched on this week. Done when:

1. A live Supabase project exists, with every migration applied and its security advisor clean.
2. A second Vercel project serves givezy.co.za from that live database, still showing the coming-soon page.
3. The password guard is switched on (test first, then live) and checked.
4. Yehuda has a click-through checklist, and the team log has a line for each step.

## What exists today (check each one before relying on it)

| Thing | Today |
| --- | --- |
| Code | GitHub `yehudaseider-boop/Charity-open-hand-`, branch `milestone-1-foundation` (work and push only here; push only when Yehuda says "push") |
| Vercel | Team `givezy` (team_JrK31XpFyI53fQZzqGYs3Exr), on Pro. One project, `charity-open-hand` (prj_7Z5RIEBpNNDeCX9iaeEPxx7hRHra), serves **both** test.givezy.co.za and givezy.co.za from the same deployment. givezy.co.za shows the coming-soon page because `COMING_SOON_HOSTS=givezy.co.za` is set there. Region fra1. Deploys wait for GitHub's Checks (the go-live gate) |
| Supabase | Organisation "givezy", on Pro (the plan includes USD 10 of compute credit, which covers one project). One project: **TEST**, `bodfyjskiwrwxhagtkxt`, eu-central-1. There is no live project yet |
| Phone app | Expo project `charity-app` (owner yehudaleib). EAS environments `preview` and `production` both point at the TEST project and test.givezy.co.za today |
| Migrations | 124 files in `supabase/migrations`, all applied on TEST |

If anything here doesn't match what you see, stop and tell Yehuda before going on.

## Rules for this week (these override habits)

- **Name the database every time:** "TEST" or "LIVE", and how you know (project ref or name). Never run anything on LIVE that hasn't been run on TEST.
- **His yes before:** anything that costs money (Rand first, USD in brackets, with the rate, date and source; never guess a price); every database change (TEST and LIVE each need their own yes); moving a domain; anything that can't be undone. Do these while he is at his laptop: approval prompts time out on his phone.
- **No secrets in chat, ever.** Yehuda pastes keys straight into Vercel, Supabase or GitHub himself. Never pull a secret key into the container. Generate a secret only with a command whose output stays on his screen.
- **No history rewrite, no force push.** Commit with the attribution lines the system gives you.
- **Log every step** in the team file's Team log (date, givezy-cto, what changed, what's next).
- After a push, watch GitHub's "Checks" and "End-to-end checks". If the Vercel status helper fails before any test runs ("Run not found" / "Not Found"), re-run that job once.

## Steps, in order

### 0. Before starting (with Yehuda)
- Get his yes on the cost: a second Supabase project is about USD 10 a month on top of today's bill (the Pro credit covers only one project). Look up the current price and a Rand rate on the day, with sources. The Vercel project should not need a new plan (the team is already on Pro), but check usage pricing and say so.
- Ask him which branch the **live** project builds from. Recommendation: a separate `main` branch that only moves when he says "release", so a normal push updates the test site only. The test project keeps building `milestone-1-foundation`.

### 1. Live Supabase project (LIVE)
1. Create it in the "givezy" organisation, region eu-central-1 (same as TEST), name "Givezy live". The Supabase tools ask to confirm the cost: confirm only after his yes.
2. Signing keys: keep the new asymmetric key (ES256). The website's local token check needs it (go-live list).
3. Apply all 124 migrations in file order. Stop at the first error and report it. Then compare the applied list with the folder.
4. Security and performance advisors: expect only the items already known on TEST (compare the two). Anything new: stop and report.
5. Authentication settings, to match TEST (read TEST's first; `supabase/config.toml` shows the intended values):
   - email code of 8 digits that lasts 10 minutes (`otp_length = 8`, `otp_expiry = 600`);
   - the email templates send the code, not a link (copy TEST's templates);
   - "Secure email change" on;
   - rate limits as the go-live list says ("Supabase's own sign-in limits");
   - Site URL and redirect URLs: `https://givezy.co.za/**` and `nedivlev://auth` (the app's scheme, unchanged on purpose);
   - custom email sending (SMTP) is needed before anyone outside the Supabase team can get a code. If Yehuda's email service (Resend) isn't set up yet, note it as blocked; don't work around it.
6. Causes: add them in Admin, Causes once the live site is reachable (never copy test data: no test charities, donors or gifts on LIVE).

### 2. Password guard (TEST first, then LIVE)
The database function `public.refuse_password_sessions` is in migration `20261124000012` (already on TEST). Supabase must be told to use it:
1. TEST: Supabase dashboard, Authentication, Hooks, Customize Access Token, Postgres function `public.refuse_password_sessions`, save.
2. Check on TEST: signing in with an emailed code still works (website and app); signing up with a throwaway address and a password is refused. The robot's end-to-end checks should stay green.
3. LIVE: the same switch, the same two checks once LIVE can send codes.
Background: decided 24/11/2026 (Yehuda chose to leave the switch for launch). The site, app and database already refuse password sessions; this stops Supabase handing them out at all.

### 3. Live Vercel project
1. Create a second project in the `givezy` team from the same repository, building the branch Yehuda chose in step 0, region fra1. Name it, for example, `givezy-live`.
2. Settings: follow `docs/vercel-settings.md`, section "The live site later". Key points:
   - the three Supabase settings point at LIVE;
   - a **new** `ENCRYPTION_KEY` (never reuse TEST's), and Yehuda keeps a backup copy: losing it makes bank, ID and tax numbers unreadable;
   - a new `CRON_SECRET`;
   - `SITE_URL=https://givezy.co.za`;
   - `COMING_SOON_HOSTS=givezy.co.za`;
   - no test payment settings (`TEST_GATEWAY_SECRET`, `ALLOW_TEST_GATEWAY`), and no `EMAIL_ALLOWLIST`;
   - leave payment, email, `APP_GIVING`, `SAVED_CARDS`, `CHARITY_SIGNUP` and the Givy switches unset. The payment provider is not chosen yet (team file), so no payment keys this week.
3. Turn on the same go-live gate as the test project (deploys wait for GitHub's Checks).
4. Domains, with Yehuda watching:
   - move givezy.co.za and www from `charity-open-hand` to the live project;
   - test.givezy.co.za stays on `charity-open-hand`;
   - DNS at GoDaddy should not need changing (both projects are on Vercel), but read both projects' domain settings before and after.
5. Once the move is done, take `COMING_SOON_HOSTS` off the test project. It then serves test.givezy.co.za only, and the coming-soon page now lives on the live project.

### 4. Check it
- givezy.co.za shows the coming-soon page, with its video and charity buttons, at 375px and 1440px.
- test.givezy.co.za still works as before, and the end-to-end checks stay green. They must keep running against TEST only: the robot makes its own account and must never touch LIVE.
- Live `/api/health` answers ok and reaches the LIVE database.
- **Known open risk:** with the coming-soon page on, the live address answers "not found" to `/api/...`, so Vercel's scheduled jobs on the live project may not run (go-live list, "Daily job while the coming-soon page is on"). Run `/api/jobs/daily` once from Vercel, Cron Jobs, and check it answers 200 rather than 404. If it's 404, report it and propose a fix; don't build one without his yes. While no real money moves, nothing is lost.
- How to reach Admin on LIVE while the coming-soon page is on is not solved yet (the page sends every other path to the front page). Work it out with Yehuda; don't loosen the coming-soon page on your own.

## Not this week (leave alone, and say so if asked)
- Real payments or a payment provider on LIVE (not chosen: Paystack or Stitch).
- Switching the phone app's `production` EAS environment to LIVE (only right before the first store build).
- Email sending on LIVE, unless Yehuda already has the email service and the domain's SPF, DKIM and DMARC records ready.
- `CHARITY_SIGNUP=yes`, the launch list, or turning the coming-soon page off.

## Where to look
- `docs/go-live-checklist.md`: the full list. Tick items with the date as you finish them.
- `docs/vercel-settings.md`: every setting, test and live.
- `docs/decisions.md`: why things are the way they are (newest first).
- `supabase/config.toml`: the intended auth settings (local and CI).
- The team file: the locked facts (price R200 a month, launch January 2027, provider not chosen).

## End of each session
Give Yehuda: Done, Check it (numbered taps, with what he should see), Blocked, Next, Decisions needed. Add the team log line.
