# Givezy

Charity giving for South Africa. Donors find registered charities on the website or in the phone app
(`apps/mobile`), give once or every month, and get one s18A receipt a year per charity. Each payment has
two separate lines: the gift to the charity and an optional contribution to Givezy. Payments are split by
the payment provider, so each gift goes straight into the chosen charity's own account (decided
13/10/2026); the charity pays the provider's fee out of its gift (14/10/2026). Charities get a dashboard;
Givezy staff get an admin area.

Decisions and why: `docs/decisions.md`. What is left before going live: `docs/go-live-checklist.md`.

## Running the website on your computer

You need Node.js 22 and Docker running.

1. `npm install`
2. `npm run db:start` starts a private copy of Supabase (database, sign-ins, an email catcher).
3. Copy `.env.example` to `.env.local`. Fill in the keys that `npx supabase status` prints, and make an
   `ENCRYPTION_KEY` with the command shown in the file.
4. `npm run db:reset` builds the database from `supabase/migrations` and loads the test data.
5. `npm run dev`, then open http://127.0.0.1:3000

Sign-in emails don't go out locally: read them at http://127.0.0.1:54324.

| Test login | Role |
|---|---|
| admin@nedivlev.test | Givezy admin |
| meals.admin@nedivlev.test | Owner, Northcliff Meals Fund |
| shul.admin@nedivlev.test | Owner, Glenhazel Shul Fund (no s18A) |
| donor@nedivlev.test | Donor with an account |

## Running the phone app

1. `cd apps/mobile && npm install`
2. Copy `apps/mobile/.env.example` to `apps/mobile/.env.local` and fill it in.
3. `npx expo start`, then open it in Expo Go.

Screenshots for review: `npx expo export --platform web`, serve `dist`, open with `?preview=iphone`.

## Checks (run all of them before committing)

- `npm test`: every test, including the database rules. It starts the local test database if it is
  stopped, and refuses to run (one plain message) if it still can't reach it. `npm run test:no-db` is only
  for a machine with no local database.
- `npm run typecheck` and `npm run lint` for the website.
- `cd apps/mobile && npx tsc --noEmit && npx eslint src` for the phone app.

The same checks run on GitHub for every push (`.github/workflows/checks.yml`).

## Deploying

The website is on Vercel; scheduled jobs call `/api/jobs/*` with `CRON_SECRET`. The yearly s18A receipts
run from Admin, s18A receipts (`npm run receipts` is a dry run and preview only). Database changes go to
the test project first, then live, in filename order. Nothing goes live without Yehuda's yes: see
`docs/go-live-checklist.md`.

## Where to find things

| Folder | What lives there |
|---|---|
| `src/app/` | Website pages, one folder per address |
| `src/app/page.tsx`, `charities/`, `c/[slug]/` | Home, the charity list, a charity's page and giving (`c/[slug]/donate`) |
| `src/app/donate/return/` | Where the payment provider sends the donor back: thank-you, declined, still confirming |
| `src/app/account/` | The donor's own area: giving, monthly donations, tax pack, their data |
| `src/app/charity-admin/[id]/` | The charity dashboard (donations, donors, campaigns, emails, receipts, team) |
| `src/app/admin/` | Givezy staff: charities, payments, receipts, privacy requests, cause of the week |
| `src/app/api/app/` | What the phone app calls on the server (quote, checkout, status) |
| `src/app/api/jobs/`, `api/webhooks/` | Scheduled jobs (monthly charges, payouts) and the payment provider's messages |
| `src/components/` | Shared website parts: cards, form fields, the "what just happened" panel, badges |
| `src/config/` | `platform.ts` (every fee, VAT, minimum and tax-year value), legal and receipt settings |
| `src/lib/` | The logic, with no pages in it: money, dates, CSV and Excel, sign-in, rate limits |
| `src/lib/donations/` | Checkout, confirming payments, monthly giving, refunds, payouts |
| `src/lib/charity/` | Dashboard logic. Plain names (and `-rules`) are pure rules; `-store`, `-queries` and `-send` read or write the database |
| `src/lib/receipts/`, `tax-pack/`, `privacy/` | s18A receipts, the donor's yearly tax pack, erasure and data export |
| `src/lib/gateway/` | The only place a payment provider is named |
| `src/lib/supabase/` | Database clients (the service-role one is server-only) |
| `apps/mobile/src/` | The phone app: `app/` screens, `components/`, `lib/`, `theme/tokens.ts` (its colours) |
| `supabase/migrations/` | Every table and access rule, applied in filename order |
| `scripts/` | Test data (`seed.ts`), the receipts dry run, starting the local database |
| `tests/` | `*-db.test.ts` need the local database; `app-*.test.ts` test the phone app's logic |
| `docs/` | Decisions, the go-live checklist, the payment-provider test script, previews |

Shared between the website and the app (kept free of other packages): `src/lib/money.ts`,
`charity/initials.ts`, `charity/suggested-amounts.ts`, `donations/labels.ts`, `glossary.ts`,
`policy.ts`, `sa-id.ts`.

Colours live only in `src/app/globals.css` (website), `apps/mobile/src/theme/tokens.ts` (app) and
`src/lib/brand-colors.ts` (receipt PDFs and emails); change all three together.
