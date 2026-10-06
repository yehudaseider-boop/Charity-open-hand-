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

## Open (ask Yehuda when reached)

1. Gateway choice and rate sheet (percentage + fixed charge). Fields are empty.
2. Whether the processing fee shown to donors includes VAT once VAT-registered.
3. Platform name, domain, logo and colours.
4. Rounding rule for fees (proposed at milestone 3).
5. Supabase has no South African region; POPIA cross-border transfer for the attorney.
6. Receipting mandate wording (attorney). For now charities upload a signed copy.
7. Bank account verification through the gateway (milestone 3). Until then
   the admin checks the bank confirmation letter by eye.
8. Is "NPO number or PBO number, at least one" the right rule for who may apply?
9. Emails to charities on approval or send-back arrive with the email provider (milestone 4).
10. No screen yet for a platform admin to change an approved charity's bank details.
