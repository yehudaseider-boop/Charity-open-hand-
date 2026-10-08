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
- **Not built yet:** emailing the receipt (needs the email provider), the donor's Receipts
  tab on the website, charity and admin screens, void and re-issue screen, full ID number
  printing (needs the attorney's answer first).

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
- This is for the donor's own records only. It is not on receipts and charities
  don't need it.

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

## Charity dashboard (08/10/2026, first part)

- **Day one, decided by Yehuda:** Overview and Donations. Donors, receipts, exports, monthly
  donations, payouts and campaigns screens come later.
- **Team:** every charity admin is added and removed by the platform admin. No Team screen.
- **Owner and admin see the same dashboard.**
- **Two-step sign-in is required** for the dashboard (an authenticator app, Supabase TOTP).
  It is enforced in the database too: charity admins see donations, monthly donations and
  receipts only with a two-step session (`aal2`). Turn on TOTP MFA in the hosted Supabase
  project's Auth settings before release (local `config.toml` already has it on).
  Application and profile pages still open with the emailed link alone.
- **Platform admins need two-step too (08/10/2026).** `is_platform_admin()` is true only for a
  two-step session, so with the emailed link alone a platform admin has no admin powers in the
  database, and every `/admin` page and action sends them to `/two-step` first.
- **Two-step page** is `/two-step`, shared by charity and platform admins. At most 5 code
  attempts per 15 minutes per account and per network address. Supabase itself refuses to
  add a second authenticator app from a one-step session, so a stolen sign-in email alone
  can't be used to get past the second step (tested).
- **Sign-in return address:** only a path on this site; a backslash or control character
  is refused, because browsers treat "/\\evil.example" as another site (`src/lib/safe-path.ts`).
- **What a charity sees:** charity admins no longer read the `donations`, `donors` or
  `donation_checkout_details` tables directly. They read the `charity_donations` view: the
  donation, its status, the message, the anonymous flag and the donor details typed at
  checkout, with ID and tax numbers as last 4 digits only. Never `giving_kind`, encrypted
  numbers, the donor's account link, date of birth or the gateway reference. Tested in
  `tests/charity-dashboard-db.test.ts`, including a second charity's admin and direct queries.
- **Anonymous:** the dashboard says what the checkout says: the name doesn't appear on public
  pages, campaign lists or live totals, and the charity still sees the details.
- **Figures:** amounts are the donation only, never the processing fee. Totals count paid
  donations; refunded and charged-back ones are shown separately and left out. Months and
  dates are Johannesburg time. "Donors" counts each donor identity once per tax year.
- **Donor search** is kept in a 30-minute cookie for that page, not in the address, so names
  and emails stay out of browser history and server logs. Other filters are in the address.
- **Open:** how a charity admin who loses their phone gets their two-step reset (for now the
  platform admin deletes the factor in Supabase). A donor screen showing their own
  `giving_kind` will need to read it as the donor (allowed) or through the server.
