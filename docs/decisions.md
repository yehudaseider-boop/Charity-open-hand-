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
