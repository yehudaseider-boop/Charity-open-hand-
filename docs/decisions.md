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

- **Yearly s18A receipts run from the website with two approvals (21/10/2026, Yehuda):** still one
  receipt per donor, per charity, per tax year, after the year closes. The charity sees its list on
  its receipts page (donor, number of gifts, amount, total) and approves it; Givezy signs it off in
  Admin, s18A receipts; then the receipts are issued, their PDFs made and emailed. What the charity
  approved is fingerprinted (`receipt_runs.plan_fingerprint`): if the list changes before sign-off
  (a refund, a late payment), nothing is issued and it goes back to the charity. The charity can take
  its approval back until Givezy signs off (Undo for 30 minutes, then "Take back my approval"); Givezy
  can send a list back with a reason the charity sees. "Finish" only makes missing PDFs and sends
  unsent emails, never a new receipt. The command-line script no longer issues receipts (dry run,
  preview and `--finish` only). Still behind `RECEIPTS_ENABLED` and `RECEIPT_WORDING_CONFIRMED`.
- **Angel Network needs (21/10/2026, Yehuda):** gifts are tracked per appeal (campaign) including
  WhatsApp links, and each gift will also record its source (WhatsApp, QR poster, website, app);
  each donor's running total for the year shows to the charity (donor page, to build) and the donor
  (tax pack, built); gifts from Heroes with Halos, their existing monthly programme, are imported and
  go on the same yearly receipt so donors get one receipt; messages to donors are email only for now
  (WhatsApp sending waits for a provider and its price); IT3(d) waits for the SARS layout.

- **Gifts a charity records itself (21/10/2026, Yehuda):** EFT, cash, a debit order or another
  programme (Heroes with Halos), typed in on Donations, Record a gift, or imported from a CSV file
  (Donations, Import from a file: checked first, nothing saved until Import, with the charity's
  confirmation that it may share the donors' details and won't issue its own receipt). Stored as donations
  with gateway `recorded`: no fee, no contribution, never counted in Givezy's comparison with the payment
  provider. They count in the charity's totals and donor history and go on the donor's one yearly s18A
  receipt. An amount or date that could be read two ways ("1,250", a file where every date could be
  month/day) is refused or flagged, never guessed. The same gift twice is caught by the bank reference, or
  by email, amount and date. A recorded gift can be removed (Undo for 30 minutes, then Remove) until it is
  on an s18A receipt, issued or withdrawn; the database enforces this.

- **Deposits (21/10/2026, Juan of the Angel Network, Yehuda):** the payment provider pays each charity in
  one deposit a day with its fees taken off. A daily job keeps each payout and its lines as the provider
  reports them (`payouts`, `payout_lines`, server-only), and the charity's Deposits page shows each gift, its
  fee and what reached the bank, totalling to the bank deposit. The provider's fee figures are used as
  given; our own gift amount is used for the Gift column (the s18A receipt is always for the full gift).
  A line or deposit that doesn't add up is shown as such, never smoothed over.

- **Donor care (21/10/2026, Yehuda, chunk 3):** each donor has a page on the charity dashboard (Donors, their
  name) with their giving, gifts, the charity's own tags, follow-up reminders and notes. Donors can be filtered
  by tag and a filtered list (group, tag, search) saved under a name. Each charity chooses after how many days
  without a gift a donor counts as lapsed (30 to 730, default 180). Follow-ups due today or earlier show on the
  overview's to-do list. All of it is the charity's own (server-only tables, about donors who gave to it), is
  never shown to donors, and is removed with an erased donor. Notes say on the form that donors can ask what
  is held about them.

- **Who gave to each appeal, and where gifts came from (21/10/2026, Yehuda, chunk 4):** every gift started on
  Givezy now keeps where it came from: the website, the app, a WhatsApp share, a copied link or the QR poster.
  Shared links carry `?src=` (whatsapp, link or qr); the charity page and the donate page pass it on, the
  server keeps only those three values (anything else counts as the website), and a gift from the app always
  counts as the app. "Try again" after a declined card keeps it, and each month of a monthly donation counts
  where it was set up. Gifts before 21/10/2026 show "Not known". The QR poster's code and the dashboard's own
  share links (overview, and "Share this campaign" on Campaigns) are tagged; the app's WhatsApp shares too.
  Posters printed before this carry no tag, so their gifts show as the website: reprint to count them.
  Donations can be filtered by campaign and by source (with a donor count), the CSV has Campaign and Came
  from columns, each campaign has "See who gave", and each donor page shows the largest gift and their giving
  by campaign and by source. No database change was needed (the column came with chunk 2).

- **Recorded gifts count in a campaign's public total (21/10/2026, Yehuda):** an EFT or cash gift the charity
  records against a campaign counts in the "raised" figure donors see, like a gift made on Givezy. (It already did;
  now there is a test for it.)

- **Owner and admin (21/10/2026, Yehuda, chunk 5):** only a charity's owner adds or removes people (Team), sets the
  bank account, and emails donors. Admins do everything else. A Givezy platform admin counts as an owner. An owner
  can't remove another owner, and the only owner can't remove themselves (ask Givezy). Adding someone gives them a
  Givezy sign-in if they have none and emails them; Undo takes the access back within 30 minutes.

- **Emailing donors (21/10/2026, Yehuda, chunk 5):** the owner writes news or an appeal on Email donors and Givezy
  sends it from its own address, replies going to the charity. It goes to all donors, a donor group, a tag, a saved
  list, or the people who gave to a campaign. POPIA direct marketing to a charity's own donors: every email has a
  stop link for that charity, and the checkout (website and app) has "Don't send me news or appeals from this
  charity". Someone who stopped thank-yous from charities is left out too. At most 4 emails in 30 days from one
  charity to one donor, and 5 sends a day per charity. Donors whose only gifts were recorded by the charity (EFT,
  cash, an import) are left out until Yosef confirms the import confirmation covers it. Sending is resumable and
  never emails anyone twice; "Send the rest" carries on after a long send. Wording is a draft.

- **Excel and Xero (21/10/2026, Yehuda, chunk 5):** donations, donors and deposits download as Excel as well as CSV
  (amounts are real numbers; phone and ID numbers stay text; nothing typed can run as a formula), written without a
  library. "For Xero" on Deposits is Xero's bank statement import layout for a clearing account: per deposit, the
  donations in, card fees out and the deposit out to the bank, adding up to zero.

- **Cause of the week (22/10/2026, from Alza of Feed a Child):** Givezy's admin picks one approved charity for each
  week, Monday to Sunday on the Johannesburg calendar (Admin, Cause of the week, up to 8 weeks ahead). The app
  shows it at the top of Discover. A week with no pick shows no card: nothing is chosen automatically, and a
  charity that stops being approved drops out at once.

- **Yearly s18A list, draft for SARS (22/10/2026, Yehuda):** per charity and tax year, every issued receipt with the
  donor, address, number of gifts and amount, a total, and what SARS will want that is missing (no address, no ID
  or tax number, no registration number). Givezy's version (Admin, s18A receipts) shows the last 4 digits of the ID
  and tax numbers as printed on the receipt; the charity's (Receipts) only says whether one is on file. CSV and
  Excel. It is a list to check before the IT3(d) submission, not the SARS file: that waits on the SARS layout, and
  will need the full numbers decrypted on the server.

- **Updates by email, cause of the week on the website, the Givezy banner (22/10/2026, Yehuda):** each update on
  Photos and updates has "Email this to your donors" for the owner, which opens Email donors with the update's
  words and a link to the charity's page (same rules: stop link, 4 a month, the owner sends). The website's home
  page shows this week's cause of the week under the top block, when one is chosen. When Givezy opens a charity's
  dashboard it isn't part of, every page says so, since what it saves there is real.

