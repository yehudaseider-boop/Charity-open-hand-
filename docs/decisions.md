# Decisions and open questions

## Decided

- **Stack:** Next.js 16 + TypeScript, Supabase (Postgres, auth, storage), Vitest.
  Hosting: Vercel. Email: Resend (behind an adapter). PDFs: HTML printed by
  headless Chrome, because simpler PDF libraries break Hebrew right-to-left text.
- **Money:** integer cents in ZAR (`bigint`). Percentages stored as integer
  parts-per-million (3% = 30000) so fee maths never touches floating point.
- **Tax year naming:** SARS convention, named by the year it ends.
  Tax year 2027 = 01/03/2026 to 28/02/2027. Calculated in the app from config,
  in Johannesburg time. Confirmed by Yehuda.
- **Split always adds up:** the database refuses any donation where
  gift + platform fee + VAT on fee + gateway charge does not equal the total charged.
- **Receipts:** sequential per charity, immutable once issued, void keeps the
  row and needs a reason, never deleted, one issued receipt per donor per charity
  per tax year.

## Changes from the brief's starting data model

- `users` became `profiles` (Supabase already has an auth users table).
  Platform admin is a role on the profile; charity admin is a membership in
  `charity_admins`, so one person can be both a donor and a charity admin.
- Charity bank and contact details moved to `charity_private`, so the public
  directory can never expose them.
- The donor's private note moved to `donation_private_notes`, so charities can
  never read it, even by accident.
- Maaser, favourites and "given elsewhere" are keyed by account (`user_id`),
  not donor identity, because only account holders get them.
- A donor identity is per email + type, so one person can give as an
  individual and as their company and receive separate receipts.
- `donor_type` includes `trust`, because the SARS receipt fields list
  individual, company and trust. Confirmed by Yehuda.
- `donations.funding_source` is `card` only for now. A future wallet adds a
  `wallet` value and separate double-entry tables without changing this one.
- `gateway_events` stores every webhook once, for idempotency.

## Charity onboarding (milestone 2)

- Applicants sign in, start a draft, fill it in section by section, upload
  documents and submit. A platform admin approves, sends back with a reason,
  suspends, reinstates or removes s18A status. Every step is in the audit log.
- An application needs an NPO number or a PBO reference (at least one).
  Entering an s18A reference requires a PBO number, the s18A approval and a
  signed receipting mandate.
- Badges are set by the platform admin at approval: "Verified" (vetting
  confirmed), s18A confirmed, and mandate confirmed. The "s18A" badge shows
  only when both s18A and the mandate are confirmed.
- The mandate's signing date is the date the charity enters on upload; the
  admin confirms it at approval.
- Bank account numbers are encrypted (AES-256-GCM, key in ENCRYPTION_KEY).
  Only the last 4 digits show. A platform admin can reveal the full number,
  which is logged.
- Once submitted, a charity can't change its bank details, legal names,
  registration numbers or documents. Once approved, legal details and bank
  stay locked; only a platform admin can change them. Contact person and
  public profile stay editable.
- Documents open through 60-second signed links, for that charity's admins
  and platform admins only. Every view is logged.
- Suspended charities disappear from the directory and their page.

## Guest checkout (milestone 3)

- **Gateway:** Paystack (chosen by Yehuda). Everything goes through the adapter
  in `src/lib/gateway`. A stand-in "test gateway" (no real money, refused on a
  real server) is used to build and test locally.
- **Paystack adapter not yet tested:** this session's network blocks
  paystack.com and api.paystack.co. Points to confirm in test mode are marked
  VERIFY in `src/lib/gateway/paystack.ts`.
- **Split:** the charity's subaccount receives exactly the gift. The rest
  goes to our main account, which pays Paystack's charge out of it.
- **Fee formula:** total = (gift + our fee + VAT on our fee + gateway fixed
  charge) / (1 - gateway percentage). If the gateway adds VAT on top of its
  rates, its percentage and fixed charge are multiplied by 1.15 first. Which
  case applies comes from the rate sheet (`gatewayRatesIncludeVat`).
- **Rounding (agreed):** our 3% and VAT on it round to the nearest cent,
  halves up. The total always rounds UP to the next cent, so we never net less
  than our fee. The gateway part is the remainder, so the parts always add up.
- **What's shown is what's charged:** fees are calculated on the server only.
  If fees change between the donor's quote and payment, the donor is shown the
  new total and must confirm again.
- **Donations are refused** while the gateway rates are empty, and for
  charities not connected to the gateway.
- **Donor details:** stored with each donation exactly as typed (ID and tax
  numbers encrypted, last 4 digits kept for display). An existing donor
  record is never overwritten from a guest checkout, because anyone can type
  any email address; only empty fields are filled.
- **Payment confirmation:** the webhook signature is checked, each event is
  stored once (repeats are ignored), and the payment is checked directly with
  the gateway before it is marked paid. The amount must match to the cent.
  The return page checks too, in case the webhook is late.
- **Card-testing protection:** at most 5 checkout attempts per 10 minutes per
  email and per IP address, plus a hidden field that bots fill in.
- **Stubbed for later:** donor and charity emails (milestone 4), refunds and
  chargebacks (admin screen, later), private note to self (needs accounts,
  milestone 4), monthly giving (milestone 5).

## s18A receipts job (08/10/2026, built, switched off)

- **One annual receipt** per donor, per charity, per SARS tax year, covering every
  paid donation that asked for an 18A receipt. Issued after the tax year closes.
  The amount is the gift only, never the processing fee. (Attorney to confirm: T5, T6.)
- **Who qualifies:** charity has s18A approval and a signed mandate, and the mandate
  was signed before the donation was paid. Refunded, charged-back, pending and
  failed donations never count. These rules are enforced inside the database function
  `issue_s18a_receipt`, not only in the job, which issues one receipt in one transaction
  (number, receipt and donation links together, or nothing).
- **Receipt number:** `<QuickGive code>-<tax year>-<4 digit running number>`, for example
  `LTC-2027-0042`. The running number is per charity and never reused. Sample format; change if wanted.
- **Printed on the receipt:** charity legal name (English and Hebrew), NPO, PBO and s18A
  numbers and address; donor name, address, registration number, and the last 4 digits only
  of ID and tax numbers; each donation's date and amount; the total; the wording. The whole
  snapshot is stored with the receipt, so the PDF can be made again exactly.
- **Wording is a DRAFT** (`src/config/receipts.ts`) until the attorney confirms it (L4, T4).
  Real receipts are refused until `RECEIPT_WORDING_CONFIRMED=yes` and `RECEIPTS_ENABLED=yes`.
- **PDF:** the receipt is a web page printed by headless Chrome (handles Hebrew), with
  fonts embedded. Stored privately in the `receipts` bucket, PDF only, 2 MB limit.
- **How it runs:** by a person from the command line, never from the website:
  `npm run receipts -- 2027` (dry run), `-- 2027 --preview=./out` (DRAFT PDFs), `-- 2027 --issue`.
  Safe to run again: no double receipts, and a receipt whose PDF failed gets it next run.
- **Late payments:** a donation paid in the tax year but confirmed after its receipt was
  issued is not on that receipt. The job lists paid donations it could not receipt so a
  person can look. Void and re-issue is allowed by the database; no screen for it yet.
- **Donors see their receipts:** the Account page lists a donor's receipts with a PDF
  download (60 second signed link, logged, only for issued receipts). Donors are linked to
  an account when they sign in with the emailed link (`link_donors_to_user`): it fills in
  only donors that have no account yet, and never takes one from another account.
  A donor must sign in with the email address they gave with.
