@AGENTS.md

# Open Hand: project rules

- The build brief is the source of truth; `docs/decisions.md` records changes and open questions.
- Money is integer cents (bigint) in ZAR. Percentages are integer ppm. Never floats.
- Fee, VAT, minimum and tax-year values live only in `src/config/platform.ts`.
- Display: `R1 250.00`, dd/mm/yyyy, SA English, Johannesburg time.
- Never invent a fee or rate. Gateway rates stay null until Yehuda supplies them.
- Nothing outside the gateway adapter may reference a specific gateway.
- Every table has row-level security. Money and receipt writes are server-only (service role).
- Hebrew text: `lang="he" dir="rtl"`. Check pages at 375px wide.
- Run `npm test`, `npm run typecheck` and `npm run lint` before committing.

# Phone app (apps/mobile)

- Expo + Expo Router (routes in `apps/mobile/src/app`). Donor-facing; charity and admin screens stay on the website.
- Design bible tokens live only in `apps/mobile/src/theme/tokens.ts`. Follow `apps/mobile/AGENTS.md` for Expo rules.
- Fee maths is shared with the website: the app imports `src/lib/fees.ts` and `src/lib/money.ts` (keep them dependency-free).
- `apps/mobile/src/config/fees.ts` holds SAMPLE gateway rates for mock screens only, labelled on screen. Never ship them.
- Review screenshots: `npx expo export --platform web`, serve `dist`, open with `?preview=iphone`.