- **Impact per gift, in the charity's own numbers (22/10/2026, Yehuda chose it):** a charity can set one
  figure on its public profile: what one thing costs and what it is called (for example R12, "school
  breakfast", "school breakfasts"). Donors then see "Your R360 pays for 30 school breakfasts" while they
  choose an amount (website and app), on the thank-you page, and the charity page shows the figure. The
  count is always rounded down, nothing shows below one, and the charity's name is always on the figure
  ("Figure from PSFA: R12 pays for one school breakfast"). Givezy never supplies or estimates a figure:
  all three fields empty means nothing is shown. The overview and annual report show "Your donors paid
  for about N ... this tax year". Stored as `impact_unit_cents`, `impact_unit_one`, `impact_unit_many`
  (all or none, R1 to R100 000, 60 characters), migration `20261022000003_charity_impact_unit.sql`.

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
  `npm run receipts -- 2027` (dry run), `-- 2027 --preview=./out` (DRAFT PDFs), `-- 2027 --finish` (since 21/10/2026 receipts are issued from the website, see above).
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

### Givezy v2 design (16/10/2026, Yehuda)

- New colours and fonts across the app, website, emails and receipt PDFs: blue #1749B5 (headlines, buttons, tabs, colour-block sections, white text on it), deep navy #092577 (headlines on light grounds, body on lilac, the pressed edge of buttons), orange #FF914D (one call to action per screen, splashes, goal rings, streaks; navy text on it, never white), lavender #C9B4FA, light purple #E5D9FF, pale lilac #F2ECFF and peach #FFEBDD (splashes only), slate #34466A for secondary text, white pages. Fredoka 600 headlines, DM Sans body (Inter and Fraunces removed from the app), Heebo for Hebrew. The receipt PDF still uses Inter until it is redone.
- Tabs are now Home, Discover, Give, Progress (the old Giving tab) and Account. Receipts moved inside Account.
- Welcome and onboarding: blue welcome, then causes, a named goal (Giving goal by default; Maaser, Tithe or the donor's own name are options) and how giving is kept safe. The headline is "Give in a few taps" (changed 16/10/2026: a returning donor needs about four taps, so "two taps" overpromised). The card wording says the payment partner keeps the card for monthly gifts only, because that is the only case where it does.
- Google and Apple sign-in are built but hidden (`EXPO_PUBLIC_SOCIAL_SIGN_IN=yes` shows them) until they are set up in Supabase and Apple's and Google's consoles. Email code sign-in works meanwhile.
- Charities can write a one-line impact line ("Your impact line", `charities.impact_en`, migration `20261016000009_charity_impact_line.sql`). The app shows it on the charity page, the give screen and after a gift. Sample data uses bracketed placeholders; live, the line is left out until the charity writes one. We never write impact figures for a charity.
- Give screen: "Count this gift towards my goal?" shows only when the main goal counts certain labels; Yes puts that goal's label on the gift. A goal that counts all giving just says every gift counts. Starting amounts when the donor hasn't given to that charity before are R100, R250 and R500 (suggestions only; any amount works).
- "Cover the card fee" is not shown until the payment provider's rates are in `src/config/platform.ts`.
- The trust line "Every charity checked by us" stays only while that check really happens before listing.
- Saved card for once-off gifts (16/10/2026, built, off): a donor can keep one card (the payment partner's reusable token, encrypted; we also keep its brand, last four digits and expiry) and then pay any charity from the give screen without typing the card. Only for a signed-in donor giving with their account's own email; never with a monthly gift (those are set up on the payment page). "Save my card for next time" is a tick on a once-off gift; the card is kept once that payment is confirmed. The donor removes it in Account at once, and erasing their information or deleting their account removes it too. Two switches, both off: `SAVED_CARDS=yes` (server) and `EXPO_PUBLIC_SAVED_CARDS=yes` (app). A saved-card charge is only a first indication; it counts as paid when the provider confirms it. If the provider refuses it, the gift ends as failed and the donor is offered the payment page. After a timeout or outage the gift stays pending (the charge may have gone through), so a second charge never follows. Go-live items are on the checklist.
- Charity dashboard in the v2 look (16/10/2026): blue colour-block header with the charity name and the tabs, wider layout on desktop, stat tiles, orange campaign bars and a monthly bar chart. No change to what charities can see or do.

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
- **Receipts:** references print every digit past 9 999 (they repeated before; migration `20261015000005`); the receipts job lists any donor record given more than one receipt by one charity in a year (different ID or tax numbers typed) for a person to check, warns about s18A payments from the last days of the year still pending, and refuses to email without `SITE_URL`.
- **Tax pack:** for a closed year it shows what is on issued s18A receipts (not only what was asked for), per donation and in total.
- **Lists read in full:** charity donor list and receipts page read every row (the database answers 1 000 at a time); admin receipts has a search.
- **Dedication names:** invisible direction-changing characters are removed and names show in their own direction (Hebrew right to left).
- **App:** account reloads are keyed to the signed-in person; the Giving tab waits for its data instead of flashing the signed-out view; dates and times follow Johannesburg time wherever the phone is; Expo patch updates applied.
- **In-app giving confirmed** (Yehuda, 15/10/2026): the give screen stays, with donors typing the amount and their details in the app and paying on the provider's page. `EXPO_PUBLIC_IN_APP_GIVING=yes` is set in the Expo preview environment. It has no effect until the website is deployed and `EXPO_PUBLIC_SITE_URL` (app) and `APP_GIVING=yes` (server) are set; until then the button falls back to the website. Store builds stay off until Apple and Google confirm in writing.
- Not changed: a receipted donation that is later refunded plus a late donation would make the receipts job show a database error instead of a "needs attention" line. Nothing can refund a donation yet; handle it with the refunds decision.


## Monthly donations for charities (16/10/2026)

- New "Monthly" tab in the charity dashboard (`/charity-admin/[id]/monthly`), and a "Monthly donations" card on the overview. Yehuda asked for it after the portal update.
- Shows each monthly donor: name and contact as typed at their latest payment, amount a month, the collection day, next date, payments so far and their total, s18A requested, anonymous publicly, any dedication, and the state: running, card declined and being retried, paused by the donor, stopped (card declined every time) or cancelled. Filter by state and search by name or email.
- Read only. Donors pause, restart and cancel themselves; charities can't change a monthly donation.
- Read through `charity_monthly_list` (migration `20261016000001`), never the raw rows: no card details, gateway references, the donor's contribution to Givezy, their maaser/chomesh/tzedaka choice or the stored end reason. Like donations, a monthly donation shows only once a payment from it has gone through.
- Database tests now run in the sandbox against a local Postgres with a stand-in for Supabase's auth and storage schemas: all 132 pass, including migrations `20261015000002` to `20261016000001`. Five older tests were updated to the stricter rules from the code review (a charity can't change its own status from the browser; resuming needs a card).
- Not checked in a browser: the page needs a live Supabase.

## Fewer taps to give (15/10/2026)

Inspired by Givelify's "three taps". Yehuda: as few taps as possible, so the gift goes through.

- **One screen, no review step.** The button shows the exact total ("Give R500", "Give R500 every month") and goes straight to the payment page. The server still re-checks the total and the minimums and refuses if anything changed.
- **One-tap amounts from the donor's own history only:** the last amount given to this charity, then other recent amounts, at most three. We never suggest a figure of our own. New donors type the amount.
- **What it counts as** starts from the donor's last gift to that charity.
- **Remember my details on this phone** (off unless the donor turns it on): name, email and phone in the phone's secure storage, per signed-in person. Never ID or tax numbers. Next time the screen shows "Giving as ..." with Change.
- **One tick instead of two:** "I am 18 or older, I agree to the Terms and Privacy Policy, and that Givezy records this donation." It sets both confirmations the server requires. **For Yosef to approve** (the website still shows two ticks).
- The Give button and the tick are pinned to the bottom of the screen.
- In the design preview (no live data) the give screen is always used, so the flow can be tried; it stops before payment with a note. Live builds still follow the in-app giving switches.

## Campaigns with a goal (16/10/2026)

From Givelify's "virtual envelopes". Built on the `campaigns` table that was in the schema from the start (no screens until now).

- **Charity side (website):** a Campaigns tab. Start one with a name, what it's for, a goal in Rand (required) and an optional last day; end it with one button. Up to 3 running at once (the database enforces it). Started and ended campaigns are in the audit log.
- **Donor side (app):** the charity page shows each running campaign under the story: raised so far, the goal, a bar, number of gifts and the last day, with "Give to this campaign". The give screen shows the campaign at the top.
- **Money:** a campaign gift is an ordinary donation to the charity, labelled with the campaign. The total counts paid gifts only (never the contribution to Givezy); refunded and charged-back gifts drop out. The database refuses a gift for another charity's campaign. The server refuses an ended campaign (status or past its last day) before recording anything.
- **Once-off only:** campaign gifts can't be monthly (a monthly gift would outlive the campaign). Give monthly to the charity itself.
- Drafts stay private; the public sees active and ended campaigns of approved charities only.
- Website (16/10/2026): running campaigns show on the charity's public page with their goal bar, and "Give to this campaign" opens the website's giving page for that campaign (once-off; the monthly option is hidden). An ended or unknown campaign falls back to a normal gift with a note. This matters because in-app giving stays off in store builds, so the website is where campaign gifts happen at launch.
- Not yet: campaigns on the app's Discover screen.

## Insights for charities (16/10/2026)

From Givelify's analytics, kept to plain counts a small charity can act on. On the charity's dashboard:

- **Your donors:** new donors this month and donors who gave before and came back this month; the share of all their donors who have given more than once; the average gift this tax year (whole cents, rounded half up, no floats).
- **Campaigns:** each running campaign with raised, goal and bar, and a link to start or manage them.
- Paid donations only; the contribution to Givezy is never included. Only the charity's own admins (and platform admins) can read these figures (database function `charity_insights`). Monthly donors are on the existing Monthly donations card, so they aren't repeated.

## Charity sign-up (16/10/2026)

Yehuda chose this over the Paystack test run as the next step: without charities there is nothing to give to. Built:

- **Emails at each step** (draft wording, `src/lib/charity/emails.ts`): "we have your application" to the charity on submit, "new application" to `ADMIN_NOTIFY_EMAIL`, "approved" with four next steps (and an honest line about s18A when the charity can't issue receipts yet), and "needs a change" with the admin's reason and a link back. A failed email never blocks or undoes the action.
- **Guided application:** one step at a time (organisation, address, contact, bank, documents, submit) with a progress bar, steps as links with ticks, Back and Next ("Skip for now" on an unfinished step), and a list of what's missing on the submit step. Same forms and rules as before.
- **Getting started** on the charity dashboard after approval, until all done: connected for online donations (we do this), cover photo, story, first update, first campaign, plus their public link with a Copy button.
- **For charities page** (`/for-charities`, draft copy): free to list, straight to your bank (the provider's card fee comes off each donation, no figure until the rates are confirmed), s18A receipts done for you, monthly donors, campaigns, dashboard; how to join; what you'll need. Linked from the home page, the header (larger screens) and the footer.
- **Invitations:** a platform admin enters a charity's name and contact email under Admin, Charities; the charity gets a link that works once for 30 days and starts the application with the name filled in. Only a hash of the link is stored; the table is readable by platform admins only and written by the server only. The list shows Sent, Started (linked) or Expired.

## QR poster for charities (16/10/2026)

Each approved charity has a printable A4 poster under its dashboard (QR poster): its name, a large QR code to its Givezy page, "Point your phone camera here to give", the short web address, the s18A line when it applies, and the Givezy logo. Print, or "Save as PDF" in the print window for a print shop; the QR code alone downloads as an SVG. The code is navy on white with medium error correction. Library: `qrcode` 1.5.4 (MIT). In the same change, `sharp` (which cleans uploaded photos) went from 0.35.4 to 0.35.5 for a security advisory in its SVG library.

## Donation emails to charities (16/10/2026)

Until now only the donor got an email when a gift was paid. Now the charity's contact email also gets one: "Meals Fund received R180 on Givezy", saying whether it was monthly and which campaign it was for, with links to the Donations page and to switch these emails off. It shows the gift only: never the donor's name, email or the contribution to Givezy, so a forwarded email or a shared inbox leaks nothing about who gave. The charity sees donor details on its dashboard as before. On by default; the switch is on the charity's Profile page ("Emails"), saved in `charity_private.notify_donations`. It is sent only after the payment provider confirms the gift, after the donor's email, and a failed email never affects the donation.

## Platform admin controls after approval (16/10/2026)

From the charity-side review. On Admin, Charities, each charity:

- **Remove access** for a charity admin (a volunteer who left). Their sign-in stays, as a donor; the charity's donors, donations and exports close to them at once. Logged, and they are emailed.
- **Reset second step** when someone loses the phone with their authenticator app. The admin first checks it is really them (a call to a number we already have), writes how in a note that is logged, and the person is emailed. An admin can't reset their own.
- **Set up s18A receipts later**, for a charity approved without them: add the SARS letter and signed mandate it sent us under Documents (the charity can't add documents once it has applied), enter the reference, and confirm, with the same checks as at approval. The charity is emailed when receipts are set up.
- **Paused charities are told:** suspending emails the contact the reason; their dashboard says the page is paused, what that means (hidden, no donations, monthly gifts not collected, history kept) and how to reach us. Reinstating emails them too.
- **Approval marks the bank details verified** (the admin checks the bank letter as part of vetting), and **connecting to the payment provider emails the charity** that it can take donations, as the approval email promises.
- The charity's mandate signing date is checked against today in Johannesburg, not UTC.

No support email address exists yet: `supportEmail` in `src/config/legal.ts` is empty until Yehuda chooses one (go-live checklist).

## Charity dashboard details (16/10/2026)

From the charity-side review:

- **Campaigns past their last day count as ended** everywhere: they leave "Running now", free one of the 3 places (database rule too), and show "Ended on dd/mm/yyyy". The button that ends a campaign says "End", not a red "Remove".
- **Donations CSV is paid donations only by default**, so the bookkeeper's total is income received; "Every status" is a separate link. The Reference column is the `NL-` reference donors see, and there is a Tax year column.
- **The contact person can be changed after applying** (it was locked with the rest). When the email changes, the old address is told.
- **Renaming, or a new logo or cover, after approval** is allowed but logged, and emails `ADMIN_NOTIFY_EMAIL` to check it still matches the organisation that was vetted. Yehuda can tighten this to "needs review" later.
- **What goes public on approval** (name, pictures, story, updates, campaigns) is shown on the review page, so it is checked with the application.
- **Search** on Donations, Donors and Monthly keeps emails and names as typed (dots, apostrophes), quoted safely in the database filter.
- **Erased donors** show as "Erased at the donor's request", with no placeholder address on screen, in exports or as an email link.
- Wording: Givezy (not the charity) issues s18A receipts; the tax year line reads properly; the dashboard says the provider's card fee comes off before the money reaches the bank; "contact us" points to the support contact.

## Thank-you emails (16/10/2026)

Yehuda chose this as the next build: a thank-you is the biggest reason donors give again. On the charity's new "Thank donors" tab (also linked from "Your donors" on the dashboard), the charity writes up to 1 000 characters for one of the last three months, and Givezy emails it to everyone who gave that month (paid gifts only), once per address, opening "Dear <first name>,". Draft wording.

- The charity never sees or downloads addresses for this; nothing about amounts or other donors is in the email.
- One thank-you per charity per month of donations (database rule), so donors aren't flooded.
- Each email has a link to stop thank-you emails from all charities. The link asks first (so an email scanner opening it changes nothing). Opt-outs and links are kept as hashes of the address, readable only by the server. Erased donors are never emailed.
- Sent one by one from the server: fine for small charities; a charity with thousands of donors in a month would need a queue (not built).
- Privacy Policy draft updated; Yosef to confirm (go-live checklist).

## Bookkeeper filters on Donations (16/10/2026)

The Donations page takes a period: any time, this month, last month, this tax year, last tax year, or the charity's own dates (Johannesburg calendar days, both ends included, by the day the payment went through). A totals line shows what was received for everything the filters match (not just the page on screen), with refunds and chargebacks shown separately and not counted. The CSV download uses exactly the same filters (period, status, search), so the file matches the screen; with "All" it is paid donations only, "Every status" gives the rest. The file name carries the dates.

## Faster repeat giving (16/10/2026)

- **"Use my SA ID number ending 1234"** for signed-in donors, on the website's giving page and the app's give screen, when the charity can issue s18A receipts. The number comes from the encrypted copy kept with the donor's last s18A gift and is filled in on the server: only the last four digits ever reach the browser or the phone. It works only with the account's own email address (the receipt goes there), and "A different number" is one tap away. The app proves who is signed in by sending its sign-in token to our server only; password sign-ins are refused, as on the website.
- **Message to the charity** in the app (optional, up to 500 characters), as on the website.
- Signed-in donors on the website get their email filled in.

## Share on WhatsApp, and Raising now on Discover (16/10/2026)

- **Share on WhatsApp:** a share button by the heart on every charity page, and "Share on WhatsApp" on each campaign card. It opens WhatsApp with a short message ready ("Northcliff Meals Fund is raising for Pesach parcels. R31 400 of R50 000 raised so far. Give here: <link>"), falling back to the phone's share sheet. Links go to the charity's page, or the campaign's giving page, on our website. The website now gives those pages link previews (name, a line about the work, the cover photo, else the Givezy logo), which WhatsApp shows in the chat. Sharing waits until the website address is set in the app.
- **Raising now:** a row of running campaigns at the top of Discover (when not searching or filtering), each with its charity, goal and bar, the closest to its goal first. Tapping opens the charity. If campaigns fail to load, Discover still works without the row.

## Givezy is for everyone; Jewish touches are a switch (16/10/2026)

Yehuda decided the app should not be geared towards Jews only. Step 1 of 4:

- **Neutral by default.** The app greets with "Good morning / afternoon / evening" and today's date. The Hebrew date, Shabbos and Yom Tov greetings, the week-ahead lines, seasonal prompts and Hebrew charity names show only with **Account, Preferences, "Jewish calendar and maaser"** switched on. That setting is kept on the phone only and never sent to our server, because it reveals religion (special personal information under POPIA).
- General wording on the welcome screens, sign-in, How Givezy works, the website (tagline "Give to the causes you care about, simply."), the For charities page, emails and the charity dashboard's examples.
- Sample charities and causes for the preview are general (food, education, health, animals, faith communities). New cause icons for animals and the environment; churches, mosques and temples get the place-of-worship icon.
- The test database now has general causes (food and welfare, children and youth, education, health, animals, faith communities, elderly care, disability, housing, environment, disaster relief, arts and culture). The live database needs the same list (go-live checklist).

Next: own labels instead of maaser/chomesh/tzedaka (step 2), a giving goal as a % of income or a fixed amount (step 3), big photo cards on Discover (step 4).

## Own labels and giving goals (16/10/2026)

Steps 2 and 3 of making Givezy for everyone:

- **Labels instead of maaser / chomesh / tzedaka.** Each gift can carry the donor's own label ("Work giving", "Family"), optional and private to them, on the website's giving page, the app's give screen, the website hand-off sheet and "given elsewhere". One tap on a label used before; with the Jewish switch on, Maaser, Chomesh and Tzedaka are offered too. Old choices became labels ("Maaser", "Chomesh", "Tzedaka"); older app versions that still send the fixed choice keep working. Database: `label` columns on `donation_giving_kinds` and `external_giving_entries` (migration `20261016000008_giving_labels.sql`, applied to the test project). The tax pack totals by label.
- **Giving goals replace the maaser target.** Up to three goals, each a set amount ("R12 000 a year") or a share of income ("10%", which is maaser), per month or per year (the SARS tax year; Rosh Hashana to Rosh Hashana with the Jewish switch on), counting all giving or only gifts with chosen labels. A share of income uses the income log, still kept on the phone only. Maaser and Chomesh are ready-made goals with the Jewish switch on, never the default. Goals stay on the phone; anyone's old maaser/chomesh targets carry over as goals.
- The Giving tab shows each goal's progress and about how much a month is left; "This tax year in numbers" totals by label.

## Full review and charity insights (16/10/2026)

Yehuda asked for a check of the whole product and a charity dashboard with proper insight. Six reviews ran side by side (payments, sign-in and database, charity side, app, receipts and privacy, and research on what Givelify, Tithe.ly, Pushpay, Donorbox and Givebutter show charities). Fixed in this round:

- **A wrong or changed payment key is an outage, not a declined card.** Before, any 4xx answer from the provider counted as "declined": a rotated key would have stopped every monthly donor due that week, wiped their cards and sent them three decline emails. Now only 400, 402 and 422 count as a refusal, and after a refusal the monthly job asks the provider what it recorded before counting a failed attempt.
- **A password session sees and changes nothing.** Someone could register a donor's email with a password before the donor signs up; once the donor signed in with a code, the password opened their profile, notes, favourites, goal records and consents. One restrictive policy per table now refuses password sessions, pausing or cancelling a monthly donation refuses them too, and so does "Download my information". New database functions are no longer callable by signed-in users by default, and the s18A approval columns can only be set by the server.
- **A saved card is never charged twice for one gift.** The app sends one id per give attempt; asking again (a lost answer, a second tap) returns the first answer. The id must match the same charity, email and total. A second tap in the same moment is also stopped on the phone.

**Insights on the charity overview** (from the research; no benchmarks or invented figures, only the charity's own data):

- This month next to last month, the tax year, what monthly donors bring in every month, and all donors with the all-time total.
- **Needs you this week:** new donors to thank, monthly donations declined and being retried, stopped or cancelled in the last 30 days (with the Rand a month lost), paused in the last 30 days, donors who haven't given in 6 months, campaigns ending within a week, refunds and chargebacks. Each line links to where the charity can act.
- **Your donors** in four groups, each a link to the filtered Donors list: New (first gift in the last 30 days, like Givelify's four weeks), Coming back (more than once, in the last 6 months), Gave once (in the last 6 months), Lapsed (nothing in 6 months). Yehuda confirmed 6 months (16/10/2026); Pushpay uses 120 days and Givelify 12 months.
- **Your biggest supporters:** the top five by all-time total.
- **Donations by month:** the last 12 calendar months (empty months shown as empty, not skipped), each bar split into monthly and once-off, this month outlined.

Second round of fixes from the same review (16/10/2026):

- **Thank-you emails:** a send that fails before anything goes out hands the month back, so the charity can try again. Thanking the current month warns that people who give later that month won't get it.
- **Admin Payments page** reads every row page by page (it stopped at 1 000 before, so totals were too low).
- **Charity side:** the Donations empty state is right when a period filter is on; the QR poster uses the v2 navy from the brand colours; the admin receipt search keeps apostrophes and dots; an erased donor reads the same on Monthly as everywhere else.
- **Download my information** now includes the details typed at each checkout and the donor details as printed on their s18A receipts.
- **Monthly collections:** if copying the donor's details onto a month's attempt fails, the attempt is removed and made afresh next run, never charged without them.
- **s18A receipts:** the job refuses a receipt missing the donor's or charity's address (it is listed as failed, to fix and re-run). Receipt emails say "s18A receipt". Receipts use DM Sans like the website (Inter removed).
- **App:** goals set as a share of income show their real target on Home and after a gift, and only count gifts the goal applies to; the small Give button on charity cards is reachable with a screen reader; "First gift on Givezy" shows only when we know it is true; sign-in buttons never stay greyed out after an error; the give screen and the app start never load forever; Home explains when goals can't be opened; income and "given elsewhere" dates use Johannesburg's date; the last hard-coded colours moved into the theme tokens.
- Not changed: the admin "erase a donor with no account" form still clears what was typed on a mistake (platform team only, minor).

**Website in the v2 look** (16/10/2026, same review): the home page, a charity's public page and the giving page now match the app and the dashboard. Home opens on a blue block with orange and lavender splashes, a white Fredoka headline and one orange "Find a charity" button with the pressable navy edge. The charity page has a blue splash block when there is no cover photo, the charity's impact line as "Your rand at work", and an orange "Give to {charity}" button. The giving page has the amount on a pale lilac card with a large amount box, and the final Pay button is the screen's one orange button. A `.pressable` style (solid navy edge that sinks when pressed) is in `globals.css`. Checked at 375px and desktop width.

## Each charity chooses its suggested amounts (16/10/2026)

Yehuda: "let the charity choose" (instead of the R100, R250 and R500 starter amounts the app had, which were never confirmed). On its Profile page a charity can set up to three amounts (each at least the minimum donation, no repeats, shown smallest first), saved in `charities.suggested_amounts_cents` (migration `20261016000014`). The give screens show one-tap amounts in this order: the donor's own recent amounts first, then the charity's, three at most (`src/lib/charity/suggested-amounts.ts`, shared with the app). Givezy never suggests a figure of its own: a new donor at a charity that set none types the amount. The website's giving page shows the charity's amounts as buttons that fill in the amount box.

**Vercel production branch** (16/10/2026): Yehuda wasn't sure, so the recommendation stands: keep the test site deploying from `milestone-1-foundation` until launch, so `main` is untouched; switch it to `main` as a launch step (go-live checklist).

## Group challenges built, then removed (16/10/2026)

Yehuda's "giving with friends" idea was built as group challenges (a supporter starts one for a charity, friends give, one ring shows how full it is) and then removed the same day: "keep it simple for now and see if people adopt this app." Nothing was ever given to one. The code is in the history (commit `d3cc3fd`) and the mock-up is at https://claude.ai/artifact/95hrbcacj9nfNJoqf3Y8uR, so it can come back once there are real donors to test it with. The database part was added (`20261016000015`) and taken out again (`20261016000016`).

## Refunds and chargebacks (16/10/2026, built over Shabbos)

Before, a refund or dispute at the payment provider left the donation "paid", so it kept counting in the charity's totals, campaign progress and the donor's s18A receipt. Now:

- **A full refund** (the gateway's refund event for the whole amount the donor paid) marks the donation refunded by itself. It then drops out of everything that counts paid donations.
- **Everything else is held for a person** on Admin, Payments ("Held for a person"): a partial refund, a refund without an amount, a refund we can't match to a donation, and every dispute (opened or resolved). Each donation item has "Mark refunded" and "Mark charged back" buttons (with a confirmation, logged), to use after checking the gateway's dashboard. Disputes never change a donation by themselves, because who won is not yet confirmed from Paystack's messages.
- **s18A receipts:** if a refunded or charged-back donation is on an issued receipt, the receipt is listed there to void and re-issue.
- Paystack's exact field names for refund and dispute events are not published in a form we could verify; the adapter reads the likely ones and anything unrecognised is held, never acted on. Checked in the Paystack test run (step 9).

## s18A receipts ask for the donor's address (16/10/2026, built over Shabbos)

Section 18A(2) asks for the donor's name and address on the receipt, and the receipt job already refuses a receipt without it. So ticking "I want an s18A receipt" now also asks for the address (street, optional unit or suburb, city or town, 4-digit postal code), on the website and in the app. A signed-in donor using "my ID ending 1234" can leave it empty: the server uses the address from that same earlier s18A gift, never sent to the phone. No address is asked for when no receipt is wanted.

## 17/10/2026: Donor "giving so far" and impact on the website thank-you
- The app's Progress tab already had the giving goal ring and this tax year's totals by charity. It now lets the donor switch to an earlier tax year or "All time" (totals by charity, s18A split and labels follow the choice).
- The website's thank-you page now shows the charity's impact line ("What your gift does") once the payment is confirmed and the donor's details are shown, like the app's thank-you screen. Left out when the charity hasn't written one.

## 17/10/2026: Full security and bug review (six independent reviewers, every finding verified)

Yehuda: "check all code and fix any bugs and make sure we are 100% safe and secure". Six read-only reviewers covered the database, money and payments, sign-in and admin, receipts and email, the phone app, and the public website and API. No critical findings. Everything confirmed against the code was fixed the same day; the rest is on the go-live list with a reason.

**Fixed**
- **A session started with a password could still reach a charity's donors through the dashboard functions and the CSV exports** if it had added its own authenticator (two reviewers found this independently). The 16/10 rule lived on tables only; the dashboard reads through functions that check `is_charity_admin`, which checked the second step alone. `has_second_step()` now also requires the emailed-code sign-in, so every function, view and policy built on it inherits the rule (migration `20261017000001`). The exports and the second-step pages start from the viewer too, and a password session can no longer record "agreed" or enrol an authenticator. Ten wrong second-step codes in 15 minutes now wait.
- **A charged-back first payment did not stop the monthly donation.** It now cancels it and drops the card (each further collection would be another chargeback); an opened dispute pauses it until a person has looked. A refund leaves it running (a goodwill refund is not a dispute). A refund in another currency is never matched by its number alone.
- **Sign-in link sending** was limited per address only: a script could send thousands of Givezy emails to different addresses. Now also limited per visitor.
- **A missing `SITE_URL` in production** fell back to the browser's own address for sign-in links; it now fails instead.
- **The test gateway** is refused outright wherever `VERCEL_ENV=production`, so no switch can open it on the live site.
- **The thank-you page** asked the payment provider about a payment for anyone who knew the donation id (ids are not secret). Only the donor's own visit (with the credential from their payment link) does now; everyone else sees the saved state, which the webhook keeps right. Outcome checks are limited per donation instead of per shared address (a shul's Wi-Fi no longer blocks other donors).
- **Receipts were marked "emailed" even when nothing went out** (the console transport on a local run, or an erased address). The transport now says whether it sent, and only a real send marks the receipt. A receipt with a refunded or charged-back gift on it is never emailed as it stands.
- **`EMAIL_ALLOWLIST`** for test sites: email goes only to listed addresses or domains, so a test checkout can never email a real donor.
- **Phone app, saved-card path (switched off):** after a lost reply, a changed amount could have become a second charge; the app now keeps the attempt id until the screen closes. A saved-card charge still pending is no longer shown as sent with the goal ring and streak advanced; the app asks a few more times and otherwise keeps the form. A crafted link could make the live app show a sample "gift arrived"; preview only now. The app refuses a non-https site address for its own API.
- **One largest gift, R1 000 000**, in `src/config/platform.ts` and enforced where the website and app both price a gift (the website had no ceiling; the app had its own).
- **Database:** donors can no longer write the encrypted ID columns from the browser (the server never reads them from there); `authenticated` loses insert and delete on charities, charity admins and categories (policies already refused, privileges now do too); the suggested-amounts check refuses a null element and has a ceiling; a processed donation can never be deleted and no link can be added to an issued receipt, by anyone, server included.
- **Smaller:** a donation left on a gateway that is no longer active is held for a person instead of failing the webhook forever; an unreadable payment date from the gateway no longer breaks confirmation; a charity's thank-you body loses control and direction-override characters; email subjects are one line; `form-action 'self'` in the CSP; a `robots.txt` keeping sign-in, admin and confirmation pages out of search engines.

**Not changed, with the reason**
- The CSP still allows inline scripts. Moving to nonces touches every page and Next's own scripts; there is no script injection point today (every piece of user text renders as text). Later list.
- Browser uploads to the charity's own storage folder skip the server's image cleaning. The bucket limits size and type; the server actions already clean what they upload. Later list.
- Charity documents open inline from their signed link rather than downloading. Different origin from Givezy; later list.
- Audit rows and used invitations keep an admin's email after an erasure (platform admins only). On the privacy list for Yosef.
- The phone app's third sign-in or pause tap in the same instant: harmless (the second call fails or repeats), left as is.

**Checked and clean:** webhook signatures (constant-time, raw body), idempotency, no floats anywhere in money, no XSS sinks, no secrets in either bundle, no service-role use from client code, every table under row-level security, tax-year boundaries at Johannesburg midnight, receipt numbering under concurrent runs, per-user storage in the app after switching accounts.

## 17/10/2026: The charity dashboard fills itself, no CRM

Yehuda (after a chat about charity CRMs): add only what Givezy can fill with its own data; small SA charities won't leave their spreadsheets, but they will use a dashboard that fills itself. Skip volunteers, case management, events and full email marketing.

Most of the "at launch" list was already built: the donor list (name, contact, total, number of gifts, last gift, s18A and "anonymous publicly"), the donor journey (new, coming back, gave once, lapsed after 6 months), income this month against last month with monthly and once-off split, and CSV exports of donors and donations. Added now:
- **"Gives monthly" / "Monthly paused"** on each donor in the list.
- **"Who has a receipt"** on the s18A receipts page: per tax year, how many donors asked for an s18A receipt, how many have one, and the amount still to be receipted. The running tax year says when its receipts come.

Settled the same day (Yehuda):
- **No fee line on the income summary.** "We haven't decided on a fee." The 3% in the suggestion was not a decision. Nothing shows a fee until Givezy's fee (if any) and the payment provider's rates are decided and in `src/config/platform.ts`.
- **No paid tier.** Campaigns and impact updates stay free for every charity.

## 18/10/2026: The dashboard's core flow: what just happened, take it back, what next

Yehuda: "We need to make our core flow: what just happened, they can take it back, what to do next." Charity dashboard first (his choice); the app follows once he has felt it.

- After every dashboard action a panel at the top of that page says **what just happened** in plain words ("'Winter food parcels' is live. Donors can give to it now."), offers **Undo** for 30 minutes, and gives **one next step** as the page's orange button ("Next: post an update about it"). All the words live in `src/lib/charity/done.ts`.
- Undo covers all 17 undoable actions: profile, logo and cover, donation emails, starting and ending a campaign, posting and removing updates and photos, every registration step including bank details, and uploading and removing documents. Undo never overwrites newer work (if it was changed again since, it says so and keeps the newer version), never removes a campaign someone has given to (end it instead), runs once even if tapped twice, and never touches registration details once the application is submitted.
- **The two that can't be taken back ask first, on the page** (Yehuda's choice: ask first, then no undo): sending the monthly thank-you email and submitting the registration. The check says plainly that it can't be taken back. The phone's own "Are you sure?" pop-ups are gone from the dashboard: removals use Undo instead.
- Each action is kept in `charity_actions` (migration `20261018000001`, server-only, 30 days) so the panel and Undo work across page loads.
- Removed or replaced files are kept so Undo can put them back; cleaning them up later is on the go-live list.

## 18/10/2026: Evidence of quality: designing the moments when things go wrong

Yehuda asked to apply five rules: design the un-glamorous moments (status, undo, recovery), keep flows consistent, recover well from failures (a way to reach a person), test by breaking things (Wi-Fi off, empty data), and design empty and error states. Three testers broke the app, the website's donate path and the charity dashboard on purpose; every finding was checked and fixed:

- **A lost connection or a server error never throws a form away.** The donate page, the dashboard forms and the app's give screen keep everything typed, say plainly whether anything was charged ("Nothing was charged"), and offer the way on. A declined card says why it usually happens, keeps the amount for the retry, and from the app goes back to the app.
- **All the problems at once, and the page takes you to the first.** The donate form shows every field to fix in one go, in plain words ("Postal codes are 4 digits", not the library's own wording), and scrolls to the first one. Same on the dashboard and in the app.
- **The R1 000 000 typo guard now applies on the website too** (the app already had it). Zero reads as below the minimum. "1,250" is refused with a plain message, on purpose: SA uses the comma as the decimal mark, so 1,250 could mean R1.25.
- **Unticking the s18A box keeps the ID and address** (and the dedication name) in case the donor ticks it again; hidden fields are never sent.
- **A person to reach** on every failure screen (see the support email on the go-live list).
- App: a server-down screen with "Try again" and "Give on our website", undo for removals and pauses on the Progress tab, "Get help" on Account, honest "Waiting for the payment provider" while a gift confirms, no ticks or streaks until it is paid.
- Dashboard: "Saving…"-style button words while working, the first wrong field focused, an error page that keeps the tabs, and the done panel only on the page and day it belongs to.

**Left for later:** the app's charity list doesn't yet open offline (the giving history does); the test payment page can be pressed twice with the back button (test-only, the real confirmation already ignores a repeat); the CSP nonce (as before).

## 18/10/2026: The dashboard reads as one product

Yehuda asked for the consistency rule on the charity dashboard. Changes:
- **Tabs and page headings match.** Every page's heading is its tab's name ("Overview", "Application", not the charity's name, which is already in the blue header). Tabs now read "Monthly donations" and "s18A receipts" like their pages; "Registration" became "Application", the word every message already used. "Registration number" and "registration certificate" stay: they are the company's own documents.
- **"Donation", never "gift", on the dashboard** (campaign counts, donor groups, the profile hint). The app keeps "gift" for a donor's own giving.
- **Empty lists all say "No … yet. They appear here once …"**, and a search or filter that finds nothing says "No … match your search or filters" with a "Clear the search and filters" link, on donations, donors and monthly donations alike.
- **One main button**: blue with the solid navy edge underneath (the brand's pressable button), on every form, search, error page and the poster's print button.
- **Same words for the same moment**: "Please keep it to … characters or fewer" everywhere (website and dashboard), "Back to your overview" and "Back to your public profile", "Download … (CSV)".

## 18/10/2026: The donor app reads as one product, and failures are looked after

Yehuda asked for the quality rules on the donor app (un-glamorous moments, consistency across flows, service recovery, test and break). A tester broke every screen at 390px and 320px wide; every finding was checked and fixed:

- **Undo you can see.** One floating bar just above the tab bar, wherever you've scrolled to, for every action that can be taken back: removing income, giving elsewhere or a goal, pausing a monthly donation, and now also logging income and giving elsewhere ("Logged R50 given to School fun run. Undo"). Pausing offers "Undo" like everything else.
- **Every "Give" button does the same thing.** With giving in the app off (store builds), Home and Progress now open the charity's give sheet like Discover and the charity page do, instead of a screen saying giving "isn't on yet".
- **Waiting for the payment provider has its own button.** If we haven't heard back, the button becomes "Check again" (with "Last checked at 14:05") instead of inviting a second gift, plus "I didn't pay: start again". A way to reach a person shows on every problem on the give screen.
- **The thank-you screen counts only the gift** towards the goal ("Gift sent · R180 to Northcliff Meals Fund", "and R20 to Givezy"); a monthly donation says "Monthly donation set up · R180 a month".
- **Same words everywhere**: "Tax year 2027 so far" and "Tax year 2026" on every screen; "R500 a month"; the Progress tab named Progress everywhere; "s18A receipts" in the info button; the s18A promise now says to ask for one when you give (it's opt-in). Bad amounts get the same message in every box, including "1,250", and no box takes a 14-digit number.
- **Edge cases**: a page that doesn't exist shows a calm "We couldn't find that page" with "Go to Home"; goal amounts step down a size on narrow phones instead of breaking; small links are 44px tall; the give sheet's search has "Clear search"; "Send a new code" confirms it was sent.
- The sample-data version (what Expo Go shows without a live server) behaves like the live one: cancelling asks first, pausing has Undo.

**Left as is:** goal and log amounts have no upper limit beyond the length of the box (11 characters); a cap would be a new platform value, so it waits for Yehuda if he wants one.

## 18/10/2026: Charities can thank one donor personally

Yehuda chose three new dashboard features (weekly email to the charity, annual report, thank one donor), built in that order starting with this one; emails to lapsed or campaign donors stay off until consent wording has had a legal look.

- **"Say thank you"** on each donor's row (Donors page, live charities only): a short message, up to 1 000 characters. Givezy sends it in the charity's name: the donor's first name (or a company's contact person) above it, "From [charity]" below, and **replies go to the charity's contact email**. The monthly thank-you to everyone now also replies to the charity's contact email.
- It **asks first** ("An email can't be called back once it's sent"), then shows what happened on the page. There is no undo, like the monthly thank-you.
- **At most once a week per donor** (Monday to Sunday, Johannesburg time), so no donor is flooded; the row says "Last thanked personally on dd/mm/yyyy". Never to erased donors, or to anyone who used "stop thank-you emails" (the row says so). Each email carries that stop link.
- Kept in `charity_donor_thanks` (migration `20261018000002`, server-only).

## 18/10/2026: Annual report for the board or AGM

New "Annual report" tab on the dashboard: one SARS tax year on one page, filled from Givezy's own records. Raised (paid donations only, with the average), donors (new this year against those who gave before), the monthly and once-off split, month by month with the best month, each campaign's total, s18A receipts (who asked, who has one, what is still to be receipted) and, apart, anything refunded or reversed. A running year says "so far" and shows months still to come as such. "Save as PDF" uses the browser's print, which hides the dashboard's header and tabs; "Download the figures (CSV)" gives the same numbers with no donor details. The footnote says gifts made outside Givezy are not included.

## 18/10/2026: Full review of everything built since 17/10 (four independent reviewers, every finding verified)

Yehuda asked for a check of all code. Four reviewers (security and database, money and receipts, the phone app, the dashboard and website) worked independently; each finding was read in the code before anything changed. Nothing critical was found; the website's packages have no known vulnerabilities; all automated checks pass.

**Fixed**
- **Saved-card double charge (app, high; the feature is still switched off).** When a saved-card charge got no reply, the donor could switch to "A different card", or to monthly, or change the email, and start a second donation around the unresolved one. Now the gift is held exactly as it was sent until the server says paid or declined: the card choice and the monthly switch are locked, and if the amount or email was changed the form is put back with "We're still checking your earlier gift of R… from your saved card". The "close this screen and try again" advice (which dropped the only guard) is gone.
- **"Check again" thanks the donor for what was paid**, not for whatever is in the form by then (the summary is snapshotted when the payment goes unsettled).
- **A refunded donation no longer says "We're confirming your payment, don't pay again" forever.** Website and app now show "This donation was refunded, so nothing is owed on it."
- **Raw technical text on four dashboard forms** ("Invalid input: expected string, received undefined") when the postal code, bank account number, branch code, campaign name or campaign goal was left empty. Each now says what is missing, and a test covers every dashboard form.
- **Personal thank-yous capped at 20 an hour per charity**, so a charity account can't be used to mass-mail donors in Givezy's name. A send that was skipped (email not switched on, or an address off the test allow-list) is now reported as not sent instead of "went to Sarah", for the monthly thank-you too.
- **Erasing a donor** now also removes the charity's personal thank-yous to them and their name from the dashboard's "what just happened" rows.
- **Annual report:** the two shares always add to 100%; "new donor" follows the same rule as the Overview (first paid gift); the average uses the shared integer helper.
- **Monthly donation amounts** in the app and on the website account page showed gift plus contribution as one figure ("R190 a month") while the charity saw R180. Now "R180 a month (+ R10 to Givezy)".
- **Undo of a new campaign** was refused when a donor had merely opened and closed the payment page; only real donations block it now. Undo of a profile save now notices newer category changes. Files kept for Undo are removed when the 30-day rows are purged. The confirm step sends what is in the form at the moment of "Yes".
- **Donate page:** with "use my ID ending 1234", a typo elsewhere no longer demands the address the page said could be left empty. Dedication names are 80 characters everywhere. The app accepts a R1 000 000 gift with a contribution.
- Smaller: the Donations page sends an out-of-range page number back to page 1; the app's charity list offline copy reaches every screen (and revives its dates); remembered donor details are forgotten on sign-out; the account's email fills in when the give screen opened before the account loaded; "A different card" and the monthly switch can't be flipped mid-attempt; redirect parameters go through the same path check as everywhere else; "s18A receipt" everywhere; "Donations" not "Gifts" on the dashboard.

**Known and left, with the reason**
- The phone app's build tooling carries three known vulnerable packages (braces, decode-uri-component, node-forge) through Expo 57. Only decode-uri-component ships in the app itself (URL parsing in Expo Router), and the worst case is a hang from a crafted link. Fixing them means an Expo upgrade; on the go-live list.
- A receipt that needs re-issuing after a refund still counts as "has one" on the Receipts tab until an admin voids it. Cosmetic; noted.
- Undo's "changed since" check is read-then-write, not atomic: only a same-second edit by another admin could slip past. Acceptable.

## 19/10/2026: Hardening review (five independent reviewers, every finding verified)

No new features. Fixed: payment notifications keep no card code or customer details; the contribution
has the same R1 000 000 ceiling as the gift; test refunds apply on their own; a payment on a retired
provider is held in Admin, Payments; the app never shows a thank-you when it got no answer about a
payment (it offers "Check again"), and the server says "couldn't check" instead of "still confirming";
sheets ask before throwing away typed details and stay open while saving; a broken campaign link gives to
the charity; the monthly thank-you can no longer use up a month with nothing sent; out-of-range donor
pages show the last page; the donations redirect keeps custom dates; South African phone numbers keep
their 0 in CSV downloads; Undo says "removed since" correctly; a saved-ID problem at checkout is shown
in words; a spaced ID number fits the box; names and address lines are kept to one line; the data
download includes agreements given with gifts and charities' personal thank-you notes. Open decisions
went to the go-live checklist (sign-in lockout, second-step live check, shared emails in the download).

## 20/10/2026: First open is "small yes first": give first, set a goal afterwards

Decided by Yehuda. New first-open flow in the app: welcome, then two skippable questions ("What kind of
giver are you?", "Which causes matter to you?"), then straight to Discover with the chosen causes' charities
first (nothing hidden). The goal question left first open. After a first confirmed gift the gift-sent
screen shows the charity's own impact line (or a plain thank-you; never invented) and, once ever, "Make it a
habit" with "Set my goal" and "Maybe later". Set my goal opens the normal goal editor (neutral name, maaser
only as an optional preset when the Jewish switch is on), and the progress shows the first gift already
counted. Maybe later goes to Home, where a gentle goal card can be dismissed (a flag on the phone; no
repeat pop-ups). Goals count the tax year, 1 March to the end of February, to match s18A receipts.
Existing donors who finished first open see none of the new questions; with no goal they get only the Home
card. Sign-up is not forced before the questions: giving still works without an account, and a donor who
hasn't signed in is shown "Sign in with the email you gave with" so their gifts count towards the goal.
The three "kept safe" points moved from first open to the give screen, shown on a first gift.
"Kind of giver" is stored on the phone first and copied to the account's profile the first time they are
signed in (never over an answer already there). Database: `20261020000002_giver_type.sql` (column plus its
own-row update grant). New personal data: Privacy Policy line for Yosef (go-live checklist).
Known limit: the goal invitation only appears on the gift-sent screen of a gift confirmed straight away;
if the payment provider is still catching up, only the Home card is offered.

## 20/10/2026: A shorter give screen in the app (first gift in as few taps as possible)

Yehuda found a first gift took too long. The main form is now: amount, name, email, then an optional
Givezy contribution switch (off by default), the s18A receipt switch (only for charities that issue
them; the ID and address boxes appear only when it is on), the agreement tick, and Give. Everything else
is in one "More options" block, closed by default: give every month, label, phone, remember my details
(still off by default), give anonymously, a message to the charity, a dedication, and save my card. It
opens by itself when a label is already chosen, and when a problem is inside it. A closed block says what
is switched on. The three "kept safe" points became one line on a first gift (the card is entered on the
payment partner's page; Givezy never sees it or holds the money). Nothing was removed, and the server's
checks are unchanged. The strategy for getting donors to stay (the long game) is still to be decided.

## 21/10/2026: Hierarchy, feedback and signifiers in the donor app

Added from Yehuda's design notes. Hierarchy: Home keeps the goal card first and adds a quieter "at a
glance" row under it (given this tax year, the next monthly donation, s18A receipts), each shown only when
there is something to show and each opening the right tab. Feedback: after a gift the first line says exactly
what happened ("R180 to Northcliff Meals Fund, done"; a monthly one reads "R180 a month to ..., set up").
Signifiers: "Once-off" and "Every month" are two always-visible options with the chosen one filled (replacing
a switch inside More options); an unavailable one (campaign gifts, or while a saved-card payment is
unresolved) is struck through with the reason underneath; the chosen amount button shows a tick, and amount
buttons are dimmed and inert while a payment is being started or held.
## Full code review, second pass (20/10/2026)

Six independent read-only reviews (payments and monthly giving; receipts, tax pack and privacy; the database and row-level security; sign-in, admin and charity actions; the phone app; the website's look, copy and accessibility), every finding checked against the code before anything was changed. Nothing critical; the money core, receipt rules and row-level security held. The database tests run in the sandbox again (plain Postgres with the Supabase stand-in): all 524 tests pass, plus typecheck, lint and a production build. Fixed:

- **Return page after a card payment:** the payment provider adds its own `reference` to our return address, so the key arrived twice and the page showed "Donation not found" even though the payment was recorded and emailed. Taken care of; a refunded donation now says so instead of "not found".
- **Monthly giving:** a charge the provider refuses outright now marks that month's attempt failed (it stayed pending for ever); a payment the provider took for the wrong amount or currency is held for a person once, with the next collection next month, instead of being re-checked and re-logged every hour.
- **Webhook records** no longer keep the card-on-file code (it lives encrypted on the monthly donation only). A confirmation email that could not be sent leaves an audit row to resend from.
- **Rate limits:** checkout is 5 attempts per email and 30 per network address in 10 minutes (one hall on one WiFi is not one donor); the return page is limited per donation; sign-in links per email and per address; a missing address header no longer lumps everyone together.
- **Privacy:** "Download my information" now includes the details typed with each donation and the agreements ticked at checkout (both were server-only tables, so they were missing). Receipts for a donor erased since issue are not counted as emailed. Erasure also clears a campaign answer, and re-running it after the account is gone is not reported as a failure. The audit log records a new charity admin's id, not their email.
- **Receipts:** a "$" in a charity's legal name prints as typed on the receipt statement. The SA ID check now requires the citizenship digit to be 0 or 1. The receipt email says "s18A receipt".
- **Charity admin and platform admin:** charity pages hand their client-side forms only the fields they edit (the whole service-role row, with gateway account and mandate path, was being serialised to the browser). Uploaded pictures are capped at 30 million pixels and 2 400 px a side. The donor CSV export and document links refuse password-started sessions like every page does. Changing a charity's contact email is audited and the old address is told. The mandate signing date is checked against Johannesburg's today. Approving a charity records its bank details as checked, and connecting to the payment provider needs that check. Agreeing to the policy twice records once; setting up an authenticator is audited; the viewer lookup runs once per request.
- **Admin, Payments** reads every paid and monthly row a page at a time (the API answers 1 000 at a time, so totals would have silently stopped there).
- **Database** (`20261020000001_review_fixes.sql`): signed-in users can no longer write ID or tax columns on donor records or the approval columns on charities (the triggers already refused; the grants now agree); a charity's logo and cover must sit in its own folder; an active monthly donation always has a charge day; the legacy fee column is bigint; indexes on the lookups the jobs and dashboards make. `docs/test-site/setup-database.sql` regenerated (it had stopped seven migrations short) and the stale `apply-erase-fix.sql` removed.
- **Website:** private pages (admin, charity dashboard, account, MFA, agree, test gateway, thank-you) are marked not to be indexed, with a `robots.txt`; a root error page in the Givezy voice; the donate page's tab title names the charity; keyboard focus shows on the amount fields; the thank-you and donation pages have a real page heading; checklist states, error messages and new-tab links are announced to screen readers; Hebrew dedication names render right to left in Heebo; "section 18A receipt" became "s18A receipt" in the receipt email.
- **Phone app:** a crafted `nedivlev://…?demo=thanks` link can no longer show a fake thank-you in a store build (preview only); switching accounts without signing out sweeps the previous person's cached giving; closing the payment sheet without paying says so instead of landing on Giving and polling; routes are built from typed params; the "You pay" total is really semibold on Android; tab labels are not remounted on every tab change; the unused Fraunces font dependency is gone; orange is no longer used as text (the area line on charity cards is muted navy) and the scrim colours live in `tokens.ts`.
- **Dependencies:** `sharp` patched (0.35.5). The app's remaining audit items are Expo transitive packages with no non-breaking fix.

Not changed, for Yehuda or Yosef (all on the go-live checklist): the `NL-` reference prefix; a notice to the donor when a receipt is withdrawn, and the tax pack after a refund (both wait on the refunds decision); the Terms sentence about payments never happening in the app; what the iOS Keychain keeps after the app is deleted; the look items (lilac bars on the charity dashboard, the unused orange accent on the website, button radius, more than one orange graphic on the app's Giving tab and Welcome screen).

## 21/10/2026: main (the 20/10 second-pass review) merged into milestone-1-foundation

`main` had two commits this branch lacked: the second-pass review (20/10) and a Vercel build fix (21/10). Both
lines of work had reviewed the same ground, so 35 files clashed. Calls made, so they can be revisited:
- **Phone app:** this branch's design and screens kept throughout (main's app was still the 15/10 look); main's
  typed route params, scrim and tab-icon "made once" ideas were brought in where they still applied.
- **Webhook records:** this branch's version kept (stores only the event, reference, amount, currency and status);
  main only dropped the card code. Main's test expecting card brand and last four digits in the record was dropped.
- **Refunded donation on the return page and status:** this branch's single "reversed" outcome kept; main's
  separate "refunded" and "charged back" labels showed the same card.
- **Return page and checkout rate limits:** this branch's rules (the provider is only asked for a donor holding the
  payment link's credential; only attempts that reach the payment page count) plus main's per-address key that
  ignores an unknown address.
- **Contact-email change notice:** this branch's (a proper notice and an audit row with no email addresses in it);
  main's logged both addresses.
- **Data download:** main's loop for details typed at checkout and agreements ticked kept; this branch's extras
  (giver type, consent times, charities' personal thank-you notes) kept; the duplicate loops removed.
- **Admin, Payments:** this branch's version (held items with their current state, and the 50 000-row cap notice).
- **Receipts:** one fix for a "$" in a charity name (both had it). **Pages:** main's accessibility and noindex
  changes kept; main's noindex list unioned with this branch's.
- **Database:** main's migration is `20261020000001_review_fixes.sql`; this branch's giver-type change was renamed
  `20261020000002_giver_type.sql` so the two version numbers don't clash.
- **Not carried over:** `docs/test-site/setup-database.sql` (main regenerated it before this branch's migrations
  existed); it needs regenerating from the full migration list.

## 22/10/2026: Website design direction A ("Splash"), style guide and home page

- **Direction A chosen (Yehuda, 22/10/2026)** out of three home page directions on the design canvas. The style
  guide for it is on the same canvas (brand, colour with measured contrast, type scale, spacing, buttons, giving
  controls, cards, forms, loading/empty/done/error states, dashboard pieces, icons and voice). No new colours:
  every value is the existing v2 one in `globals.css`, `tokens.ts` and `brand-colors.ts`.
- **Home page rebuilt in that look** (`src/app/page.tsx`): big headline with a sample of the donor's giving page
  beside it, a pale lilac "find a cause" band (real cause chips from the categories table, the real cause of the
  week, the newest approved charities), three steps, a navy "your year of giving" block, "what we check, and what
  we promise", and a last blue call to action. Sample figures are labelled "Sample". The decoration is the logo's
  three drops (`public/brand/`, the same images as the app), never on top of words.
- **Claims on the page are only what the product does today:** charities are checked by a person (documents and
  bank details), card details stay with the payment provider, no Givezy fee (the card provider's fee comes off the
  gift, as decided 14/10/2026), s18A receipts once a year if the donor asks and the charity may issue them, monthly
  gifts the donor can pause or stop, the yearly tax pack. No impact numbers, no "100%".
- **Full width:** the home page runs edge to edge (`full-bleed`, a one-line rule in `globals.css`); every other page
  keeps its narrow column until it is restyled in phase 3. The header and footer are now 1 200 px wide on every page.
- **No charities, no causes, no cause of the week:** each part hides itself; with no charities at all the band says
  the first charities are joining now and links to how charities join.


## 22/10/2026: Donor pages in design direction A (phase 3)

- **Charities page:** a pale lilac band with a big "Find a charity" heading, one search box and cause chips (the
  chosen one solid blue), then a count ("3 charities") and two columns of charity cards. No match says what was
  searched and offers "See all charities"; no charities at all says the first ones are joining now.
- **A charity's page:** wide cover (the charity's photo, or a blue block with two logo drops), logo or initials
  overlapping it, name, badges. On a laptop the give card stays beside the story; on a phone it comes first. The
  give card holds the one orange button and three plain facts (s18A receipt if asked for, or none; no Givezy fee;
  card details stay with the payment provider).
- **Giving page:** same steps and logic as before, only restyled: amount card (suggested amounts as tiles that show
  which one was tapped), "Your gift" total, then "Your details", "A few extras (optional)" and "Before you pay"
  headings, one orange Pay button. Errors stay next to each field with a count above the button.
- **Thank-you and outcome page:** one card for every outcome: the logo's three drops on a paid gift, a red heading
  and "Nothing was charged" with Try again on a declined one, a clock while confirming.
- **Shared parts changed on every page:** form fields (thicker soft border, blue border and ring when focused),
  ticks and radio buttons in Givezy blue, an orange keyboard-focus ring, and the campaign card (orange progress).
- **Not in this phase:** the donor account pages (giving history, monthly gifts, tax pack) and sign-in; they follow
  with the dashboard work or on request.

## 22/10/2026: Donation references start with GZ-

- **Yehuda, 22/10/2026:** references are now `GZ-` plus the first 8 characters of the gift's id (was `NL-`, from
  Nadiv Lev). The reference is not stored; it is worked out each time, so every gift, old or new, shows `GZ-` with the
  same 8 characters on the confirmation page, emails, the charity's donation page, exports and the deposit report.
  Nothing searches by the prefix. Safe because live payments have never been on, so no real donor holds an `NL-` one.

## 22/10/2026: Full review and tidy-up (six independent reviewers, every finding checked before fixing)

Asked by Yehuda: clean up and check everything. Tidy in place (no folder reshuffle, so main and the demo-site
branch still merge); fix the clear findings; bring money rules, legal wording and product behaviour to him.

- **Phone app:** the payment sheet's return link no longer sends Android donors to the Progress tab mid-check
  (`+native-intent`); honest copy on the confirming screen, the goal invite and the Givezy contribution; Give never
  sticks on "Opening…"; v2 splash and icon colours.
- **Website and dashboard:** thank-you page shows the saved state past the check limit; dashboard Try again
  fetches again; crafted filter values can't crash Donations; provider-down and campaign-ended messages give one
  clear next step; the same donor email can't go out twice on a retry; deposit downloads audited and limited;
  people can be added to a team only once the application is sent; erasure also clears names in "what just
  happened"; working state on the remaining plain forms.
- **Money:** a monthly retry first asks about the month's earlier attempts (no double charge when one went through
  late); saved-card charges need the app's attempt id; an unreadable provider date can't stop a monthly donation.
- **Database** (`20261022000002_review_fixes.sql`, waiting for Yehuda's yes): record_gifts matches emails whatever
  the capitals (inside the function the citext operator was out of reach, so imports failed); receipts, donations
  and the audit log can't be emptied; visitors can't see who chose the cause of the week; only the owner may change
  bank details, in the database too.
- **Tidy:** unused code removed; one copy each of `plural`, `firstParam`, `useFieldId` and the drop decoration;
  the old `nediv_lev` fee-bearer value is `givezy`; README rewritten with a "where to find things" map; settings
  examples for the website and the app; CI checks the app too; `docs/test-site/setup-database.sql` rebuilt by
  `scripts/build-setup-sql.sh`; the old dashboard brief archived.
- **Left for later, on purpose:** splitting the biggest files (give screen, Progress tab, admin charity actions,
  checkout) and the wider helper merges (date helpers, Supabase row unwrap, page-through reads, uuid checks, chip
  styles) wait until the demo-site branch has merged, to avoid conflicts. Low items noted on the checklist.


## 22/10/2026: Charity dashboard in design direction A (phase 4)

- **Calmer frame, same parts** (style guide: "the dashboard uses the same parts, calmer"): a pale lilac header band
  with "Givezy for charities", the charity's name, its status (Approved, Waiting for review...) and "See your public
  page" once approved. One small orange drop, no big splashes.
- **The 13 pages are grouped down the side on a laptop:** Giving (Overview, Donations, Monthly donations, Campaigns,
  s18A receipts, Annual report), People (Donors, Thank donors, Email donors, Team), Your page (Public profile, Photos
  and updates), Set-up (Application). On a phone they stay one row that scrolls sideways. Same names as before.
- **Shared card** (dashboard, admin, account): thicker soft border, Fredoka titles. The overview's quick links no
  longer repeat the menu: only "Print a QR poster" and the download stay.
- **Phone width:** every dashboard page was checked for content cut off at the edge (a new check, as the page clips
  sideways scrolling); one real problem (the whole column too wide on phones) was found and fixed.
- **Not changed:** what any page does. Native date boxes on Donations show the phone's own date format; making them
  always dd/mm/yyyy needs typed date fields (noted for later).

## PSFA asks: monthly trend, gifts per donor, Salesforce export (22/10/2026)
From the PSFA intro call (22/10/2026): they want donor frequency, lapsed donors, monthly giving trends, and something that sits alongside their Salesforce rather than replacing it. Lapsed donors, thank-you letters and email to a segment were already in. Three additions, no database change:
- **Monthly giving over time** (Overview and Monthly donations): per month, the monthly donors still giving at its end (today, for this month), their combined monthly amount, and how many began and stopped. Built from each monthly donation's own dates; a donor who is paused now counts as paused from the day they paused (when they resumed isn't recorded). A paused or stopped donor with no recorded date is not counted as giving today, so the latest month matches the summary.
- **Gifts per donor** (Overview, Your donors): all-time donations divided by donors, one decimal.
- **Donors for Salesforce** (Donors page, "For Salesforce"): a CSV with Salesforce's standard Contact field names (First Name, Last Name, Email, Phone, Account Name, Lead Source, Description) so the Data Import Wizard maps every column with no set-up. Last Name is always filled; an organisation's name goes in both Last Name and Account Name. The giving summary goes in Description. Erased donors are left out.
- Open: a "meals funded" line needs PSFA's own cost per meal. Nothing is invented; ask Chantal.

## Way-finding audit (22/10/2026)
Yehuda could not find the way back to the dashboard from the public pages in the PSFA demo, and asked for that class of mistake to be checked everywhere. Three independent reviewers (website and donor account, charity dashboard and admin, phone app) looked for dead ends, wrong destinations, back links to the wrong level, orphan pages and lost filters. Everything confirmed was fixed the same day:
- **Website header**: a signed-in charity admin sees "Dashboard" on every page (straight to their charity, or the list when they manage several); a platform admin with no charity sees "Admin". `src/lib/dashboard-link.ts`.
- **Coming back after sign-in or the second step**: the proxy now passes the requested path and query to each page (`x-givezy-path`, set by the server, never trusted from the browser), and `requireViewer`, `requireSecondStep`, `requirePlatformAdmin` and `loadCharityForManager` send people back there. Before, every emailed deep link (receipts, donations, the application, a charity to review) landed on the overview or the admin home after the authenticator code, and a new applicant was bounced off their own application. `src/lib/current-path.ts`.
- **Dead ends closed**: the agreement page has "Not now, sign me out"; the second-step page has a way back and sends donors who manage nothing on their way; the payment return's "review" state links onward and the paid state links to the account; receipt and data downloads send an expired session to sign in; the poster before approval has a heading and a way back; the overview says when an application was sent back (with the reason) or is under review.
- **Back links keep the list as it was** (donor and donation pages, `src/components/back-link.tsx`); admin receipts tabs keep the search; the donate page's back link keeps the source tag.
- **Phone app**: leaving the give screen by swipe or hardware back now asks first when something typed would be lost, a payment is still being checked, or a saved-card charge is waiting for its reply (the same question the sheets ask). "Maybe later", "Done" after an invite, "Sign in" on the thank-you screen, "Find a charity" on How it works and the not-found page now pop back to the existing tabs (`router.dismissTo`) instead of stacking a second tab bar that the back gesture then revealed. The thank-you screen links to the gift history ("See your giving"). The charity page has a back button while it loads; "Back" on the give screen works when the app was opened cold from a link; Receipts goes back to wherever it was opened from; the first-open questions have a Back control on iPhone, not only Android's hardware button.
- Not changed: a signed-out donor who reopens the payment return page without the credential in the link and taps "Try again" goes to the charities list (rare; the provider's own return keeps the credential). The app's social sign-in return (`auth.tsx`) has the same stacking pattern but social sign-in is off.

## PSFA interactive demo (22/10/2026)
PSFA asked on the intro call to explore the product themselves. The first demo was a static capture of the real pages, so buttons did nothing. Yehuda asked for one that "fully works" and can be uploaded to Netlify and sent to customers, with the graphs interactive.
- **Built as a standalone app** (`demo/psfa-dashboard`), not a capture: plain HTML, CSS and JavaScript, no server. Made-up donors and gifts are generated relative to today; everything a visitor does is kept in their own browser, with a "Reset the demo" button. Nothing is emailed or paid, and the screens say so. Each visitor has their own copy; changes are not shared between visitors.
- **Works**: record and import gifts, thank-yous and email appeals with a sent log, donor notes, tags, follow-ups and saved lists, campaigns, public profile, photo updates, s18A and annual report pages, team, the public page with a give flow (including a declined card), and a donor view where a monthly donation can be paused or cancelled and shows in the dashboard. Interactive charts: hover, press, range, hide a series, keyboard.
- **Checked**: 408 browser checks across three suites (every action, empty and silly data, phone, tablet and desktop widths, blocked storage, odd addresses).
- **Not real**: the payment page is a stand-in, Excel export is CSV only, and the team names (Chantal, Charles) and roles are placeholders from the intro call. A "meals funded" figure is still not shown: it needs PSFA's own cost per meal.

## 22/10/2026: Givezy admin area in design direction A (phase 5)
- **Same calm frame as a charity's dashboard**: a pale lilac band ("Givezy", "Platform admin", "Givezy staff only", "See the public site"), the pages grouped down the side on a laptop (Review: Overview, Charities, Payments, Receipts; Content: Cause of the week; People: Privacy requests) and one scrolling row on a phone, with the current page marked. Wider than the site's reading column so tables have room.
- **Overview**: a blue "Waiting for review" block (the number to act on first), four soft cards for the other pages (Cause of the week added: it was only reachable from the menu), and the charities-by-status card.
- **Headings** on every admin page now use the same title style as the rest of the product.
- **Not changed**: what any admin page does, and its wording. Checked every admin page at 375px and at laptop width for content cut off: none.
- **Still to do in the design plan**: the donor account pages (giving history, monthly donations, tax pack, "Your information") and sign-in (sign-in, agree to the terms, the second step), left over from phase 3.

## 22/10/2026: Donor account and sign-in in design direction A (phase 6)
- **Account** (`/account`): a pale lilac header band with the signed-in email as the title and the person's roles as chips, then soft cards (monthly donations, s18A receipts, tax packs, manage, your information) with the same card and title style as the dashboard. Pause, resume and "Cancel for good" are now real buttons (a soft outline, red for cancel) instead of bare underlined words; cancelling still asks first.
- **Sign-in, agree to the terms, the second step**: one soft card each, title in the product's heading style, thicker field borders, and the one orange pressable button per screen (navy text). What each page does is unchanged, including the "Not now, sign me out" way out on the agreement page.
- **Your information and the tax pack** use the same card and title style.
- **Checked** at 375px and laptop width for content cut off: none. The design plan's six phases are now done (style guide, home, donor pages, dashboard, admin, account and sign-in).