- **Emailing:** `--email` on the job sends each donor their receipt (PDF attached) once
  (`s18a_receipts.emailed_at`); a failed email is retried on the next run and never stops
  the others. Email goes through an adapter (`src/lib/email`): `console` (default, only logs
  a masked address) or `resend` (written to Resend's published API, NOT yet tested against it).
- **Void and re-issue:** platform admins withdraw a receipt on `/admin/receipts` (reason
  required, logged, never deleted). Then running the job again issues a replacement.
  The charity dashboard (separate piece of work) will show receipts to charities.
- **Not built yet:** full ID number printing (needs the attorney's answer), receipt emails
  in Hebrew, and automatically linking the replacement to the withdrawn receipt (`replaced_by_id`).

## Open (ask Yehuda when reached)

1. Gateway choice and rate sheet (percentage + fixed charge). Fields are empty.
2. Whether the processing fee shown to donors includes VAT once VAT-registered.
3. Platform name, domain, logo and colours.
4. Rounding rule for fees: agreed (see Guest checkout).
5. Supabase has no South African region; POPIA cross-border transfer for the attorney.
6. Receipting mandate wording (attorney). For now charities upload a signed copy.
7. Bank account verification through the gateway (milestone 3). Until then
   the admin checks the bank confirmation letter by eye.
8. Who may apply: "NPO number or PBO number, at least one". Confirmed by Yehuda.
9. Emails to charities on approval or send-back arrive with the email provider (milestone 4).
10. No screen yet for a platform admin to change an approved charity's bank details.
11. Paystack rate sheet: percentage, fixed amount, and whether they include VAT.
12. 18A for donors without an SA ID number (e.g. passport holders).
13. Network access to paystack.com and api.paystack.co for this environment, and Paystack test keys.
14. Phone wallets (Apple Pay and Google Pay), chosen by Yehuda (08/10/2026). Not a stored-value
    balance: we do not hold donors' money. Nothing is built yet. To confirm with Paystack:
    whether Apple Pay and Google Pay are offered to South African (ZAR) merchants, whether they
    appear on Paystack's hosted checkout page (the adapter uses it) or need Paystack's inline
    checkout on our own domain, and what domain verification Apple requires. The adapter does not
    restrict payment channels today, so wallets show up if Paystack enables them for the account.
    A top-up balance wallet is a separate decision: it means holding donor funds and needs legal
    advice first (see `donations.funding_source`).

## Maaser, chomesh and general tzedaka (08/10/2026, decided by Yehuda)

- Every gift is marked maaser, chomesh or general tzedaka (`donations.giving_kind`).
  The donor must choose at checkout; there is no default. Older rows stay empty.
- Maaser and chomesh have separate targets and separate progress bars. General
  tzedaka is shown on its own and counts towards neither.
- Targets: from income (maaser 10%, chomesh a further 10%) or fixed amounts,
  per month or per Rosh Hashana year. The earlier "other percentage" option is gone.
- This is for the donor's own records only. It is not on receipts, and charities cannot read it:
  it lives in `donation_giving_kinds`, readable only by the donor (08/10/2026: moved out of `donations`).

## Phone app (apps/mobile)

- Expo app for donors (iOS, Android, plus a web preview for review). Charity
  and admin screens stay on the website.
- Design bible: parchment, ink, one pomegranate accent, Frank Ruhl Libre and
  Assistant. Primary buttons are ink; pomegranate is for selection, progress
  and the active tab. App shows whole Rand as "R1 250"; money summaries show cents.
- Fee maths is the website's own `src/lib/fees.ts`. The app's gateway rate is a
  SAMPLE, labelled "Sample rate, not final" on screen, until the rate sheet arrives.
- All screen data is fictional sample content; payment is a stub.
- App identity for TestFlight: bundle ID `za.co.givingapp.app` (permanent),
  display name "Giving (test)" (changeable), placeholder icon with no name.
  Published under Yehuda's existing individual Apple Developer account for now;
  transfer to the company's account later.
- Open: Apple's App Review rules on charity donations inside apps (Apple Pay,
  approved nonprofits, or paying in Safari) must be checked before external
  testing or public release.

## Charity dashboard (09/10/2026)

- Five day-one screens at `/charity-admin/[id]`: Overview, Donations (with detail), Donors, Receipts, and CSV downloads of donations and donors.
- Charities read through `charity_donations` and the `charity_*` functions only. They never see fees, gateway data or the donor's maaser/chomesh/tzedaka choice.
- Charity admins see donor name, contact and address as typed at checkout, and no part of ID or tax numbers (changed 15/10/2026, see below; it was the last 4). Anonymous donors are anonymous on public pages only.
- CSV downloads are checked against `is_charity_admin`, rate limited (10 per 10 minutes per person) and audit logged. Cells that start with `=`, `+`, `-` or `@` are neutralised.
- Receipts screen is read-only. Only platform admins withdraw and re-issue receipts.
- Decided by Yehuda (09/10/2026): owners and admins see the same things; no team invites for now (platform team adds charity admins); English only everywhere, no Hebrew version.
- 2FA for charity admins: yes. Authenticator-app code (TOTP) is required once per sign-in before any charity page, action or CSV download (`/mfa`, `src/lib/mfa.ts`). TOTP must be switched on in the live Supabase project (Authentication, Multi-Factor). Platform admins need it too (Yehuda, 09/10/2026), which settles #4.
- Not browser-tested here: the pages need a live Supabase. Verified by build, typecheck, lint and the database tests.

## Donation model and app hand-off (Yehuda, 08/10/2026)

- Name is Nadiv Lev everywhere. "Open Hand" is retired.
- No platform fee and no processing fee. Donors may tick a box to add a contribution to Nadiv Lev: any amount, minimum R10, unticked by default. Minimum donation stays R30.
- The donation and the contribution are separate line items (`amount_cents`, `contribution_cents`), whether or not the gateway splits payments. Charities never see the contribution.
- OPEN: who pays the gateway's own charge (the charity out of its donation, or Nadiv Lev). Real gateways stay closed until decided (`platformConfig.fees.gatewayChargePaidBy`); only the test gateway runs.
- OPEN: which gateway, and whether it splits payments for South African merchants. Both adapters have `splitsPayments: false` until confirmed.
- (Replaced on 13/10/2026, see "Giving from inside the app" below.) App Store rule: the app never takes payments. It shows no amount to pay, card fields or pay button. "Give on our website" opens the phone's browser on `/c/[slug]/donate`, carrying the donor's maaser, chomesh or tzedaka choice (`?kind=`). Amount fields for maaser targets and calculators in the app are fine: no money moves.
- The confirmation page shows amount, charity, contribution and reference (`NL-XXXXXXXX`), and a "Back to the Nadiv Lev app" link (`nedivlev://giving`; a universal link once we have a domain). In Expo Go the custom link does not open the app; it needs a standalone build.
- Giving history and maaser/chomesh stats come from the server, updated by the webhook. A donor signs into the app with the email they gave with, and every donation under that email appears. (Server side done; app sign-in and live data still to build.)
- Nadiv Lev issues the s18A receipts on the charity's behalf, as built.
- s18A details asked: ID number or income tax number only. Address and phone left out until Yehuda confirms what an s18A receipt must show.
- Monthly donations: built 13/10/2026 (see "Monthly giving" below). Not by the gateway's recurring billing: by our own scheduled job.

## Code review fixes (08/10/2026)

- Admin rights now need the authenticator second step in the database itself (`has_second_step()` checks the session's `aal2`), not only in the website.
- One s18A receipt per person: donations carry a keyed fingerprint of the s18A identity typed at checkout, so people sharing an email are never merged.
- Charities only see donor details for paid, refunded and charged-back donations.
- Legal details are locked while an application is under review.
- Rate limiting no longer trusts the client-typed IP. Set `CLIENT_IP_HEADER` once hosting is chosen (#3).
- Still open from the review:
  - A donor who signs in sees every donation and receipt made under their email, including one someone else gave using that address. Inherent in linking by email (the confirmation and receipt emails go to that address anyway); revisit with Yosef under POPIA.
  - "1,000" is refused as an amount on purpose: in SA it can mean R1 or R1 000. The donor sees "Enter an amount in Rand, for example 180 or 180.50."
  - The app uses the phone's own time zone for dates; fine in South Africa, to fix before any overseas use.

## Privacy lanes (08/10/2026)

Who sees what, enforced in the database and tested in `tests/privacy-db.test.ts`:

| Who | Sees | Never sees |
|---|---|---|
| The public | Approved charities' public profile | Gateway references, mandate file, rejection reasons, any donor or donation |
| A donor | Their own donations, giving kind, monthly donations, receipts, maaser records | What was typed at checkout (ID/tax numbers, fingerprints), anything of other donors or charities' private side |
| A charity admin (with code) | Their own charity; donors who paid them: name, contact, amount, message, 18A yes/no | Fees, Nadiv Lev contributions, gateway data, maaser/chomesh choice, any part of ID or tax numbers, other charities, abandoned checkouts |
| A platform admin (with code) | Everything needed to run the platform | Card details (never stored); ID and tax numbers only encrypted |
| The server only | Gateway events, receipt numbering, rate limits, writes to money and receipts | |

- No client role may truncate, add triggers or reference tables.
- Charity document records can only point at files in that charity's own folder.

## POPIA and legal touchpoints (08/10/2026)

- `/privacy` and `/terms` are DRAFTS for Yosef, shown with a draft notice until `legalConfig.reviewedByLegal` is true. Footer links on every page; the app links to both from Account.
- Every agreement is stored with its version (`consents` table, `legalConfig.policyVersion`):
  - Account: anyone signing in must tick "I agree to the Terms and Privacy Policy" and "I am 18 or older" once per version (`/agree`). Changing the version asks everyone again.
  - Donation: the donor's consent line links the Terms and Privacy Policy, covers sharing with the charity and keeping the maaser/chomesh choice privately; stored per donation.
  - Charity application: four declarations on submitting (authority, true information, terms, POPIA handling of donor information); stored with the person and charity.
- Data rights: signed-in people can download everything we hold (`/account/data/export`) and ask to correct, delete or stop use of their information. Requests go to `/admin/requests`; the Information Officer is emailed (no personal details in the email) once an address is set.
- Rate-limit records (IP addresses, emails) are cleared after about a day.
- No marketing, no tracking or analytics cookies, no selling of data.

To be supplied before going live (`src/config/legal.ts`): company name, registration number, address, Information Officer name and email, privacy email. For Yosef: refund policy, retention period for tax records, payment and service providers and where they store data, limits of liability, the full charity agreement, and whether a required maaser/chomesh/tzedaka choice is valid consent for special personal information. Also: the Information Officer must be registered with the Information Regulator.

## Live giving history in the app (09/10/2026)

- Donors sign in inside the app with a 6-digit code emailed to them (no password, no website round trip), then agree to the Terms and Privacy Policy once per version, as on the website. The session is kept in the phone's secure storage (Keychain / Keystore).
- The app reads only the donor's own rows through row-level security, with the public key: paid donations, their maaser/chomesh/tzedaka choice, monthly donations and issued receipts. It writes nothing except two checked database functions: `link_my_donations()` (joins donations given with that confirmed email) and `agree_to_policy()`.
- Giving history is written only by the server when the payment provider confirms a payment. The app re-reads when it opens, comes back to the front (e.g. returning from the website after donating), or the donor pulls down to refresh.
- Maaser/chomesh targets stay on the phone (secure storage), never on our servers.
- Pausing or cancelling a monthly donation, and downloading a receipt PDF, are done on the website.
- Until the live database exists the app runs in preview mode with sample data.
- To switch on: set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (and `EXPO_PUBLIC_SITE_URL`) in the EAS "preview" and "production" environments, and change the Supabase "Magic Link" email template to include the code (`{{ .Token }}`). Build with `--clear` after changing them: the bundler caches old values.

## Income, giving elsewhere, and monthly donation controls in the app (09/10/2026)

- **Income log (for maaser):** stays on the phone only, in its secure storage, never sent to our servers. A tenth of the income logged in the target's period is maaser owed, and a further tenth chomesh if the donor keeps it (same tenths as the target editor). The server's encrypted `maaser_income_entries` table is left unused. Trade-off: no sync between phones, and deleting the app deletes the log. To sync across devices later, income would need to be encrypted before it leaves the phone.
- **Giving elsewhere** (cash, shul appeals, other charities): saved on the donor's account (`external_giving_entries`, visible only to them) with their own maaser/chomesh/tzedaka choice, and counted towards those totals. Entries are removed by pressing and holding.
- **Pausing, resuming and cancelling a monthly donation** from the app, through `set_my_recurring_status()`: only the owner, only active-to-paused, paused-to-active, or either to cancelled (cancelled is final). Each change sets `needs_gateway_sync`, and the app says "requested" until the server has told the payment provider. NOT BUILT: the call to the payment provider, and monthly donations themselves (the donation form is once-off only). Both come with the gateway choice. Until then no monthly donation exists to pause.

## Website polish (09/10/2026)

- Website matches the app: logo blue, ink text, soft blue-green page, Archivo font, Nadiv Lev logo in the header, app icon as the site icon.
- English only on the website and in the app: Hebrew names and descriptions are no longer asked for or shown (the database columns stay, unused).
- Charity pages: cover, logo (or initials), area, "What they do" and a new "How your donation is used" field the charity fills in (`charities.funds_use_en`, public).
- Home page: welcome, how it works, a few charities, the app.
- Wording: we say "Nadiv Lev charges no fee on donations", never "the charity gets your full donation", until it is decided who bears the payment provider's charge.

## Plain-English explanations (09/10/2026)

- Small "i" buttons explain tzedaka, maaser, chomesh, general tzedaka, the Rosh Hashana giving year and s18A receipts, for donors who don't know the terms. One shared text (`src/lib/glossary.ts`) is used by the app and the website.
- The text stays general and sends personal questions (e.g. maaser before or after tax) to the donor's Rabbi. It quotes no tax percentages: "up to a limit set by SARS". Wording is a draft for Yehuda to check.

## Making the app feel like ours (09/10/2026)

- **Jewish calendar:** the app greets by the day (Good Shabbos, Shavua tov, Chag sameach, Shana tova, Gmar chasima tova, Happy Chanukah, Freilichen Purim) and shows the Hebrew date, using diaspora Yom Tov. Seasonal cards in Elul, before Purim (matanos l'evyonim) and before Pesach (maos chitim). The calendar is our own arithmetic, checked against Hebcal for every day from 2020 to 2035. `isQuietTime()` (Shabbos and Yom Tov, from noon the day before) is ready for when the app sends notifications: none are sent then.
- **Thank-you moment:** when a new donation reaches the app, it thanks the donor (amount, charity, date, and whether it counts as maaser, chomesh or tzedaka), with the charity's own short thank-you note if it wrote one (`charities.thank_you_en`, up to 300 characters, set on the charity's profile page, public). Which donations were already shown is kept on the phone (ids only), so a thank-you shows once.
- **Maaser milestone:** when the target is reached the Giving tab says so, with "Tizku l'mitzvos."
- **First-open welcome:** three short screens (what Nadiv Lev is, giving happens on our website, an optional maaser target). Skippable, shown once per phone.
- **Small touches:** gentle vibrations on buttons, choices and tabs; soft fades between tabs; animations switched off when the phone asks for less motion; larger text honoured (big headings capped so they still fit); screen-reader labels checked.
- **Offline:** the last giving loaded is kept in the phone's secure storage for the signed-in person, so the app opens straight to it and still shows history without signal ("No connection. Showing what was saved on dd/mm/yyyy at hh:mm."). It is deleted when they sign out.

## Real photos and updates from charities (09/10/2026)

- Charities add up to 12 photos (with an optional caption of up to 120 characters) and post short updates (up to 500 characters, with an optional photo) from a new "Photos and updates" tab in their dashboard. Both are public once the charity is approved, on its website page and in the app.
- They publish straight away; Nadiv Lev admins can remove any. Nothing is edited in place: remove and post again. Who posted is kept for us and never shown publicly.
- The dashboard asks charities to post only photos they may share and never to show a family who receives help without consent. OPEN for Yosef: whether charity uploads need anything more under POPIA (e.g. a line in the charity agreement).
- The app now reads the live charity directory (approved charities only) when connected; until then it shows the sample charities. Charities without a cover photo show their initials instead of a placeholder.
- The target editor says "I give" (maaser, or maaser and chomesh), not "I keep".

## Saved charities (09/10/2026)

- Discover shows every approved charity. The heart on a charity saves it; saved charities show as "Your charities" at the top of Discover and on the Giving tab, newest first, one tap from the charity's Give button.
- Signed in: saved on the account (the `favourites` table, readable and changeable only by its owner), so they show on any phone. Signed out: saved on the phone and added to the account when the person signs in.
- Saved charities are already part of "Download my data" and are deleted with the account.

## Full code and bug check (09/10/2026)

Five reviewers (app screens, app logic, website pages, website server code, database) plus an automated click-through of every app screen and every public website page, and a test donation from start to finish.

Fixed:
- **Security:** someone could sign up with a password using a guest donor's email and claim their giving history. Joining past donations now needs a sign-in by emailed code or link, and email confirmation is on. Also: private notes only on your own donations; database functions not callable by everyone; issued receipts and paid donations fully fixed; no documents added after submission; sign-in links built from SITE_URL, not request headers; uploads checked by their content, not just their claimed type; admin decisions can't collide; rate limits on sign-in links, charity applications and updates.
- **App:** Giving/Receipts stuck loading after a failed first load; offline sign-in asking for consent again; the last person's data reappearing after sign-out; heart taps undoing each other; phone storage writes that could be left half-done; month totals missing days before Rosh Hashana; income log that could be wiped; donors with more than 1 000 donations; bottom sheets (Android back, tab bar, keyboard); dead buttons (Help, website links, seasonal card); heart now fills blue.
- **Website:** wording that mentioned a processing fee we don't charge (dashboard, receipts, receipt emails); donate form losing details when the amount changed; duplicate field ids; branded error and not-found pages; admin navigation; charity and donor see the same donation reference; donations while signed in join the account straight away; thank-you page handles a provider outage and a payment under review.

Still open (need a decision or the payment provider):
- Refunds and chargebacks from the provider are recorded but not yet acted on (status and receipt). Built with the gateway choice.
- If a charity loses s18A status, do donations made while it had it still get receipts? (Today: no.)
- Should an approved charity's name change need our review?
- Dates use the phone's time zone; a donor abroad could see a donation on the previous day.
- On iPhone, the Keychain keeps sign-in and income after the app is deleted.

## Expo Go preview link (09/10/2026)

- One permanent link for the preview: `exp://u.expo.dev/bb247170-f27b-4771-b143-41f5098c06bc?channel-name=preview&runtime-version=exposdk%3A57.0.0` (the runtime version part is needed so Expo Go picks the update that matches it). It follows the "preview" channel (linked to the "preview" branch), so Expo Go loads the newest published update instead of a fixed one. No new QR code per update. **Pushing code to GitHub does not change what Expo Go shows.** A new look reaches the phone only when an update is published to the preview channel: from `apps/mobile`, `npx eas-cli update --branch preview --environment preview --message "..." --non-interactive` (needs the Expo login; in a cloud session the connection supplies it). Published 13/10/2026 for the Givezy look (update group e87ccc57-2998-4855-98ed-456cbf2b9f06). Expo Go always shows Expo's own icon and name; the app's own icon and name appear only in a standalone build (TestFlight or a store build).

## Everyone has their own records on a shared phone (10/10/2026)

- Yehuda: "everyone must have their own". The income log and maaser/chomesh targets are now kept per signed-in person on the phone; nobody sees anyone else's. Saved charities already live on each person's account.
- Anything set up before signing in goes to the first person who signs in on that phone (and only them), so a new user doesn't lose it.

## Pooled-fund model (10/10/2026), not built yet

Yehuda's direction:
- **Nadiv Lev receives the donations.** Picking a charity is the donor's recommendation of where they'd like the money to go, not a payment to that charity. The Terms will say so.
- **Nadiv Lev distributes** the funds to charities based on what donors recommended.
- **s18A:** the charity we pay sends an s18A certificate, which we or the charity upload into the app for the donor.

To do (not decided yet):
1. **s18A per donor or one total?** An s18A receipt is issued to a named donor, so does the charity send one per donor per year (with each donor's name and ID or tax number), or one total? Undecided.
2. **Who uploads the certificates:** Nadiv Lev, the charity, or both. Undecided.
3. **For Yosef, before building:** if the donor pays Nadiv Lev, can the receiving charity legally issue an s18A to that donor, or must Nadiv Lev itself be an s18A-approved PBO that issues the receipt? Also: holding and distributing donors' money (trust account, banking, payment provider rules), and how the "recommendation" wording sits with POPIA and consumer law.
4. **App and website wording** would change from "Give to [charity]" to "Recommend [charity]" once this is confirmed.
5. **Who pays the payment provider's charge.** Still open.

## Brand kit applied (11/10/2026)

Applied the Nadiv Lev brand kit (`NEDIV_lev_brand_kit.pdf`) to the app and the website.

- **Name:** "Nadiv Lev" everywhere (both words capitalised). Replaces "NEDIV lev" in all text, docs and tests. Left as they were, because renaming them would break things without helping anyone: the app's link scheme `nedivlev://`, the keys the phone stores its data under (`nediv-lev.*`), the test accounts (`@nedivlev.test`), package names and the older database migration files.
- **Colour:** cream pages, white forms, ink text (#191C2B), indigo headlines (#1F2A5E), stone secondary text (#6A6E80). Buttons and links are deep coral (#C4442F). Coral (#E5604B) is the single accent: the saved heart. Sage (#4F8A73) for progress bars and the s18A badge. Honey is defined for highlights but not used yet. Three shades are not in the kit, derived because the kit has none: a warm border (#E4DCCB), a pale coral tint (#FBE9E4) for highlight cards, and a darker sage (#2F6B55) and red (#A32818) for small success and error text, since sage and coral are below 4.5:1 on cream.
- **Type:** Fraunces 600 for page titles and headlines (20 px and up only), Inter 400, 500 and 600 for everything else, Inter 600 with tabular figures for amounts. Heebo for any Hebrew. Archivo and Assistant are removed.
- **Logo and icons:** the wordmark with the coral dot (concept 1) and the cream N with the coral dot on indigo (icon A), made from Inter so they can be redrawn at any size. Files: `public/brand/` (SVG, cream, one-colour indigo), `public/logo.png`, the app and favicon PNGs. The final logo files in the kit are still to confirm (kit open decision 1).
- **s18A badges:** two badges the same shape and size, "s18A receipts" with a sage outline and tick and "No s18A receipt" with a stone outline and dash, both with ink text. "18A" in text is now "s18A".
- **Rand:** see the follow-up below.
- **Not done yet:** the donation confirmation email is still plain text, and the kit's open decisions: entity line for footer and receipts, the fee sentence on the donate page, trademark and domain.

## Rand without cents, and honey (11/10/2026)

- Yehuda reversed the earlier choice: Rand follow the brand kit everywhere (app, website, emails, receipts): `R1 250` and `R30` when the cents are zero, `R34.57` and `R1 250.50` when they are not. One function does it (`formatRand`), so they can't drift apart. CSV exports for spreadsheets keep `1250.00`, which is what a spreadsheet needs. `CLAUDE.md` updated.
- Honey (#F2B84B) is now used for highlights: the seasonal card on Discover, the "You've given your maaser" message, and the bars in the charity dashboard's monthly chart. Indigo or ink text on it, never coral. A pale honey tint (#FBF0D3) is derived for the card backgrounds.

## The app follows the Jewish day and week (11/10/2026)

- **The Jewish day turns over at sunset**, not midnight. On Saturday night the app already shows Sunday's Hebrew date. Sunset is worked out from the date (Johannesburg, standard method, checked against Hebcal for every day of 2026 and 2027: within 3 minutes), so there is no table to go stale.
- **"Where the week is at"** now sits under the date on Discover (the first screen only; Giving and the other tabs stay clean), in plain words, updated every minute: "Rosh Chodesh Cheshvan starts tonight: Sunday and Monday.", then "...: today and tomorrow.", then "...: tonight and Monday.", then "...: today.". It also covers festivals, fasts and Chanukah ("Chanukah starts tonight and runs until Saturday.") and "Shabbos starts tonight." on Friday. It says "tonight", never a time.
- **Shabbos and Yom Tov end 72 minutes after sunset** for the greeting ("Good Shabbos" until then, then "Shavua tov") and for the quiet time when no reminders or notifications go out. That is later than most communities' nightfall on purpose, so the app never says the week has begun while anyone is still keeping Shabbos. Open for Yehuda or the Rabbi: whether to use another rule.
- **Limits:** Johannesburg sunset is used for everyone (other SA cities differ by up to about half an hour, which is why no times are shown), and the phone must be on South African time.

## Dummy photos in the sample charities (11/10/2026)

- The four sample charities in the app's preview now have a cover photo, two gallery photos and (for Northcliff Meals Fund) a photo on an update, so the screens show how real pictures will look. Made with an image generator (no faces, no text), natural-light style, 12 images, about 3 credits in total.
- They are loaded from their web addresses (the generator's host), not stored in the repository, and are only used in the preview. If those addresses stop working the app falls back to the grey placeholders. Real photos come from the charities' own uploads (dashboard "Photos and updates"), which the live app already shows.

## Greeting and date on the first screen only (11/10/2026)

- The greeting, Hebrew date and "where the week is at" line show on Discover only, not on Giving or the other tabs. To show them on every screen instead, put `<DayGreeting />` back under the heading on the other tabs.

## Security and reliability fixes (11/10/2026)

Six findings from an independent review, fixed on `milestone-1-foundation`. No live payments were enabled and nothing was deployed.

1. **Confirmation page privacy.** The donation id is not a secret (charity admins see it in the dashboard and CSV), so it no longer opens the donor's giving choice or contribution. The page shows those only to the signed-in donor (row-level security decides) or to someone holding a 256-bit credential that is sent only in the gateway return address (`&t=`). Only its SHA-256 hash is stored, in `donation_confirmations` (migration `20261011000001`, no client can read it). Without either, the page says the payment went through and shows no amounts or choice. The page sends `Referrer-Policy: no-referrer`.
2. **Payment database errors.** `confirmPayment` checks every read and write, re-reads after an empty update, and throws `PersistenceError` instead of reporting `paid` or `failed` that was not saved. The confirmation email is sent only by the call that made the change.
3. **Webhook retries.** An event whose payment is still pending, or whose confirmation hit a database or gateway error, is not marked processed and answers 503 or 500, so the gateway delivers it again. `processed_at` is checked for write errors. A success event for a payment we cannot match is written to the audit log (`webhook.unmatched_payment`) before it is finished. A payment held for review is already audit-logged by `confirmPayment`. Open item: there is no scheduled sweep, so a payment still pending after the gateway stops retrying needs the team to look at unprocessed rows in `gateway_events`. Decide whether to add one.
4. **Phone storage.** Income log and targets now return explicit results. A failed or invalid read is a problem state (try again; for invalid text, an explicit "set aside and start again" that keeps the old text under a `.set-aside` key), never an empty list. A failed save shows a banner with "Try saving again" and the entries stay on screen. Records and failure banners are per person.
5. **Dependencies.** Fixed: `uuid` (override of `xcode`'s copy to 11.1.1). Not fixable today: `braces` (every published version, 3.0.3 is the latest), `node-forge` (1.4.0 is the latest) and `decode-uri-component` (the patched 0.5.0 is ESM-only and `query-string` 7 in expo-router needs the CommonJS 0.2.x). See the change summary for paths and exposure.
6. **Phone lint.** `apps/mobile/eslint.config.js` (eslint-config-expo) so `npm run lint` in `apps/mobile` checks the app. Existing errors were fixed in the code, not suppressed.

Deploy steps: apply migration `20261011000001_confirmation_credentials.sql`. Donations that started before the change have no credential, so their return page shows the generic "Your payment went through" view (their confirmation email is unchanged).

## Review round fixes (13/10/2026)

Five confirmed bugs from the ten-part code review, fixed on `milestone-1-foundation`. The other findings are listed in the review report and are not changed yet.

1. **Uploads over 1 MB.** Next.js caps server action bodies at 1 MB by default, so charity photos and documents (allowed up to 5 MB) were refused before our own check ran. `next.config.ts` now allows 6 MB.
2. **Yearly s18A job.** A donation confirmed after its donor's receipt was issued used to make the job plan a second receipt, hit the database's one-receipt-per-donor-per-year rule and crash on every run. Now such a donation is skipped as `late_after_receipt` and listed under `needsAttention`: a person voids the receipt and issues it again with the late donation on it. One failing receipt or PDF no longer stops the others; failures are listed in `failed` and the script exits with an error code.
3. **Bank details.** A charity that is a draft or was rejected could change its bank account and keep the "verified" stamp. Any bank change by the charity now clears the stamp (migration `20261012000001`). Only the platform sets it.
4. **Phone storage.** If one piece of a stored value is missing, the income log and targets now report "could not be opened" instead of "empty" (`getItemStrict`), so the next save cannot overwrite what is left. A write that fails half-way removes its half-written pieces.
5. **Forced sign-out.** The phone's offline copy of someone's giving is now also removed when the session ends by itself (a `SIGNED_OUT` event), not only when they tap Sign out. It is deliberately not removed when the phone is merely offline at start-up. A session that ended while the app was closed leaves the copy until the next sign-in or sign-out (it is only readable by that same person).

Go-live: also apply migration `20261012000001_bank_edit_clears_verified.sql`.

## Giving from inside the app (13/10/2026)

Changes the earlier rule "the app never takes payments" (decision of 08/10/2026). Yehuda asked for payment through the app and said Paystack is fine with it. Paystack's agreement covers the payment processor only, not Apple's or Google's store rules.

- **Design.** The app does not build a card form and never sees card details. "Continue to payment" opens our existing website payment page (amount, donor details, gateway) in the phone's in-app browser sheet (`expo-web-browser`, private session). The donor's maaser, chomesh or tzedaka choice still travels with the link. When the donor finishes, the page's "Back to the Nadiv Lev app" link (`nedivlev://giving`) closes the sheet, and the app looks for the new gift a few times (now, 5 s, 15 s, 30 s) so the thank-you appears without a manual refresh.
- **Switch, off by default.** `EXPO_PUBLIC_IN_APP_GIVING=yes` at build or publish time turns it on. Off, "Give on our website" opens the phone's browser as before. Store builds stay off until the store rules are checked.
- **Gifts and accounts.** The sheet is a private session, so the donor is a guest on the payment page. The gift joins their app account by email, as before (they sign in to the app with the same email).
- **Still open.** Live payments still need the gateway rates and who pays the gateway charge (platform settings). Not built: Apple Pay and Google Pay buttons, a native card form, and prefilling the donor's email.
- **Not tested.** No real Paystack payment was made. The payment page and webhook were tested with the local test gateway; the in-app sheet was checked in the web preview only (the link it opens). A phone test is still needed.

## Payments go straight to the chosen charity (Yehuda, 13/10/2026)

Replaces the pooled-fund idea from 09/10/2026 (everything collected centrally and sent on by Nadiv Lev). Yehuda chose Paystack split payments: https://paystack.com/docs/payments/split-payments/

- **How.** Each approved charity is registered as a Paystack subaccount (admin "Connect to gateway", which looks up Paystack's bank code from the bank name and refuses a missing or ambiguous match). A donation's checkout names that subaccount: the donation goes into the charity's own bank account, and the flat `transaction_charge` (the donor's optional contribution to Nadiv Lev) stays with our main account.
- **Fee bearer.** `bearer` comes from the platform setting `gatewayChargePaidBy` (charity: "subaccount"; Nadiv Lev: "account"). Undecided (null), so no split payment starts and a real gateway takes no donations.
- **Switch.** `PAYSTACK_SPLITS=yes`. Off, Paystack takes no donations, because without a split the money would land with Nadiv Lev. The test gateway can imitate splitting locally with `TEST_GATEWAY_SPLITS=yes`.
- **Only connected charities take donations** on a real gateway; others show "isn't taking online donations yet".
- **Adapter fixes made at the same time.** "Abandoned" at Paystack now stays pending (the donor may still pay) instead of being recorded as failed. A verify answer about a different payment is refused. A malformed webhook signature header is a plain rejection, not an error.
- **Consequences.** The donor's charity choice is binding. The earlier open questions about pooling (holding funds, redistributing by vote, who uploads certificates) no longer apply.
- **Not verified.** This sandbox cannot reach Paystack, so nothing here has run against it. See the go-live checklist for the test-mode checks. The code was tested with a stubbed network and the local test gateway (a full donation to a connected test charity; an unconnected charity shows "isn't taking online donations yet").

## Monthly giving (13/10/2026)

Built with our own scheduled job, not Paystack's plans and subscriptions. Reason: it keeps the split to the charity (subaccount, flat contribution, fee payer) exactly as for a first payment, and everything can be tested with the local test gateway. Paystack's subscription handling of splits could not be read from this sandbox.

- **Starting.** On the donation form the donor ticks "Give R__ every month" and a second tick-box authorises collecting that amount every month until they cancel (recorded as a `monthly_authorisation` consent against the first donation). The first payment is an ordinary card payment (the checkout is limited to cards, because only a card can be charged again). When it is confirmed, Paystack's reusable card authorisation is kept, encrypted, in `recurring_donations.authorization_encrypted`, which no client can read, not even its owner. A payment method that cannot be charged again keeps the gift but starts no monthly donation, and the donor is told. A failed first payment never starts one.
- **Collecting.** `/api/jobs/monthly-giving` (needs `Authorization: Bearer <CRON_SECRET>`; off without it) is called by a scheduler about hourly. Each month a donor is collected once, at 08:00 Johannesburg time on the day of the month they first gave (29 to 31 fall on the last day of shorter months). Each attempt is a normal donation with a fixed id (monthly donation + month + attempt), so a repeated or crashed run can never charge twice. A payment the gateway has not settled is checked again, never charged again. Every payment still goes through the same confirmation (amount and currency checks, tax year, confirmation email).
- **Receipts.** Each monthly donation carries the donor's s18A details and giving choice (copied from the first), so it joins the donor's annual s18A receipt like any other.
- **Declines.** Up to three attempts in a month: the next day, then three days later. The donor is emailed each time. After the third failure the monthly donation is marked failed, the stored card is destroyed and nothing more is charged. The donor starts a new one to carry on.
- **Pause and cancel.** The app (Giving tab) and the website (`/account`) both pause, resume and cancel, effective at once. Cancelling destroys the stored authorisation. A paused month is never collected later: on resume only the current month is collected.
- **Wording to review (Yosef).** The authorisation tick-box, the monthly lines in the confirmation email and the "could not collect" emails are drafts. The Terms need a section on monthly donations.
- **Not verified.** Nothing here has run against Paystack: the `charge_authorization` request, the reusable authorisation in Paystack's verify answer and the card-only checkout are written from Paystack's published API and stubbed in tests. The full flow (first payment, a collected month, three declines, cancellation) was run locally with the test gateway.
- **Known gaps.** A donor with no account who loses the confirmation email cannot manage a monthly donation on the website (they sign in with the same email). "Download my information" does not yet include monthly donations. Removing a donor must break the loop between a monthly donation and its first donation (first set `first_donation_id` to null).

## Admin tools (13/10/2026)

1. **Erase a donor (POPIA).** On Admin, Privacy requests: for a "delete" request the admin ticks that they checked who is asking, and the person is erased. A second box erases a donor who never had an account, found by the email they gave with (typed twice). One database function (`erase_donor_data`, server only) removes names, contact details, addresses, ID and tax numbers, free-text messages, the private maaser/chomesh/tzedaka choice and confirmation links; stops any monthly donation and destroys the stored card; replaces the donor's email with `erased+<id>@erased.invalid`; strips the customer out of the gateway's raw records (keeping the reference); and clears the address from the rate limiter. **Kept, because tax law requires it:** each donation's amount, date, charity and tax year, and every s18A receipt already issued (which carries the name as printed). The person is emailed first; their sign-in account is deleted last (unless they run the platform or a charity), and the audit log records counts only. An erased donor's unreceipted donations can no longer be given a receipt, because their details are gone (the yearly receipts job skips them). Draft retention wording in the Privacy page still says the period is to be confirmed (Yosef).
2. **Change a charity's bank details** (Admin, charity page, "Change the bank details"; platform admin only, once the charity has applied). Needs the new bank letter to be checked, marks the account verified, takes the charity off the payment gateway until it is connected again with the new account, emails the charity's contact (last four digits only), and logs old and new last four digits.
3. **Payments page** (Admin, Payments): payments pending for over 30 minutes, gateway messages unfinished for over 5 minutes, payments held for a person (amount mismatch, no matching donation), monthly donations (active, paused, stopped, and more than 24 hours late, which means the monthly job is not running), and the last 30 days by charity (donation to the charity, contribution to Nadiv Lev) for comparing with the gateway's settlement report.
4. **Not built:** a refund and chargeback tool (waiting for the refund policy), automatic reconciliation against the gateway's settlement report (needs Paystack access), and erasing someone who runs a charity or the platform (their account must be removed from the charity first).

## Scenario review fixes (13/10/2026)

Three independent read-throughs of the newest code looked for situations not covered. Confirmed and fixed:

- **Erasing an account never finished.** Every real donor has an audit row and an "account" agreement record, and both blocked deleting the sign-in account (migration `20261014000001`). The audit log keeps the bare id (no foreign key; it is append-only). The person's own agreement records are removed before the account. Staff-only "created by" links forget who. The confirmation email now goes out after the erasure, and only when something was erased. An address that has a sign-in account must be erased from that person's own request. Nothing is ever emailed to an `@erased.invalid` address.
- **First monthly payment edge cases.** The set-up is finished (and the confirmation email sent) even when the other confirmation call won the race or the first attempt died halfway. A first payment that looked failed and is then paid still starts the monthly donation. A first payment of a monthly donation that never started is described as a gift, not "your monthly donation".
- **Monthly job.** The donor is re-checked immediately before the card is charged (cancel, pause or erase in the last seconds). An attempt the gateway never received (the run died first) is sent again after 20 minutes under the same reference, which the gateway refuses if it already has it. Rows that keep waiting (charity paused, card unreadable) go to the back of the queue so they cannot crowd out others. Resuming a paused monthly donation waits for the charge day (migration `20261014000002`).
- **Donation form.** The "I authorise" tick resets when the amount changes. A refused new amount no longer wipes what the donor typed (the old quote stays, unpayable until a new amount is accepted). The retry link after a failed in-app payment keeps the way back to the app and the giving choice.
- **Account page and app.** Cancelling a monthly donation on the website asks first; a stopped one can be removed (website and app). The "Give" button ignores a second tap while the page is opening.

**Known and not fixed yet** (smaller, or needing a decision): the donor is not emailed when their charity stops taking payments and a month is skipped; the Payments page counts rows in the app, not in SQL, and shows a window; the account-level details of a kept staff account are not erased; two monthly donations to the same charity are allowed; the form's pill buttons are 34 px high; the app does not show "last attempt declined"; late gateway events for an erased payment are not redacted; confirmation links do not expire.

## Givezy phone app look (13/10/2026)

The business is now called Givezy (G-i-v-e-z-y). Yehuda supplied the logo and chose to match the app to it exactly, plus "a whole new vibe".

- **Colours** were read off the logo (measured from the PDF, so close rather than exact: confirm against the Canva brand kit when it exists). Blue `#1848A8` carries headlines, buttons, links, tabs and selected states. Navy `#102848` is text. Orange `#F88038` is the single bright accent per screen, used for graphics only because it is 2.5:1 on cream (below the 3:1 large text minimum); `#B84A0A` is the orange for small text. Lilac `#CCB3FB` and a pale tint carry soft highlight cards. Cream `#FEFDF7` is the page. Contrast ratios are recorded beside each token.
- **Feel:** Fredoka (rounded, friendly, like the wordmark) for headlines instead of Fraunces; pill buttons with a springy press; 28 px card corners with a soft blue-tinted lift; pill search, filters and segmented controls; a floating rounded tab bar with a blue pill behind the open tab; the logo's splash drops (`splash.tsx`) in place of the old dotted arc and paper grain (both removed).
- **The logo's splash is never redrawn.** Yehuda: the lilac, orange and blue shapes must be exactly the logo's. They are cut straight out of the logo PDF (`assets/logo-splash.png` for all three together, `drop-lilac.png`, `drop-orange.png`, `drop-blue.png` on their own) and every splash or teardrop in the app uses these images (`splash.tsx`). My first hand-drawn version was replaced.
- **Background:** every screen sits on a soft lilac wash fading into cream, with the logo's three shapes very faint (5 to 16 per cent) drifting off the edges, arranged differently per tab (`backdrop.tsx`), floating slowly unless the phone asks for less motion. Charity cards give a little under the finger and spring back.
- **Assets** rebuilt from the PDF: wordmark, wordmark with tagline, app icon (cream "g" and splash on blue), Android adaptive icon (blue background, "g" foreground, monochrome), favicon, splash screen on cream. The app name in `app.json` and all in-app copy now say Givezy.
- **Not changed, on purpose:** the deep link scheme `nedivlev://` (the website's return link uses it) and the `nediv-lev.*` storage keys (renaming would lose saved targets and caches). Bundle ids are unchanged. Change these only together with the website rename.
- **Still on the Nadiv Lev kit:** the website, emails, receipts and PDFs, the Privacy Policy and Terms (legal wording for Yosef). One rename pass for all of them is still to do.
- **Open:** whether to use the logo's exact rounded display font if Yehuda has its name (Fredoka is a close free stand-in); photos in the sample data are remote images that need a network; preview screenshots are in `docs/givezy-app-preview/`. Nothing here has been seen on a real phone or in Expo Go yet.

## Charity journey, less generic (14/10/2026)

Yehuda: the screens felt "very AI"; the background stays, the blocks in front had to feel authentic. Started with the charity journey; the other pages follow once he approves this direction.

- **Charity page** reads like a short magazine story: a tall photo, the name on a cream sheet that overlaps it, the Hebrew name under the English, the first paragraph as a large opening line, then "Where your gift goes". Cause, area and tax receipt sit in a ruled fact sheet instead of badges. Updates are dated notes with a lilac margin line; photos are white-bordered prints with a slight tilt and their caption. A cream bar slides in behind the back and heart buttons once the photo scrolls away. The button names the charity ("Give to ...").
- **Discover** is an editorial list (square photo, name, area in orange text, cause, a quiet "s18A receipt" tick line) divided by hairlines, with no boxes. The featured charity is a cover: its photo with the name set over it and an "In the spotlight" tag. Saved charities are round photos with a lilac ring.
- Sample photos are remote images, so the review screenshots show lilac where photos load on the phone.

## Giving page, less generic (14/10/2026)

- **Top of the page** is one statement, not three boxes: "Maaser · October 2026", the amount given large, a thick progress bar and a plain sentence. Chomesh is a smaller line under it with an orange bar. "Still to give" moved straight under them as a soft lilac strip with a "Find a charity" link (it used to sit below the fold).
- **This year in numbers** is a sentence ("This year you gave R1 040 in 3 donations to 3 charities, R860 of it this month.") and a bar per charity showing its share, instead of four number tiles.
- **Lists** (history, monthly, income, given elsewhere, the s18A split) are ruled like a ledger, without boxes. Each kind of giving keeps one colour everywhere: maaser blue, chomesh orange, general tzedaka lilac, shown as a dot on each donation.
- "Log income" and "Given elsewhere" are outlined buttons (a new secondary button style), so the page has one strong action at a time. No calculations changed.

## Code health check (14/10/2026)

All automated checks pass; two independent reviews of the last two days' code found no critical problems. Fixed:

- **An erased donor's monthly donation could restart** if its first payment had failed and then went through late. Erasure now always records "the donor's information was erased", which nothing can restart (migration `20261014000003`).
- **The monthly job sends a charge again only when the gateway says it never received it** (a typed "not found" from the gateway adapter), never after a timeout or a database error. A donor who stopped gets no attempt row at all.
- **No second confirmation email** when two confirmations of the same first monthly payment race.
- **Erasing an account keeps a charity's signed declarations** (the person is unlinked, the record stays); only their own account agreement is removed. The "has an account" check matches the email exactly.
- **Removing a stopped monthly donation keeps the real reason** (card declined) and asks first.
- **App:** the year summary no longer claims the month is "part of" the year (it can include days before Rosh Hashana); percentages are back beside each charity's bar; long facts on a charity page wrap instead of running off the screen; the featured cover hides initials and placeholder text under its title; the tab background no longer swaps under a charity page; the hidden background on the charity page is gone; the button press respects "reduce motion"; no text below 14 px.
- Tests now check the resume month exactly, month-end clamping, the erasure reason, kept declarations, the "gateway down" case and the no-double-email case.
- Expo packages updated to the latest patch for SDK 57.

**Known and accepted:** the phone app's package audit lists 22 advisories, almost all in build tools (Metro, the Expo command line) that never run on a phone; `braces` and `node-forge` have no fixed version yet. The one in the app itself (`decode-uri-component`, used for links) has its fix only in a new major version that is incompatible with the bundler, so it waits for Expo to update it. The website's audit is clean. Judgement call: the Giving page uses orange for chomesh in the bars and dots, so it has more than one orange accent; that is data colour, not decoration, and was kept on purpose.

## Givezy app: calmer Discover and a lighter charity page (14/10/2026)

- Charity photos keep plain rounded corners (28 for hero photos, 20 for thumbnails), set once as `photoCorners` in `apps/mobile/src/theme/tokens.ts`. A petal-shaped crop was tried and Yehuda did not like it, so it is not used. The rest of the pass stayed.
- Discover: the header is the logo, the day greeting as the headline and the Hebrew date; the "Discover" title and the drifting background shapes are removed. The featured charity sits on the page (no dark gradient) with a Give button that opens the give sheet directly.
- Charity page: the photo is inset on the page with a lilac shape behind it and the name below; gallery and update photos are rounded, not tilted in white frames.
- Give sheet: radio-style pill choices; the button names the choice ("Give as maaser"). Still no default choice.
- Open: seen only with a stand-in image in the web preview; not yet tested on a phone.

## Givezy app: lilac header curve on all four tabs (14/10/2026)

- Yehuda picked option B of three backgrounds (soft colour wash, lilac header curve, big logo shapes). Each tab now opens on a lilac header that ends in a gentle curve with a thin lilac and orange rim (`HeaderCurve` in `apps/mobile/src/components/backdrop.tsx`), then plain cream below. The curve scrolls with the page. The faint drifting shapes are gone from the tabs; the welcome and "How Givezy works" pages keep them.
- On Discover the curve follows the header's height, so it always sits just under the filter chips, with or without "Your charities" or a seasonal card.
- Judgement call: the orange rim was added at Yehuda's request for "some orange". With the header splash that makes two touches of orange per tab, both graphics, never text.
- Open: seen in the web preview only, not on a phone.

## Givezy app: safety net on the tabs (14/10/2026)

- Yehuda reported the Giving tab going blank in Expo Go on iPhone, twice. Not reproduced: the screen draws fully in the web preview and in an iPhone test render (jest-expo, iOS), with no errors, and the preview has no live database, so it runs on sample data.
- Each tab now exports an `ErrorBoundary` (`apps/mobile/src/components/screen-error.tsx`): if a screen fails while drawing it shows "Something went wrong", a "Try again" button and the error's own words, instead of a blank page. Next time it happens, a screenshot shows the cause.
- Open: the cause of the blank Giving page. Whether donors should see the technical error text is on the go-live checklist.

## Taking once-off gifts inside the app (14/10/2026)

Yehuda decided donors can give inside the app, with the card entered on the payment provider's own page (not website donate pages). Chosen: app screens for amount, giving kind, contribution and donor details; the provider's hosted page in an in-app sheet; once-off gifts first, monthly after; in-app payments stay off in store builds until Apple and Google confirm in writing.

- **Server:** `POST /api/app/quote` and `POST /api/app/checkout` reuse the website's `quoteDonation` and `startDonation`, so the minimums, the s18A rules, the age and privacy confirmations, the rate limit (5 attempts per 10 minutes by address and email), the pending record, the consents and the split to the charity are the same as on the website. A gift is marked paid only when the provider confirms it (webhook, or verification on return). The secret key never leaves the server.
- **Switches, both off by default:** `APP_GIVING=yes` on the server (otherwise both endpoints answer 404) and `EXPO_PUBLIC_IN_APP_GIVING=yes` in the app. With the app switch off, "Give on our website" still opens the browser.
- **App:** `give/[slug]` screen; the give sheet hands over to it when the switch is on. The app sends whole cents, never a card number. A changed total is shown again before anything is charged.
- **Unchanged and still open:** who pays the provider's fee (`gatewayChargePaidBy`), the gateway rates, the first run against Paystack's test mode, and the store rules. Monthly giving in the app is the next step.
- **Store-rule risk, raised once:** Apple's rules may allow in-app donations only for approved nonprofits, possibly per listed charity; Google lists tax-exempt donations as payments outside Play Billing. Yehuda accepted this with the switch off for store builds.

## Who pays Paystack's fee (14/10/2026)

Yehuda: the charity pays Paystack's fee, out of its donation. Later we offer the donor the choice to cover the processing fee. `gatewayChargePaidBy` is now `"charity"`, so split payments can start (Paystack bearer = the charity's subaccount).

- **Open, not built:** the donor-covers option. It needs Paystack's rate sheet (percentage, fixed amount, whether it includes VAT) in `src/config/platform.ts`; those stay empty until Yehuda supplies them, and nothing is estimated. Open question for him: when the donor covers it, is the charity to receive the full gift exactly, with the donor paying the extra, and should the receipt show the gift only?
- Real payments still need the first Paystack test run and the store rules (see go-live checklist).

## Monthly giving inside the app (14/10/2026)

- The give screen has "Give every month". It uses the same server path as the website's monthly gifts (`startDonation`): the first payment is month one, the card is saved by the payment provider, and the monthly record stays pending until that payment is confirmed. The donor ticks an authorisation that names the exact total (gift plus any contribution), which is recorded as a consent. A contribution to Givezy repeats each month with the gift.
- Pausing and cancelling stay in Account, as before. The monthly job, retries and emails are unchanged.
- Yehuda confirmed (14/10/2026): when a donor covers the processing fee, the charity receives the full gift and the donor pays the extra; the s18A receipt shows the gift only. Still not built: it waits for Paystack's rate sheet.

## Giving first: the Give button (15/10/2026)

Yehuda wants giving to be the first thing the app offers. A big round Give button sits in the middle of the tab bar, raised above it, on every tab: the logo's splash (all three shapes) on white inside a blue ring, so each colour shows (Yehuda: the logo, not a heart). It opens "Who would you like to give to?": a search, "Give again" (charities the donor gave to before, most recent first), "Your charities" (saved ones not already shown), then all charities. Choosing one goes straight to the usual give step for that charity, with "Another charity" to go back. The middle tab is a button, not a page; a link to it lands on Discover.

## One branch for the app (15/10/2026)

- Two sessions were publishing the phone app to the same Expo preview channel from different branches, so each publish wiped the other's work. From now on `milestone-1-foundation` is the app's branch: build on it and publish only from it.
- Combined on 15/10/2026 (Give button and charity picker, plus the header curve, inset photos and Try again screens, plus the new Receipts and Account) and published as update group 4931e23a-9078-45d6-9ac7-2cb9517ccaa3.
- Receipts: a "tax year so far" card (this tax year's paid s18A gifts) and each issued receipt as a slip with Download and Share. Account: initials, name and email, Giving and Receipts as tiles, then settings.

## Website renamed to Givezy, with the Givezy look (15/10/2026)

- The company is Givezy (Yehuda, 15/10/2026). The website, payment page, emails, receipts, monthly authorisation, Privacy Policy and Terms say Givezy. The registered company name and number are still empty in `src/config/legal.ts` until Yehuda supplies them.
- The website, receipt PDFs and the receipt email take the app's look: cream, navy text, Givezy blue for headlines, buttons and links, orange accent, lilac highlights, Fredoka headlines, Heebo for Hebrew, the Givezy logo and icon. Receipts and emails read colours from `src/lib/brand-colors.ts` (they cannot use CSS variables).
- Kept on purpose: the app's return link `nedivlev://`, its storage keys `nediv-lev.*`, test account emails, internal identifiers (`nediv_lev` fee bearer value, package names, local database name) and old database history files.

## Annual tax pack (15/10/2026)

- `/account/tax-pack/[year]`: every paid donation in the tax year (1 March to the end of February, Johannesburg time), split into s18A and other, by charity, maaser/chomesh/tzedaka totals (private to the donor), and the s18A receipts issued. Donations only, not contributions to Givezy. Clearly marked as a summary, not a tax receipt.
- "Save as PDF" uses the browser's print dialog instead of making PDFs on the server, so it works on any hosting; a spreadsheet (CSV) download sits beside it. Linked from the website account page and the app's Receipts tab.

## Dedications (15/10/2026, approved by Yehuda)

- A donor may give "in honour of" or "in memory of" someone (name up to 80 characters). The note to the charity is the donation's existing message. Stored on the donation (and on a monthly donation, copied to each month).
- Seen by the donor (thank-you page, confirmation email, tax pack, data download) and the charity (donation page and export). Never on the s18A receipt. Wiped with the donor's other information when they ask for erasure.
- Database change `20261015000001_dedications.sql`, not yet run on any database (the sandbox cannot reach one; see the go-live checklist).

## Code review of the whole stack (15/10/2026)

Four independent read-only reviews (money, security and privacy, receipts and tax, the phone app), each finding checked against the code before fixing. Fixes so far:
- **Monthly giving:** collects for the month a charge belongs to (a retry or pending check after midnight on the 1st no longer counts as next month, never a catch-up); a charge the gateway refuses outright counts as a failed attempt; a payment without the charity's account is refused when splits are on; gateway calls time out; a stopped monthly donation can only be removed, and resuming needs a card (migration `20261015000002`). The decline email tells donors to cancel the old monthly donation before starting a new one (two monthly donations to one charity can be deliberate, so nothing is cancelled automatically).
- **Return page:** limited provider checks per visitor; after about a minute, a clear "I didn't pay: try again".
- **Charities see no part of a donor's ID or tax number** (Yehuda, 15/10/2026, until Yosef confirms what a charity must hold): receipts are read through `charity_receipts` and `charity_receipt_donations`; the receipt PDF is for the donor and platform admins only (migration `20261015000003`).
- **Shared donor records:** full ID and tax numbers are no longer copied onto the donor record (each donation keeps its own, for its receipt) and old copies are cleared; the data download shows last 4 digits only, includes monthly donations, reads every donation, and fails rather than handing over a partial file.
- **Security:** sessions started with a password are refused (website and database), an unconfirmed account cannot be made a charity admin, browsers can no longer change a charity's status or approval fields (submitting goes through the server with its declarations), the unused income table is closed to clients, new database functions are not public by default (migration `20261015000004`).
- **Erasure** also deletes the person's income log, giving elsewhere, notes, saved charities and maaser settings when their account has to stay, and clears payment references.
- **Charity photos** are re-encoded on upload, so no GPS position or other hidden details reach the public site.

