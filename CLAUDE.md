@AGENTS.md

# Nadiv Lev: project rules

- The build brief is the source of truth; `docs/decisions.md` records changes and open questions.
- Money is integer cents (bigint) in ZAR. Percentages are integer ppm. Never floats.
- Fee, VAT, minimum and tax-year values live only in `src/config/platform.ts`.
- Display: `R1 250.00`, dd/mm/yyyy, SA English, Johannesburg time.
- Never invent a fee or rate. Gateway rates stay null until Yehuda supplies them.
- Nothing outside the gateway adapter may reference a specific gateway.
- Every table has row-level security. Money and receipt writes are server-only (service role).
- Hebrew text: `lang="he" dir="rtl"`. Check pages at 375px wide.
- Brand: the Nadiv Lev brand kit. The name is always "Nadiv Lev". Colours live only in `src/app/globals.css` and `apps/mobile/src/theme/tokens.ts`: cream pages, ink text, indigo headlines, deep coral for buttons and links, one coral accent per screen, sage for progress and the s18A badge. Fraunces (600, 20 px and up) for headlines, Inter for everything else, Heebo for Hebrew. Sentence case, no all-caps buttons, no exclamation marks. Write "s18A receipt".
- Run `npm test`, `npm run typecheck` and `npm run lint` before committing.

# Phone app (apps/mobile)

- Expo + Expo Router (routes in `apps/mobile/src/app`). Donor-facing; charity and admin screens stay on the website.
- Brand tokens live only in `apps/mobile/src/theme/tokens.ts`. Follow `apps/mobile/AGENTS.md` for Expo rules.
- The app never takes payments (App Store rule): no amount to pay, card fields or pay button. "Give on our website" opens the browser.
- `src/lib/fees.ts` and `src/lib/money.ts` stay dependency-free so the app can share them.
- Review screenshots: `npx expo export --platform web`, serve `dist`, open with `?preview=iphone`.
