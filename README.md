# NEDIV lev

Charity giving platform for the Johannesburg Jewish community. Donors find
charities in the phone app (`apps/mobile`) and pay only on the website. Each
payment has two separate line items: the donation to the charity and an
optional contribution to NEDIV lev. Whether the gateway pays the charity
directly (split payment) or NEDIV lev pays charities out is still open.

## Running it on your computer

You need Node.js 22 and Docker Desktop running.

1. `npm install`
2. `npm run db:start` starts a private copy of Supabase (database, logins, email catcher).
3. Copy `.env.example` to `.env.local`. Fill in the keys that `npx supabase status` prints, and generate an `ENCRYPTION_KEY` with the command shown in the file.
4. `npm run db:reset` builds the database and loads the test data.
5. `npm run dev`, then open http://127.0.0.1:3000

Sign-in emails don't go out locally. Open http://127.0.0.1:54324 to read them.

Test logins (sign in with the email; the link arrives in the email catcher):

| Email | Role |
|---|---|
| admin@nedivlev.test | Platform admin |
| meals.admin@nedivlev.test | Charity admin, Northcliff Meals Fund |
| shul.admin@nedivlev.test | Charity admin, Glenhazel Shul Fund (non-s18A) |
| donor@nedivlev.test | Donor with an account |

## Checks

- `npm test` runs money, date and database-rule tests (needs the local database running and seeded).
- `npm run typecheck` and `npm run lint`

## Where things live

- `src/config/platform.ts` holds every fee, VAT, minimum and tax-year setting. Nothing else may hard-code them.
- `src/lib/money.ts` handles Rand formatting and exact cents and percentage maths (no floats).
- `src/lib/dates.ts` handles dd/mm/yyyy formatting and SARS tax years.
- `supabase/migrations/` holds the database tables and the access rules.
- `docs/decisions.md` records design decisions and open questions.
