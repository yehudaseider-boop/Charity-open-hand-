# Brief: charity dashboard (written 08/10/2026 for a fresh session)

Read `CLAUDE.md`, `AGENTS.md` and `docs/decisions.md` first. Branch: `milestone-1-foundation`.
Yehuda's wording: "the charity dashboards, so that they can see everything." Voice and
rules: SA English, Rand as `R1 250.00`, dd/mm/yyyy, Johannesburg time, "donation" never "gift",
money is integer cents, no invented fees or rates. Ask before guessing any number.

## Goal

A signed-in charity admin sees everything about their charity's giving, and nothing about
anyone else's. Today a charity can only see "Your charities" with two links (registration
details, public profile). There is no donations screen at all.

## What already exists

- Website: `src/app/charity-admin/` (list page, `[id]/application`, `[id]/profile`). Login is
  an emailed link (`src/app/login`). Roles: `charity_admins` (owner or admin) per charity.
- Data: `donations` (paid, pending, failed, refunded, charged_back; amount, fees, tax_year,
  wants_18a, is_anonymous, message, campaign_id, recurring_id, giving_kind),
  `donation_checkout_details` (donor details as typed, ID and tax numbers encrypted with last 4),
  `donors`, `recurring_donations`, `campaigns` (no screens), `s18a_receipts` and links
  (job built, off: see "s18A receipts job" in decisions.md), `audit_log`, `charity_private`
  (contact and bank, last 4 only).
- Row-level security already lets a charity admin read donations and receipts of their own
  charity (`donations_read`, `receipts_read`, `donor_gave_to_my_charity`). Money writes are
  server-only (service role). Every table has RLS.
- Tests: `npm test` (vitest). Database tests need the local Supabase; `tests/receipts-db.test.ts`
  builds its own fixtures. Two older files (`rls`, `donations-db`) need `npm run db:reset` seed data.

## Must fix as part of this work (found, not yet fixed)

1. **`giving_kind` is the donor's private record** (maaser, chomesh or general tzedaka) and
   decisions.md says charities don't need it. But the `donations_read` policy lets a charity
   admin select the whole row through the API, including `giving_kind`. Hide it from charity
   admins (column privileges or a view such as `charity_donations`) and add a test that proves
   it. Check `message` and `is_anonymous` the same way.
2. **Anonymous donors.** "Anonymous" hides the name on public pages only; the charity still
   sees details (the checkout says so). The dashboard must follow that wording exactly.
3. **Full ID and tax numbers** are encrypted; the dashboard shows last 4 only. A reveal, if
   ever needed, must be logged like `revealBankAccount`.

## Suggested screens (confirm with Yehuda before building)

1. Overview: donations this month and this tax year, number of donors, monthly (recurring)
   donations, pending and failed, a simple chart by month.
2. Donations: searchable, filterable list (date, donor, amount, status, 18A, campaign),
   open one for detail; refunded and charged back clearly marked.
3. Donors: who gave, how much, how often, 18A requested; contact details they gave.
4. Monthly donations: active, paused, cancelled, failed.
5. Receipts: s18A receipts issued, download PDF (signed link, logged), status; shows
   "not yet issued" until the receipts job runs. Void and re-issue stays with the platform admin.
6. Payouts: what has settled to their bank account. Needs Paystack data we don't have yet
   (rates and sandbox access are still open): build the screen shell, label it clearly.
7. Exports: CSV of donations and donors for their bookkeeper.
8. Team: owner invites and removes their own admins. Needs a decision (see below).
9. Campaigns: tables exist, no screens (separate feature).

## Decisions needed from Yehuda

- Which screens are day one? (suggested: 1, 2, 3, 5, 7)
- Can a charity owner invite and remove their own team, or must every admin go through him?
- Should "admin" and "owner" see different things (for example only owners see donors' contact details)?
- Two-step login (authenticator app) for charity admins: yes or no? (recommended: yes)
- Language: English only, or English and Hebrew for charity pages?
- Anything a charity must NOT see that is not listed above?

## Security rules for this work

- Every query as the signed-in user (RLS decides); use the service role only for audited
  server work. A stranger gets "not found". Test with a second charity's admin trying to read
  the first charity's donations, donors and receipts, through the pages and through direct queries.
- Log in `audit_log` every export, every document or receipt download and every reveal.
- Rate limit exports. No personal data in logs or URLs.
- Keep the Paystack adapter boundary: nothing outside `src/lib/gateway` names a gateway.
- Run `npm test`, `npm run typecheck`, `npm run lint` before committing. Check pages at 375px wide.
