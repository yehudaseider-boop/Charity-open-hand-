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
- Charity admins see donor name, contact and address as typed at checkout, and only the last 4 of ID and tax numbers. Anonymous donors are anonymous on public pages only.
- CSV downloads are checked against `is_charity_admin`, rate limited (10 per 10 minutes per person) and audit logged. Cells that start with `=`, `+`, `-` or `@` are neutralised.
- Receipts screen is read-only. Only platform admins withdraw and re-issue receipts.
- Decided by Yehuda (09/10/2026): owners and admins see the same things; no team invites for now (platform team adds charity admins); English only everywhere, no Hebrew version.
- 2FA for charity admins: yes. Authenticator-app code (TOTP) is required once per sign-in before any charity page, action or CSV download (`/mfa`, `src/lib/mfa.ts`). TOTP must be switched on in the live Supabase project (Authentication, Multi-Factor). Platform admins need it too (Yehuda, 09/10/2026), which settles #4.
- Not browser-tested here: the pages need a live Supabase. Verified by build, typecheck, lint and the database tests.

## Donation model and app hand-off (Yehuda, 08/10/2026)

- Name is NEDIV lev everywhere. "Open Hand" is retired.
- No platform fee and no processing fee. Donors may tick a box to add a contribution to NEDIV lev: any amount, minimum R10, unticked by default. Minimum donation stays R30.
- The donation and the contribution are separate line items (`amount_cents`, `contribution_cents`), whether or not the gateway splits payments. Charities never see the contribution.
- OPEN: who pays the gateway's own charge (the charity out of its donation, or NEDIV lev). Real gateways stay closed until decided (`platformConfig.fees.gatewayChargePaidBy`); only the test gateway runs.
- OPEN: which gateway, and whether it splits payments for South African merchants. Both adapters have `splitsPayments: false` until confirmed.
- App Store rule: the app never takes payments. It shows no amount to pay, card fields or pay button. "Give on our website" opens the phone's browser on `/c/[slug]/donate`, carrying the donor's maaser, chomesh or tzedaka choice (`?kind=`). Amount fields for maaser targets and calculators in the app are fine: no money moves.
- The confirmation page shows amount, charity, contribution and reference (`NL-XXXXXXXX`), and a "Back to the NEDIV lev app" link (`nedivlev://giving`; a universal link once we have a domain). In Expo Go the custom link does not open the app; it needs a standalone build.
- Giving history and maaser/chomesh stats come from the server, updated by the webhook. A donor signs into the app with the email they gave with, and every donation under that email appears. (Server side done; app sign-in and live data still to build.)
- NEDIV lev issues the s18A receipts on the charity's behalf, as built.
- s18A details asked: ID number or income tax number only. Address and phone left out until Yehuda confirms what an s18A receipt must show.
- Monthly donations: not built yet; needs the gateway's recurring billing.

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
| A charity admin (with code) | Their own charity; donors who paid them: name, contact, amount, message, 18A yes/no | Fees, NEDIV lev contributions, gateway data, maaser/chomesh choice, any part of ID or tax numbers, other charities, abandoned checkouts |
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

- Website matches the app: logo blue, ink text, soft blue-green page, Archivo font, NEDIV lev logo in the header, app icon as the site icon.
- English only on the website and in the app: Hebrew names and descriptions are no longer asked for or shown (the database columns stay, unused).
- Charity pages: cover, logo (or initials), area, "What they do" and a new "How your donation is used" field the charity fills in (`charities.funds_use_en`, public).
- Home page: welcome, how it works, a few charities, the app.
- Wording: we say "NEDIV lev charges no fee on donations", never "the charity gets your full donation", until it is decided who bears the payment provider's charge.

## Plain-English explanations (09/10/2026)

- Small "i" buttons explain tzedaka, maaser, chomesh, general tzedaka, the Rosh Hashana giving year and s18A receipts, for donors who don't know the terms. One shared text (`src/lib/glossary.ts`) is used by the app and the website.
- The text stays general and sends personal questions (e.g. maaser before or after tax) to the donor's Rabbi. It quotes no tax percentages: "up to a limit set by SARS". Wording is a draft for Yehuda to check.

## Making the app feel like ours (09/10/2026)

- **Jewish calendar:** the app greets by the day (Good Shabbos, Shavua tov, Chag sameach, Shana tova, Gmar chasima tova, Happy Chanukah, Freilichen Purim) and shows the Hebrew date, using diaspora Yom Tov. Seasonal cards in Elul, before Purim (matanos l'evyonim) and before Pesach (maos chitim). The calendar is our own arithmetic, checked against Hebcal for every day from 2020 to 2035. `isQuietTime()` (Shabbos and Yom Tov, from noon the day before) is ready for when the app sends notifications: none are sent then.
- **Thank-you moment:** when a new donation reaches the app, it thanks the donor (amount, charity, date, and whether it counts as maaser, chomesh or tzedaka), with the charity's own short thank-you note if it wrote one (`charities.thank_you_en`, up to 300 characters, set on the charity's profile page, public). Which donations were already shown is kept on the phone (ids only), so a thank-you shows once.
- **Maaser milestone:** when the target is reached the Giving tab says so, with "Tizku l'mitzvos."
- **First-open welcome:** three short screens (what NEDIV lev is, giving happens on our website, an optional maaser target). Skippable, shown once per phone.
- **Small touches:** gentle vibrations on buttons, choices and tabs; soft fades between tabs; animations switched off when the phone asks for less motion; larger text honoured (big headings capped so they still fit); screen-reader labels checked.
- **Offline:** the last giving loaded is kept in the phone's secure storage for the signed-in person, so the app opens straight to it and still shows history without signal ("No connection. Showing what was saved on dd/mm/yyyy at hh:mm."). It is deleted when they sign out.

## Real photos and updates from charities (09/10/2026)

- Charities add up to 12 photos (with an optional caption of up to 120 characters) and post short updates (up to 500 characters, with an optional photo) from a new "Photos and updates" tab in their dashboard. Both are public once the charity is approved, on its website page and in the app.
- They publish straight away; NEDIV lev admins can remove any. Nothing is edited in place: remove and post again. Who posted is kept for us and never shown publicly.
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

- One permanent link for the preview: `exp://u.expo.dev/bb247170-f27b-4771-b143-41f5098c06bc?channel-name=preview`. It follows the "preview" channel (linked to the "preview" branch), so Expo Go loads the newest published update instead of a fixed one. No new QR code per update.

## Everyone has their own records on a shared phone (10/10/2026)

- Yehuda: "everyone must have their own". The income log and maaser/chomesh targets are now kept per signed-in person on the phone; nobody sees anyone else's. Saved charities already live on each person's account.
- Anything set up before signing in goes to the first person who signs in on that phone (and only them), so a new user doesn't lose it.

## OPEN: a pooled-fund model (10/10/2026)

Yehuda described a different flow: NEDIV lev collects the funds, then chooses which charity they go to; that charity sends an s18A certificate, which we (or the charity) upload into the app. To clarify before building (see chat).
